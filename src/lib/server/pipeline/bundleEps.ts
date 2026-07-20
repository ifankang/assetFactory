import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { WorkflowConfig } from '$lib/types';

const execFileAsync = promisify(execFile);

const INKSCAPE_PATHS = [
	'inkscape', // check PATH
	'E:\\Inkscape\\bin\\inkscape.exe', // user's custom installation
	'C:\\Program Files\\Inkscape\\bin\\inkscape.exe', // standard Windows 1.0+ installation
	'C:\\Program Files\\Inkscape\\inkscape.exe' // older Windows installation
];

let resolvedInkscapePath: string | null = null;

/**
 * Check whether Inkscape is available on the system, considering custom config paths.
 */
async function getInkscapePath(config?: WorkflowConfig): Promise<string | null> {
	if (config?.inkscapePath) {
		let pathCandidate = config.inkscapePath;
		// Normalize: if it ends with a slash or doesn't end with inkscape.exe / inkscape, append executable name
		if (pathCandidate.endsWith('\\') || pathCandidate.endsWith('/')) {
			pathCandidate += 'inkscape.exe';
		} else if (!pathCandidate.toLowerCase().endsWith('inkscape.exe') && !pathCandidate.toLowerCase().endsWith('inkscape')) {
			pathCandidate += '\\inkscape.exe';
		}

		try {
			await execFileAsync(pathCandidate, ['--version']);
			return pathCandidate;
		} catch {
			// Fallback to standard check
		}
	}

	if (resolvedInkscapePath !== null) return resolvedInkscapePath;

	for (const p of INKSCAPE_PATHS) {
		try {
			await execFileAsync(p, ['--version']);
			resolvedInkscapePath = p;
			return p;
		} catch {
			// try next
		}
	}
	return null;
}

/**
 * Convert a single SVG file to EPS via Inkscape CLI.
 */
async function convertSvgToEps(inkscapePath: string, svgPath: string, epsPath: string): Promise<void> {
	await execFileAsync(inkscapePath, [svgPath, '--export-filename', epsPath]);
}

/**
 * Bundle an array of SVG strings into individual SVG (and optionally EPS) files.
 */
export async function bundleToEps(
	svgStrings: string[],
	config: WorkflowConfig,
	promptId: number
): Promise<string> {
	const promptDir = join(config.outputFolder, `prompt_${promptId}`);
	await mkdir(promptDir, { recursive: true });

	// 1. Write individual SVG files
	const svgPaths: string[] = [];
	for (let i = 0; i < svgStrings.length; i++) {
		const svgPath = join(promptDir, `svg_${i}.svg`);
		await writeFile(svgPath, svgStrings[i], 'utf-8');
		svgPaths.push(svgPath);
	}

	// 2. Generate and write the bundled grid SVG containing all SVGs combined
	const cols = config.gridSize?.cols || 3;
	const rows = config.gridSize?.rows || 3;

	let cellW = 10240;
	let cellH = 10240;

	// Attempt to extract dimensions from the first SVG to keep alignment correct
	if (svgStrings.length > 0) {
		const viewBoxMatch = svgStrings[0].match(/viewBox=["']\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*["']/i);
		if (viewBoxMatch) {
			cellW = parseFloat(viewBoxMatch[3]);
			cellH = parseFloat(viewBoxMatch[4]);
		}
	}

	const groupedContents: string[] = [];
	for (let i = 0; i < svgStrings.length; i++) {
		const row = Math.floor(i / cols);
		const col = i % cols;
		const x = col * cellW;
		const y = row * cellH;

		// Extract inner content inside the <svg> wrapper
		const match = svgStrings[i].match(/<svg[^>]*>([\s\S]*?)<\/svg>/i);
		const innerContent = match ? match[1].trim() : '';

		if (innerContent) {
			groupedContents.push(`\t<g transform="translate(${x}, ${y})">\n\t\t${innerContent}\n\t</g>`);
		}
	}

	const masterViewBox = `0 0 ${cols * cellW} ${rows * cellH}`;
	const bundleSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${masterViewBox}" width="${cols * (cellW / 10)}" height="${rows * (cellH / 10)}">
${groupedContents.join('\n')}
</svg>`;

	const bundleSvgPath = join(promptDir, 'bundle.svg');
	await writeFile(bundleSvgPath, bundleSvg, 'utf-8');

	// 3. Attempt EPS conversion via Inkscape if enabled
	if (config.inkscapeEnabled !== false) {
		const inkscapePath = await getInkscapePath(config);

		if (inkscapePath) {
			// Convert individual SVGs
			for (let i = 0; i < svgPaths.length; i++) {
				const epsPath = join(promptDir, `eps_${i}.eps`);
				try {
					await convertSvgToEps(inkscapePath, svgPaths[i], epsPath);
				} catch (err) {
					console.warn(
						`[bundleEps] Failed to convert svg_${i}.svg to EPS:`,
						err instanceof Error ? err.message : err
					);
				}
			}

			// Convert bundled SVG to bundled EPS!
			const bundleEpsPath = join(promptDir, 'bundle.eps');
			try {
				await convertSvgToEps(inkscapePath, bundleSvgPath, bundleEpsPath);
				console.log('[bundleEps] Successfully created bundled EPS at:', bundleEpsPath);
			} catch (err) {
				console.warn(
					`[bundleEps] Failed to convert bundle.svg to EPS:`,
					err instanceof Error ? err.message : err
				);
			}
		} else {
			console.warn(
				'[bundleEps] Inkscape not found on system — skipping EPS conversion. SVG files were saved successfully.'
			);
		}
	} else {
		console.log('[bundleEps] Inkscape is disabled — skipping EPS conversion.');
	}

	return promptDir;
}
