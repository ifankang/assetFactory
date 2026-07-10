import type { RequestHandler } from './$types';
import { exec } from 'child_process';
import { resolve } from 'path';
import { access, constants } from 'fs/promises';

/**
 * POST /api/workflow/open-folder
 * Open a local output folder in Windows File Explorer.
 */
export const POST: RequestHandler = async ({ request }) => {
	let body: { folderPath?: string };

	try {
		body = (await request.json()) as { folderPath?: string };
	} catch {
		return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const folderPath = body.folderPath;

	if (!folderPath) {
		return new Response(JSON.stringify({ error: 'Missing folderPath' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const resolvedPath = resolve(folderPath);

	try {
		// Verify folder exists before trying to open it
		await access(resolvedPath, constants.F_OK);

		// Execute Windows Explorer command to open the directory
		exec(`explorer "${resolvedPath}"`, (err) => {
			if (err) {
				console.error('[OpenFolder] Failed to open folder:', err);
			}
		});

		return new Response(JSON.stringify({ success: true, path: resolvedPath }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch {
		return new Response(
			JSON.stringify({ error: `Folder does not exist: ${resolvedPath}` }),
			{
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}
};
