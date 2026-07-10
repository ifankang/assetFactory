import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const INKSCAPE_PATHS = [
	'inkscape', // check PATH
	'E:\\Inkscape\\bin\\inkscape.exe', // user's custom installation
	'C:\\Program Files\\Inkscape\\bin\\inkscape.exe', // standard Windows 1.0+ installation
	'C:\\Program Files\\Inkscape\\inkscape.exe' // older Windows installation
];

let resolvedInkscapePath: string | null = null;

/**
 * Check whether Inkscape is available on the system.
 */
async function getInkscapePath(): Promise<string | null> {
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
 *
 * Directory structure created:
 *   <outputFolder>/prompt_<promptId>/svg_0.svg
 *   <outputFolder>/prompt_<promptId>/eps_0.eps   (if Inkscape is available)
 *
 * Returns the path to the prompt's output folder.
 */
export async function bundleToEps(
	svgStrings: string[],
	outputFolder: string,
	promptId: number
): Promise<string> {
	const promptDir = join(outputFolder, `prompt_${promptId}`);
	await mkdir(promptDir, { recursive: true });

	// Write all SVG files first
	const svgPaths: string[] = [];
	for (let i = 0; i < svgStrings.length; i++) {
		const svgPath = join(promptDir, `svg_${i}.svg`);
		await writeFile(svgPath, svgStrings[i], 'utf-8');
		svgPaths.push(svgPath);
	}

	// Attempt EPS conversion via Inkscape
	const inkscapePath = await getInkscapePath();

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

	return promptDir;
}
