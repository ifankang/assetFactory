import type { Prompt } from '$lib/types';

/**
 * Splits a block of text (one prompt per line) into an array of Prompt objects.
 * Empty / whitespace-only lines are discarded. IDs start at 1 and auto-increment.
 */
export function readPrompts(text: string): Prompt[] {
	return text
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.map((line, index) => ({
			id: index + 1,
			text: line
		}));
}
