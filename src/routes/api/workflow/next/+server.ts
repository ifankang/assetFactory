import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pendingSteps } from '$lib/server/pipeline/orchestrator';

export const POST: RequestHandler = async ({ request }) => {
	let body: { promptId: number; stepName: string };

	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { promptId, stepName } = body;
	const key = `${promptId}:${stepName}`;
	const resolve = pendingSteps.get(key);

	if (resolve) {
		resolve();
		pendingSteps.delete(key);
		return json({ success: true });
	}

	return json({ error: `Step resolver for ${key} not found` }, { status: 404 });
};
