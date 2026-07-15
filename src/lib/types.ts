// ============================================================
// Asset Template Factory — Shared Types
// ============================================================

/** A single prompt parsed from the textarea */
export interface Prompt {
	id: number;
	text: string;
}

/** Workflow configuration */
export interface WorkflowConfig {
	apiKey: string;
	model: string;
	baseUrl: string;
	resolution: { width: number; height: number };
	gridSize: { rows: number; cols: number };
	outputFolder: string;
	vectorizerEngine?: 'vtracer' | 'potrace' | 'inkscape';
	systemPrompt?: string;
	workflowMode?: 'auto' | 'manual';
	inkscapeEnabled?: boolean;
	inkscapePath?: string;
	colorLimit?: number;
}

/** Status of a single pipeline step */
export type StepStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';

/** The 6 pipeline step names */
export type StepName =
	| 'readPrompts'
	| 'textToImage'
	| 'splitGrid'
	| 'removeBackground'
	| 'pngToSvg'
	| 'bundleEps';

/** Progress info for a single step within a prompt */
export interface PipelineStep {
	name: StepName;
	label: string;
	status: StepStatus;
	progress: number; // 0-100
	elapsedMs: number;
	error?: string;
	resultPreview?: string; // base64 data URL for image previews
}

/** Progress info for a single prompt going through the pipeline */
export interface PromptProgress {
	promptId: number;
	promptText: string;
	steps: PipelineStep[];
	overallStatus: StepStatus;
	outputFiles: string[];
}

/** Overall pipeline progress */
export interface PipelineProgress {
	isRunning: boolean;
	totalPrompts: number;
	completedPrompts: number;
	currentPromptIndex: number;
	prompts: PromptProgress[];
	startedAt: number;
	elapsedMs: number;
	error?: string;
}

/** SSE event types sent from server to client */
export type SSEEventType =
	| 'pipeline:start'
	| 'pipeline:complete'
	| 'pipeline:error'
	| 'prompt:start'
	| 'prompt:complete'
	| 'prompt:error'
	| 'step:start'
	| 'step:progress'
	| 'step:complete'
	| 'step:error'
	| 'step:paused';

/** SSE event data */
export interface SSEEvent {
	type: SSEEventType;
	promptId?: number;
	stepName?: StepName;
	data: Record<string, unknown>;
}

/** Request body for /api/workflow/run */
export interface WorkflowRunRequest {
	promptsText: string;
	config: WorkflowConfig;
}

/** Custom data for workflow node components */
export interface ReadPromptsNodeData {
	type: 'readPrompts';
	promptsText: string;
	promptCount: number;
}

export interface TextToImageNodeData {
	type: 'textToImage';
	model: string;
	resolution: { width: number; height: number };
}

export interface SplitGridNodeData {
	type: 'splitGrid';
	rows: number;
	cols: number;
}

export interface RemoveBgNodeData {
	type: 'removeBg';
	enabled: boolean;
}

export interface PngToSvgNodeData {
	type: 'pngToSvg';
	colorMode: 'color';
	optimizationLevel: number; // 0-100
}

export interface BundleEpsNodeData {
	type: 'bundleEps';
	outputFolder: string;
	filenamePattern: string;
}

export type WorkflowNodeData =
	| ReadPromptsNodeData
	| TextToImageNodeData
	| SplitGridNodeData
	| RemoveBgNodeData
	| PngToSvgNodeData
	| BundleEpsNodeData;

/** Default step labels */
export const STEP_LABELS: Record<StepName, string> = {
	readPrompts: 'Read Prompts',
	textToImage: 'Text → Image',
	splitGrid: 'Split 3×3',
	removeBackground: 'Remove BG',
	pngToSvg: 'PNG → SVG',
	bundleEps: 'Bundle EPS'
};

/** Default step order */
export const STEP_ORDER: StepName[] = [
	'readPrompts',
	'textToImage',
	'splitGrid',
	'removeBackground',
	'pngToSvg',
	'bundleEps'
];

/** Create initial step progress for a prompt */
export function createInitialSteps(): PipelineStep[] {
	return STEP_ORDER.map((name) => ({
		name,
		label: STEP_LABELS[name],
		status: 'pending' as StepStatus,
		progress: 0,
		elapsedMs: 0
	}));
}
