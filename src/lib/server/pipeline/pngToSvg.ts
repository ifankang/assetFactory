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
		const { default: potrace } = await import('potrace');
		
		// Downscale the smooth PNG to 512x512 specifically for Potrace.
		// Since Potrace is a pure JavaScript port, tracing 1024x1024 images is extremely slow.
		// Downscaling makes it trace 8x faster while Potrace's mathematical curve-fitting maintains perfect smoothness.
		const potracePngBuffer = await sharp(smoothPngBuffer)
			.resize(512, 512, { fit: 'contain' })
			.png()
			.toBuffer();

		rawSvg = await new Promise<string>((resolve, reject) => {
			// steps: 4 is fast, looks clean, and avoids threshold warnings
			potrace.posterize(potracePngBuffer, { steps: 4 }, (err, svg) => {
				if (err) return reject(err);
				resolve(svg);
			});
		});
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
