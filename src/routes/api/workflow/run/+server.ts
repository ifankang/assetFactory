import type { RequestHandler } from './$types';
import type { WorkflowRunRequest, SSEEvent } from '$lib/types';
import { runPipeline } from '$lib/server/pipeline/orchestrator';

export const POST: RequestHandler = async ({ request }) => {
	let body: WorkflowRunRequest;

	try {
		body = (await request.json()) as WorkflowRunRequest;
	} catch {
		return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	if (!body.promptsText || !body.config) {
		return new Response(
			JSON.stringify({ error: 'Missing required fields: promptsText, config' }),
			{
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();

			const onEvent = (event: SSEEvent): void => {
				try {
					const chunk = `data: ${JSON.stringify(event)}\n\n`;
					controller.enqueue(encoder.encode(chunk));
				} catch {
					// Stream may have been closed by the client
				}
			};

			runPipeline(body, onEvent)
				.then(() => {
					try {
						controller.close();
					} catch {
						// Already closed
					}
				})
				.catch((err) => {
					const errorEvent: SSEEvent = {
						type: 'pipeline:error',
						data: {
							message:
								err instanceof Error ? err.message : String(err)
						}
					};
					try {
						const chunk = `data: ${JSON.stringify(errorEvent)}\n\n`;
						controller.enqueue(encoder.encode(chunk));
						controller.close();
					} catch {
						// Already closed
					}
				});
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
