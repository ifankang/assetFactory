import type { RequestHandler } from './$types';
import { access, constants } from 'fs/promises';
import {
	POLLINATIONS_API_KEY,
	POLLINATIONS_MODEL,
	POLLINATIONS_BASE_URL
} from '$env/static/private';

const DEFAULT_CONFIG = {
	apiKey: POLLINATIONS_API_KEY,
	model: POLLINATIONS_MODEL,
	baseUrl: POLLINATIONS_BASE_URL,
	resolution: { width: 1024, height: 1024 },
	gridSize: { rows: 3, cols: 3 },
	outputFolder: './output'
};

/**
 * GET /api/workflow/config
 * Return the default workflow configuration.
 */
export const GET: RequestHandler = async () => {
	return new Response(JSON.stringify(DEFAULT_CONFIG), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});
};

/**
 * POST /api/workflow/config
 * Validate a proposed output folder path.
 */
export const POST: RequestHandler = async ({ request }) => {
	let body: { outputFolder?: string };

	try {
		body = (await request.json()) as { outputFolder?: string };
	} catch {
		return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const outputFolder = body.outputFolder;

	if (!outputFolder || typeof outputFolder !== 'string') {
		return new Response(
			JSON.stringify({ error: 'Missing or invalid outputFolder' }),
			{
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}

	try {
		await access(outputFolder, constants.F_OK);
		return new Response(
			JSON.stringify({ success: true, outputFolder }),
			{
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	} catch {
		return new Response(
			JSON.stringify({
				error: `Output folder does not exist: ${outputFolder}`
			}),
			{
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}
};
