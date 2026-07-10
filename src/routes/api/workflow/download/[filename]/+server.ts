import type { RequestHandler } from './$types';
import { readFile, access, constants } from 'fs/promises';
import { resolve, basename, extname } from 'path';

/**
 * Map of common file extensions to MIME content types.
 */
const MIME_TYPES: Record<string, string> = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.svg': 'image/svg+xml',
	'.eps': 'application/postscript',
	'.pdf': 'application/pdf'
};

/**
 * GET /api/workflow/download/[filename]
 *
 * Serves a file from the default output directory.
 * The filename parameter can include subdirectories, e.g. "prompt_1/svg_0.svg".
 */
export const GET: RequestHandler = async ({ params }) => {
	const filename = params.filename;

	if (!filename) {
		return new Response(JSON.stringify({ error: 'No filename specified' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// Resolve against the output directory
	const outputDir = resolve('./output');
	const filePath = resolve(outputDir, filename);

	console.log('[DEBUG-DOWNLOAD] params.filename:', filename);
	console.log('[DEBUG-DOWNLOAD] outputDir:', outputDir);
	console.log('[DEBUG-DOWNLOAD] filePath:', filePath);
	console.log('[DEBUG-DOWNLOAD] startsWith:', filePath.startsWith(outputDir));

	// Security: prevent directory traversal outside output dir
	if (!filePath.toLowerCase().startsWith(outputDir.toLowerCase())) {
		console.log('[DEBUG-DOWNLOAD] Security check failed: Path traversal detected');
		return new Response(JSON.stringify({ error: 'Access denied' }), {
			status: 403,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// Check file exists
	try {
		await access(filePath, constants.R_OK);
	} catch (err: unknown) {
		console.error('[DEBUG-DOWNLOAD] fs.access failed for path:', filePath, 'Error:', err);
		return new Response(JSON.stringify({ error: 'File not found', details: err instanceof Error ? err.message : String(err) }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// Read and serve
	const buffer = await readFile(filePath);
	const ext = extname(filePath).toLowerCase();
	const contentType = MIME_TYPES[ext] || 'application/octet-stream';
	const name = basename(filePath);

	return new Response(buffer, {
		status: 200,
		headers: {
			'Content-Type': contentType,
			'Content-Disposition': `attachment; filename="${name}"`,
			'Content-Length': String(buffer.length)
		}
	});
};
