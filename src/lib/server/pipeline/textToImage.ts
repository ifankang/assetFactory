import type { WorkflowConfig } from '$lib/types';

const SYSTEM_PROMPT = `consistent 3x3 grid of 9 modern flat vector icons, category: [PROMPT], soft-duotone SaaS style, rounded geometric shapes, medium dark-navy outlines, soft periwinkle primary, pale tints, white background, grounding shadow, clean SVG outline, no text, no borders, no labels`;

/**
 * Generate an image from a text prompt using the Pollinations API.
 * Retries up to 3 times with a 2-second delay between attempts.
 */
export async function generateImage(
	prompt: string,
	config: WorkflowConfig
): Promise<Buffer> {
	const fullPrompt = (config.systemPrompt || SYSTEM_PROMPT).replace('[PROMPT]', prompt);
	const url = `${config.baseUrl}/image/${encodeURIComponent(fullPrompt)}?model=${encodeURIComponent(config.model)}&width=${config.resolution.width}&height=${config.resolution.height}`;

	const maxAttempts = 3;
	const retryDelayMs = 2000;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			const response = await fetch(url, {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${config.apiKey}`
				},
				signal: AbortSignal.timeout(30000)
			});

			if (!response.ok) {
				const body = await response.text().catch(() => '');
				throw new Error(
					`Pollinations API responded with ${response.status} ${response.statusText}: ${body}`
				);
			}

			const arrayBuffer = await response.arrayBuffer();
			const buffer = Buffer.from(arrayBuffer);

			if (buffer.length === 0) {
				throw new Error('Pollinations API returned an empty response');
			}

			return buffer;
		} catch (err) {
			const isLastAttempt = attempt === maxAttempts;
			if (isLastAttempt) {
				throw new Error(
					`Failed to generate image after ${maxAttempts} attempts: ${err instanceof Error ? err.message : String(err)}`
				);
			}
			console.warn(
				`[textToImage] Attempt ${attempt}/${maxAttempts} failed, retrying in ${retryDelayMs}ms…`,
				err instanceof Error ? err.message : err
			);
			await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
		}
	}

	// TypeScript: unreachable, but satisfies the return type
	throw new Error('Unreachable');
}
