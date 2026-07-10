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

	// Write all SVG files first
	const svgPaths: string[] = [];
	for (let i = 0; i < svgStrings.length; i++) {
		const svgPath = join(promptDir, `svg_${i}.svg`);
		await writeFile(svgPath, svgStrings[i], 'utf-8');
		svgPaths.push(svgPath);
	}

	// Attempt EPS conversion via Inkscape if enabled
	if (config.inkscapeEnabled !== false) {
		const inkscapePath = await getInkscapePath(config);

		if (inkscapePath) {
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
