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

/**
 * Fills all internal holes inside a 1-channel binary mask using flood-fill.
 * Uses a low threshold to preserve thin, semi-transparent details like handles.
 */
function fillInternalHoles(mask: Buffer, width: number, height: number): Buffer {
	const size = width * height;
	const visited = new Uint8Array(size); // 0 = unvisited, 1 = reachable background, 2 = foreground
	
	// Pre-classify foreground pixels (alpha > 20 to keep thin details)
	for (let i = 0; i < size; i++) {
		if (mask[i] > 20) {
			visited[i] = 2; // Foreground
		}
	}
	
	const queue = new Int32Array(size);
	let head = 0;
	let tail = 0;
	
	// Seed the queue from outer borders
	for (let x = 0; x < width; x++) {
		const topIdx = x;
		if (visited[topIdx] === 0) {
			visited[topIdx] = 1;
			queue[tail++] = topIdx;
		}
		const botIdx = (height - 1) * width + x;
		if (visited[botIdx] === 0) {
			visited[botIdx] = 1;
			queue[tail++] = botIdx;
		}
	}
	for (let y = 1; y < height - 1; y++) {
		const leftIdx = y * width;
		if (visited[leftIdx] === 0) {
			visited[leftIdx] = 1;
			queue[tail++] = leftIdx;
		}
		const rightIdx = y * width + (width - 1);
		if (visited[rightIdx] === 0) {
			visited[rightIdx] = 1;
			queue[tail++] = rightIdx;
		}
	}
	
	// Run breadth-first search to label reachable background pixels
	const dirs = [-1, 1, -width, width];
	while (head < tail) {
		const idx = queue[head++];
		const x = idx % width;
		
		for (const d of dirs) {
			const nIdx = idx + d;
			if (d === -1 && x === 0) continue;
			if (d === 1 && x === width - 1) continue;
			if (nIdx < 0 || nIdx >= size) continue;
			
			if (visited[nIdx] === 0) {
				visited[nIdx] = 1;
				queue[tail++] = nIdx;
			}
		}
	}
	
	// Create the repaired mask: anything not reachable from outer edges is foreground (solidifies holes)
	const result = Buffer.alloc(size);
	for (let i = 0; i < size; i++) {
		if (visited[i] !== 1) {
			result[i] = 255; // Foreground
		} else {
			result[i] = 0;   // Background
		}
	}
	
	return result;
}

/**
 * Repairs the foreground mask using flood-fill and morphological closing.
 */
async function repairMask(alphaMaskBuffer: Buffer, width: number, height: number, sharpInstance: any): Promise<Buffer> {
	// 1. Fill internal holes
	const filled = fillInternalHoles(alphaMaskBuffer, width, height);

	// 2. Morphological Closing (Dilation then Erosion) to bridge tiny gaps
	const dilated = await sharpInstance(filled, { raw: { width, height, channels: 1 } })
		.blur(2)
		.threshold(40) // low threshold to dilate
		.raw()
		.toBuffer();

	const closed = await sharpInstance(dilated, { raw: { width, height, channels: 1 } })
		.blur(2)
		.threshold(215) // high threshold to erode back
		.raw()
		.toBuffer();

	// 3. Final smooth thresholding and noise removal
	const finalMask = await sharpInstance(closed, { raw: { width, height, channels: 1 } })
		.median(5)
		.blur(1.5)
		.threshold(128)
		.raw()
		.toBuffer();

	return finalMask;
}

