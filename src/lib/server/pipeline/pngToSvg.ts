import type { WorkflowConfig } from '$lib/types';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, unlink } from 'fs/promises';
import { join } from 'path';

const execFileAsync = promisify(execFile);

/**
 * Resolve the Inkscape CLI command wrapper path (.com) based on user configuration.
 */
async function getInkscapeComPath(config?: WorkflowConfig): Promise<string> {
	if (config?.inkscapePath) {
		let pathCandidate = config.inkscapePath;
		// Normalize
		if (pathCandidate.endsWith('\\') || pathCandidate.endsWith('/')) {
			pathCandidate += 'inkscape.com';
		} else if (!pathCandidate.toLowerCase().endsWith('inkscape.com') && !pathCandidate.toLowerCase().endsWith('inkscape.exe') && !pathCandidate.toLowerCase().endsWith('inkscape')) {
			pathCandidate += '\\inkscape.com';
		} else if (pathCandidate.toLowerCase().endsWith('inkscape.exe')) {
			pathCandidate = pathCandidate.replace(/\.exe$/i, '.com');
		}
		return pathCandidate;
	}
	return 'inkscape.com';
}

export async function convertToSvg(pngBuffer: Buffer, config?: WorkflowConfig): Promise<string> {
	// Dynamically import to avoid loading native DLLs at startup
	const { vectorize, optimize, ColorMode, Hierarchical, PathSimplifyMode } = await import('@neplex/vectorizer');
	const { default: sharp } = await import('sharp');

	// 1. Upscale the crop cell (e.g. 341x341) to a high-res 1024x1024 image
	const upscaled = sharp(pngBuffer)
		.resize(1024, 1024, {
			kernel: 'lanczos3',
			fit: 'contain',
			background: { r: 0, g: 0, b: 0, alpha: 0 }
		});

	// 2. Perform alpha smoothing to eliminate jagged staircase pixel boundaries
	// We blur the alpha channel and threshold it at 50% opacity to create a perfectly rounded binary mask.
	const alphaMask = await upscaled
		.clone()
		.extractChannel('alpha')
		.blur(12)           // Increased from 6 to melt away wobbly ripples on the sticker outlines
		.threshold(128)     // Converts back to a sharp, binary mask (no semi-transparent edge rings)
		.png()
		.toBuffer();

	// 3. Simplify internal colors and smooth outlines using a Median Filter & Blur
	// We composite the smoothed alpha mask back onto the simplified image using 'dest-in' blend mode.
	const smoothPngBuffer = await upscaled
		.clone()
		.median(5)          // Simplifies colors and smooths out hand-drawn bumps
		.blur(1.5)          // Softens organic wobbles and brush stroke textures for smooth curves
		.composite([{
			input: alphaMask,
			blend: 'dest-in'  // Keeps destination pixels only where the alpha mask is opaque
		}])
		.png()
		.toBuffer();

	// 4. Vectorize the preprocessed high-fidelity PNG using the selected engine
	let rawSvg: string;

	if (config?.vectorizerEngine === 'inkscape') {
		const inkscapeBin = await getInkscapeComPath(config);
		const rand = Math.random().toString(36).substring(7);
		const tempPng = join(config.outputFolder || './output', `temp_trace_${rand}.png`);
		const tempSvg = join(config.outputFolder || './output', `temp_trace_${rand}.svg`);

		try {
			await writeFile(tempPng, smoothPngBuffer);

			// Run Inkscape object-trace CLI action (traces 8 colors/scans, smooth, remove background, speckle filter size 4, smooth corners 1.0, optimize 0.20)
			const actionsStr = `select-all;object-trace:8,true,true,true,4,1.0,0.20;export-filename:${tempSvg};export-do`;
			await execFileAsync(inkscapeBin, [tempPng, '--actions', actionsStr]);

			rawSvg = await readFile(tempSvg, 'utf-8');
		} finally {
			await unlink(tempPng).catch(() => {});
			await unlink(tempSvg).catch(() => {});
		}
	} else if (config?.vectorizerEngine === 'potrace') {
		const { buildPaletteSync, applyPaletteSync, utils } = await import('image-q');
		const { default: potrace } = await import('potrace');

		// 1. Get original dimensions from smooth PNG
		const metadata = await sharp(smoothPngBuffer).metadata();
		const width = metadata.width || 512;
		const height = metadata.height || 512;

		// 2. Extract raw RGBA pixels from the smoothed image buffer
		const { data: rawPixelData } = await sharp(smoothPngBuffer)
			.ensureAlpha()
			.raw()
			.toBuffer({ resolveWithObject: true });

		// 3. Convert raw pixel buffer to image-q PointContainer
		const inPointContainer = utils.PointContainer.fromUint8Array(
			new Uint8Array(rawPixelData),
			width,
			height
		);

		// 4. Build palette and quantize colors
		const maxColors = config?.colorLimit || 8;
		const palette = buildPaletteSync([inPointContainer], { colors: maxColors });
		const resultContainer = applyPaletteSync(inPointContainer, palette);
		const resultPixels = resultContainer.toUint8Array();

		const paletteColors = palette.getPointContainer().getPointArray();
		const innerContents: string[] = [];

		// 5. Separate and trace each color layer
		for (let idx = 0; idx < paletteColors.length; idx++) {
			const c = paletteColors[idx];
			
			// Skip transparent layers to avoid tracing empty background space
			if (c.a < 128) {
				continue;
			}

			const rHex = c.r.toString(16).padStart(2, '0');
			const gHex = c.g.toString(16).padStart(2, '0');
			const bHex = c.b.toString(16).padStart(2, '0');
			const hexColor = `#${rHex}${gHex}${bHex}`;

			// Create a monochrome mask: matching = 0 (black/ink), non-matching = 255 (white/background)
			const maskBuffer = Buffer.alloc(width * height);
			let matches = 0;
			for (let i = 0; i < width * height; i++) {
				const pr = resultPixels[i * 4];
				const pg = resultPixels[i * 4 + 1];
				const pb = resultPixels[i * 4 + 2];
				const pa = resultPixels[i * 4 + 3];

				if (pr === c.r && pg === c.g && pb === c.b && pa === c.a) {
					maskBuffer[i] = 0;
					matches++;
				} else {
					maskBuffer[i] = 255;
				}
			}

			// Skip tracing if no pixels matched this color (prevents empty paths/trace failures)
			if (matches === 0) {
				continue;
			}

			try {
				// Convert monochrome mask to a PNG buffer in memory
				const pngMask = await sharp(maskBuffer, {
					raw: {
						width,
						height,
						channels: 1
					}
				})
				.png()
				.toBuffer();

				// Trace color mask using potrace with designated color code
				const svgString = await new Promise<string>((resolve, reject) => {
					potrace.trace(pngMask, { color: hexColor }, (err, svg) => {
						if (err) return reject(err);
						resolve(svg);
					});
				});

				// Extract inner content inside the <svg> wrapper (like <g fill="#..."> <path ... /> </g>)
				const innerContent = svgString.replace(/<\/?svg[^>]*>/gi, '').trim();
				if (innerContent) {
					innerContents.push(innerContent);
				}
			} catch (traceError) {
				// Gracefully handle trace exceptions for individual color layers per operational constraints
				console.error(`[potrace] Failed to trace layer ${hexColor}:`, traceError);
			}
		}

		// Compose final SVG using original viewBox dimensions
		rawSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
${innerContents.join('\n')}
</svg>`;
	} else {
		// Default to VTracer (Clean Sticker Profile)
		rawSvg = await vectorize(smoothPngBuffer, {
			colorMode: ColorMode.Color,
			colorPrecision: 6,        // Quantize colors to prevent minor noise rings
			filterSpeckle: 8,         // Discard minor pixel remnants
			spliceThreshold: 55,      // Smooth spline connections
			cornerThreshold: 75,      // Smooth out wavy outline bends
			hierarchical: Hierarchical.Stacked,
			mode: PathSimplifyMode.Spline,
			layerDifference: 32,      // Merge close shades (removes topographical face rings)
			lengthThreshold: 8.0,     // Increased from 6.0 to force longer, smoother bezier curves
			maxIterations: 12,        // Increased from 10 for more precise spline smoothing
			pathPrecision: 3          // Float precision coordinates
		});
	}

	// 5. Optimize SVG output using the built-in Rust-powered oxvg optimizer
	const optimizedSvg = await optimize(rawSvg, {
		plugins: ['preset-default', { name: 'removeTitle' }],
		multipass: true,
		multipassIterations: 5
	});

	return optimizedSvg;
}
