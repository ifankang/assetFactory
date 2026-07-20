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
	
	// Pre-classify foreground pixels (values set to 255 in combinedMask)
	for (let i = 0; i < size; i++) {
		if (mask[i] > 128) {
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
 * Repairs the foreground mask using flood-fill and morphological closing,
 * combined with color distance thresholding to preserve thin structures.
 */
async function repairMask(
	alphaMaskBuffer: Buffer,
	rawPixelData: Uint8Array,
	width: number,
	height: number,
	sharpInstance: any
): Promise<Buffer> {
	const size = width * height;
	
	// 1. Sample background color from 4 corners of original image
	const getPixel = (x: number, y: number) => {
		const idx = (y * width + x) * 4;
		return {
			r: rawPixelData[idx],
			g: rawPixelData[idx + 1],
			b: rawPixelData[idx + 2]
		};
	};
	
	// Sample slightly offset from the absolute corners to avoid border artifacts
	const c1 = getPixel(4, 4);
	const c2 = getPixel(width - 5, 4);
	const c3 = getPixel(4, height - 5);
	const c4 = getPixel(width - 5, height - 5);
	const bgR = (c1.r + c2.r + c3.r + c4.r) / 4;
	const bgG = (c1.g + c2.g + c3.g + c4.g) / 4;
	const bgB = (c1.b + c2.b + c3.b + c4.b) / 4;

	// 2. Generate a combined mask using both AI segmentation alpha and color difference
	const combinedMask = Buffer.alloc(size);
	for (let i = 0; i < size; i++) {
		const r = rawPixelData[i * 4];
		const g = rawPixelData[i * 4 + 1];
		const b = rawPixelData[i * 4 + 2];
		
		const dist = Math.sqrt(
			(r - bgR) ** 2 +
			(g - bgG) ** 2 +
			(b - bgB) ** 2
		);
		
		// Threshold: 35. If color is distinct from background (dist > 35) OR AI says it's foreground (alpha > 20)
		if (dist > 35 || alphaMaskBuffer[i] > 20) {
			combinedMask[i] = 255;
		} else {
			combinedMask[i] = 0;
		}
	}

	// 3. Fill internal holes
	const filled = fillInternalHoles(combinedMask, width, height);

	// 4. Morphological Closing (Dilation then Erosion) to bridge tiny gaps
	const dilated = await sharpInstance(filled, { raw: { width, height, channels: 1 } })
		.blur(1.5)
		.threshold(40) // low threshold to dilate
		.raw()
		.toBuffer();

	const closed = await sharpInstance(dilated, { raw: { width, height, channels: 1 } })
		.blur(1.5)
		.threshold(215) // high threshold to erode back
		.raw()
		.toBuffer();

	// 5. Final smooth thresholding and noise removal
	const finalMask = await sharpInstance(closed, { raw: { width, height, channels: 1 } })
		.median(5)
		.blur(1)
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
		const { trace } = await import('@vectrace/trace');
		const { pixelsToRgbMap } = await import('@vectrace/loader');

		const width = 1024;
		const height = 1024;

		// 1. Color Processing on ORIGINAL PNG (originalPngBuffer)
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

		// 2. Ingest & Extract Foreground Segmentation Mask from pngBuffer (cutout) and repair it
		const rawAlphaMask = await sharp(pngBuffer)
			.resize(width, height, {
				kernel: 'lanczos3',
				fit: 'contain',
				background: { r: 0, g: 0, b: 0, alpha: 0 }
			})
			.extractChannel('alpha')
			.raw()
			.toBuffer();

		const repairedAlphaMask = await repairMask(rawAlphaMask, rawPixelData, width, height, sharp);

		// 3. Prepare clean pixels: replace background pixels (repairedAlphaMask <= 128) with white (255, 255, 255, 255)
		const cleanPixelData = new Uint8ClampedArray(width * height * 4);
		for (let i = 0; i < width * height; i++) {
			const idx = i * 4;
			if (repairedAlphaMask[i] > 128) {
				cleanPixelData[idx] = rawPixelData[idx];
				cleanPixelData[idx + 1] = rawPixelData[idx + 1];
				cleanPixelData[idx + 2] = rawPixelData[idx + 2];
				cleanPixelData[idx + 3] = rawPixelData[idx + 3];
			} else {
				// Pure white background
				cleanPixelData[idx] = 255;
				cleanPixelData[idx + 1] = 255;
				cleanPixelData[idx + 2] = 255;
				cleanPixelData[idx + 3] = 255;
			}
		}

		// 4. Load RgbMap
		const rgbMap = pixelsToRgbMap(width, height, cleanPixelData);

		// 5. Trace using @vectrace/trace
		const maxColors = config?.colorLimit || 8;
		const traceParams = {
			mode: 'QUANT_COLOR' as const,
			invert: false,
			brightnessThreshold: 0.45,
			brightnessFloor: 0.0,
			cannyHighThreshold: 0.65,
			quantizationColors: maxColors,
			multiScanColors: maxColors,
			multiScanStack: true,
			multiScanSmooth: false,
			multiScanRemoveBackground: true,
			turdsize: 3,
			alphamax: 1.25,
			opticurve: 1,
			opttolerance: 0.2
		};

		const results = await trace(rgbMap, traceParams);

		// 6. Compose final SVG using original viewBox dimensions
		const innerContents = results
			.map((e) => `<path fill="${e.fill}" d="${e.paths}"/>`)
			.join('\n');

		rawSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width * 10} ${height * 10}" width="${width}" height="${height}">
${innerContents}
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