export async function convertToSvg(pngBuffer: Buffer, config?: WorkflowConfig, originalPngBuffer?: Buffer): Promise<string> {
	// Dynamically import to avoid loading native DLLs at startup
	const { vectorize, optimize, ColorMode, Hierarchical, PathSimplifyMode } = await import('@neplex/vectorizer');
	const { default: sharp } = await import('sharp');

	let rawSvg: string;

	if (config?.vectorizerEngine === 'potrace') {
		const { buildPaletteSync, applyPaletteSync, utils } = await import('image-q');
		const { default: potrace } = await import('potrace');

		const width = 1024;
		const height = 1024;

		// 1. Ingest & Extract Foreground Segmentation Mask from pngBuffer (cutout) and repair it
		const rawAlphaMask = await sharp(pngBuffer)
			.resize(width, height, {
				kernel: 'lanczos3',
				fit: 'contain',
				background: { r: 0, g: 0, b: 0, alpha: 0 }
			})
			.extractChannel('alpha')
			.raw()
			.toBuffer();

		const repairedAlphaMask = await repairMask(rawAlphaMask, width, height, sharp);

		// 2. Color Processing on ORIGINAL PNG (originalPngBuffer)
		const originalSource = originalPngBuffer || pngBuffer;
		const { data: rawPixelData } = await sharp(originalSource)
			.resize(width, height, {
				kernel: 'lanczos3',
				fit: 'contain',
				background: { r: 0, g: 0, b: 0, alpha: 0 }
			})
			.blur(0.8)          // Light Gaussian blur for anti-aliasing and noise reduction
			.ensureAlpha()      // Guarantee 4 channels (RGBA)
			.raw()
			.toBuffer({ resolveWithObject: true });

		// 3. High-quality Color Quantization (Do not quantize transparent pixels)
		// We sample points exclusively from the repaired foreground mask
		const fgPixels: number[] = [];
		for (let i = 0; i < width * height; i++) {
			if (repairedAlphaMask[i] > 128) {
				fgPixels.push(
					rawPixelData[i * 4],
					rawPixelData[i * 4 + 1],
					rawPixelData[i * 4 + 2],
					rawPixelData[i * 4 + 3]
				);
			}
		}

		// Fallback if the mask is empty
		const quantizeBuffer = fgPixels.length > 0 
			? new Uint8Array(fgPixels) 
			: new Uint8Array(rawPixelData);

		const inPointContainer = utils.PointContainer.fromUint8Array(
			quantizeBuffer,
			quantizeBuffer.length / 4,
			1
		);

		const maxColors = config?.colorLimit || 8;
		const palette = buildPaletteSync([inPointContainer], { colors: maxColors });

		// Map original pixels to the generated palette
		const fullOriginalContainer = utils.PointContainer.fromUint8Array(
			new Uint8Array(rawPixelData),
			width,
			height
		);
		const resultContainer = applyPaletteSync(fullOriginalContainer, palette);
		const resultPixels = resultContainer.toUint8Array();

		const paletteColors = palette.getPointContainer().getPointArray();
		const layers = [];

		// 4. Region Processing: Generate separate layers for each quantized color
		for (let idx = 0; idx < paletteColors.length; idx++) {
			const c = paletteColors[idx];
			
			// Skip transparent colors
			if (c.a < 128) {
				continue;
			}

			// Generate 1-channel binary mask: matching = 0 (black/ink), non-matching = 255 (white/background)
			// Apply repaired foreground mask so background is kept white (255)
			const maskBuffer = Buffer.alloc(width * height);
			let matches = 0;
			for (let i = 0; i < width * height; i++) {
				const pr = resultPixels[i * 4];
				const pg = resultPixels[i * 4 + 1];
				const pb = resultPixels[i * 4 + 2];
				const pa = resultPixels[i * 4 + 3];
				const maskVal = repairedAlphaMask[i]; // Use repaired mask

				if (pr === c.r && pg === c.g && pb === c.b && maskVal > 128) {
					maskBuffer[i] = 0; // black (ink to trace)
					matches++;
				} else {
					maskBuffer[i] = 255; // white (background)
				}
			}

			if (matches > 0) {
				layers.push({
					color: c,
					maskBuffer,
					matches
				});
			}
		}

		// Sort layers from largest area to smallest (helps eliminate gaps and overlaps by stacking smaller layers on top)
		layers.sort((a, b) => b.matches - a.matches);

		const innerContents: string[] = [];

		// 5. Vectorization: Trace each binary region using Potrace
		for (const layer of layers) {
			const c = layer.color;
			const rHex = c.r.toString(16).padStart(2, '0');
			const gHex = c.g.toString(16).padStart(2, '0');
			const bHex = c.b.toString(16).padStart(2, '0');
			const hexColor = `#${rHex}${gHex}${bHex}`;

			try {
				// Clean binary mask (remove tiny speckles and smooth wobbly edges)
				const cleanedMask = await sharp(layer.maskBuffer, {
					raw: { width, height, channels: 1 }
				})
				.median(5)     // Clear noise speckles
				.blur(1.5)     // Soften edge steps to produce smooth curves
				.threshold(128)
				.png()
				.toBuffer();

				// Trace color mask using potrace with smooth curve parameters tuned close to Inkscape
				const svgString = await new Promise<string>((resolve, reject) => {
					potrace.trace(cleanedMask, {
						color: hexColor,
						turdSize: 3,         // Discard minor noise fragments
						alphaMax: 1.25,      // Smoother curves and corners
						optCurve: true,      // Enable curve optimization
						optTolerance: 0.2    // High curve fitting accuracy
					}, (err, svg) => {
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
				console.error(`[potrace] Failed to trace layer ${hexColor}:`, traceError);
			}
		}

		// Compose final SVG using original viewBox dimensions
		rawSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
${innerContents.join('\n')}
</svg>`;
	} else {
		// --- PREEXISTING PROCESSING FOR INKSCAPE AND VTRACER ---
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
	}

	// 5. Optimize SVG output using the built-in Rust-powered oxvg optimizer (Post Processing)
	let plugins: any[] = ['preset-default', { name: 'removeTitle' }];
	if (config?.vectorizerEngine === 'potrace') {
		plugins = [
			'preset-default',
			{ name: 'removeTitle' },
			{
				name: 'convertPathData',
				params: {
					floatPrecision: 2, // Rounds coordinate values to clean zig-zags and simplify curves
					transformPrecision: 3
				}
			},
			{
				name: 'cleanupNumericValues',
				params: {
					floatPrecision: 2
				}
			}
		];
	}

	const optimizedSvg = await optimize(rawSvg, {
		plugins,
		multipass: true,
		multipassIterations: 5
	});

	return optimizedSvg;
}
