import { writable, derived } from 'svelte/store';
import type { WorkflowConfig, PipelineProgress } from '$lib/types';

const isBrowser = typeof window !== 'undefined';

// Helper to get initial values from localStorage
const getStoredPrompts = (): string => {
	if (!isBrowser) return '';
	return localStorage.getItem('workflow_prompts_text') ?? '';
};

const getStoredConfig = (): WorkflowConfig => {
	const defaultCfg: WorkflowConfig = {
		apiKey: '',
		model: 'flux', // Set 'flux' as the default model
		baseUrl: 'https://gen.pollinations.ai',
		resolution: { width: 1024, height: 1024 },
		gridSize: { rows: 3, cols: 3 },
		outputFolder: './output',
		vectorizerEngine: 'vtracer'
	};

	if (!isBrowser) return defaultCfg;

	try {
		const raw = localStorage.getItem('workflow_config');
		if (raw) {
			const parsed = JSON.parse(raw);
			// Merge with defaults to ensure any new fields are present
			return { ...defaultCfg, ...parsed };
		}
	} catch (e) {
		console.warn('Failed to parse stored workflow config', e);
	}
	return defaultCfg;
};

/** Raw textarea content — one prompt per line */
export const promptsText = writable<string>(getStoredPrompts());

/** Workflow configuration */
export const workflowConfig = writable<WorkflowConfig>(getStoredConfig());

// Subscribe to stores to save changes to localStorage
if (isBrowser) {
	promptsText.subscribe((v) => {
		localStorage.setItem('workflow_prompts_text', v);
	});

	workflowConfig.subscribe((v) => {
		localStorage.setItem('workflow_config', JSON.stringify(v));
	});
}

/** Pipeline progress — null when idle */
export const pipelineProgress = writable<PipelineProgress | null>(null);

/** Whether the pipeline is currently running */
export const isRunning = derived(pipelineProgress, ($p) => $p?.isRunning ?? false);

/** Number of non-empty prompt lines */
export const promptCount = derived(promptsText, ($text) =>
	$text
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l.length > 0).length
);
