import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import type { WorkflowRunRequest, SSEEvent, StepName, Prompt, WorkflowConfig } from '$lib/types';
import { readPrompts } from './readPrompts';
import { generateImage } from './textToImage';
import { splitImageGrid } from './splitGrid';
import { removeBackground } from './removeBackground';
import { convertToSvg } from './pngToSvg';
import { bundleToEps } from './bundleEps';

export const pendingSteps = new Map<string, () => void>();

async function pauseIfManual(
	promptId: number,
	stepName: StepName,
	config: WorkflowConfig,
	onEvent: (event: SSEEvent) => void
): Promise<void> {
	if (config.workflowMode === 'manual') {
		emit(onEvent, 'step:paused', promptId, stepName, { pausedAt: Date.now() });
		await new Promise<void>((resolve) => {
			pendingSteps.set(`${promptId}:${stepName}`, resolve);
		});
	}
}

/**
 * Emit a typed SSE event through the provided callback.
 */
function emit(
	onEvent: (event: SSEEvent) => void,
	type: SSEEvent['type'],
	promptId: number | undefined,
	stepName: StepName | undefined,
	data: Record<string, unknown> = {}
): void {
	onEvent({ type, promptId, stepName, data });
}

/**
 * Measure the execution time of an async operation.
 * Returns the result and elapsed milliseconds.
 */
async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; elapsedMs: number }> {
	const start = performance.now();
	const result = await fn();
	return { result, elapsedMs: Math.round(performance.now() - start) };
}

/**
 * Save a Buffer to disk as a file.
 */
async function saveBuffer(dir: string, filename: string, buffer: Buffer): Promise<string> {
	const filePath = join(dir, filename);
	await writeFile(filePath, buffer);
	return filePath;
}

/**
 * Run the full asset-template pipeline.
 *
 * Sequence per prompt:
 *   1. textToImage   – generate composite image from prompt text
 *   2. splitGrid     – split into rows×cols individual cells
 *   3. removeBackground – remove BG from each cell
 *   4. pngToSvg      – vectorise each cell PNG
 *   5. bundleEps     – write SVGs (and optionally EPS via Inkscape)
 */
export async function runPipeline(
	request: WorkflowRunRequest,
	onEvent: (event: SSEEvent) => void
): Promise<void> {
	pendingSteps.clear();
	const { config } = request;

	// --- Step 0: parse prompts ---------------------------------------------------
	const prompts: Prompt[] = readPrompts(request.promptsText);

	if (prompts.length === 0) {
		emit(onEvent, 'pipeline:error', undefined, undefined, {
			message: 'No valid prompts provided'
		});
		return;
	}

	// Ensure output root exists
	await mkdir(config.outputFolder, { recursive: true });

	emit(onEvent, 'pipeline:start', undefined, undefined, {
		totalPrompts: prompts.length,
		startedAt: Date.now()
	});

	let completedPrompts = 0;

	for (const prompt of prompts) {
		const promptDir = join(config.outputFolder, `prompt_${prompt.id}`);
		await mkdir(promptDir, { recursive: true });

		emit(onEvent, 'prompt:start', prompt.id, undefined, {
			promptText: prompt.text,
			promptIndex: prompt.id - 1
		});

		try {
			// ---- 1. Text → Image ------------------------------------------------
			emit(onEvent, 'step:start', prompt.id, 'textToImage', {});

			const { result: imageBuffer, elapsedMs: imgMs } = await timed(() =>
				generateImage(prompt.text, config)
			);

			const generatedPath = await saveBuffer(promptDir, 'generated.png', imageBuffer);

			emit(onEvent, 'step:complete', prompt.id, 'textToImage', {
				elapsedMs: imgMs,
				outputFile: generatedPath
			});

			await pauseIfManual(prompt.id, 'textToImage', config, onEvent);

			// ---- 2. Split Grid --------------------------------------------------
			emit(onEvent, 'step:start', prompt.id, 'splitGrid', {});

			const { result: cells, elapsedMs: splitMs } = await timed(() =>
				splitImageGrid(imageBuffer, config.gridSize.rows, config.gridSize.cols)
			);

			// Save each split cell
			const splitPaths: string[] = [];
			for (let i = 0; i < cells.length; i++) {
				const p = await saveBuffer(promptDir, `split_${i}.png`, cells[i]);
				splitPaths.push(p);
			}

			emit(onEvent, 'step:complete', prompt.id, 'splitGrid', {
				elapsedMs: splitMs,
				cellCount: cells.length,
				outputFiles: splitPaths
			});

			await pauseIfManual(prompt.id, 'splitGrid', config, onEvent);

			// ---- 3. Remove Background -------------------------------------------
			emit(onEvent, 'step:start', prompt.id, 'removeBackground', {});

			const noBgBuffers: Buffer[] = [];
			const noBgPaths: string[] = [];
			const bgStart = performance.now();

			for (let i = 0; i < cells.length; i++) {
				const noBg = await removeBackground(cells[i]);
				noBgBuffers.push(noBg);
				const p = await saveBuffer(promptDir, `nobg_${i}.png`, noBg);
				noBgPaths.push(p);

				// Emit progress for each sub-cell
				emit(onEvent, 'step:progress', prompt.id, 'removeBackground', {
					current: i + 1,
					total: cells.length,
					progress: Math.round(((i + 1) / cells.length) * 100)
				});
			}

			const bgMs = Math.round(performance.now() - bgStart);

			emit(onEvent, 'step:complete', prompt.id, 'removeBackground', {
				elapsedMs: bgMs,
				outputFiles: noBgPaths
			});

			await pauseIfManual(prompt.id, 'removeBackground', config, onEvent);

			// ---- 4. PNG → SVG ---------------------------------------------------
			emit(onEvent, 'step:start', prompt.id, 'pngToSvg', {});

			const svgStrings: string[] = [];
			const svgPaths: string[] = [];
			const svgStart = performance.now();

			for (let i = 0; i < noBgBuffers.length; i++) {
				const svg = await convertToSvg(noBgBuffers[i], config);
				svgStrings.push(svg);
				const svgPath = join(promptDir, `svg_${i}.svg`);
				await writeFile(svgPath, svg, 'utf-8');
				svgPaths.push(svgPath);

				emit(onEvent, 'step:progress', prompt.id, 'pngToSvg', {
					current: i + 1,
					total: noBgBuffers.length,
					progress: Math.round(((i + 1) / noBgBuffers.length) * 100)
				});
			}

			const svgMs = Math.round(performance.now() - svgStart);

			emit(onEvent, 'step:complete', prompt.id, 'pngToSvg', {
				elapsedMs: svgMs,
				outputFiles: svgPaths
			});

			await pauseIfManual(prompt.id, 'pngToSvg', config, onEvent);

			// ---- 5. Bundle EPS --------------------------------------------------
			emit(onEvent, 'step:start', prompt.id, 'bundleEps', {});

			const { result: bundlePath, elapsedMs: epsMs } = await timed(() =>
				bundleToEps(svgStrings, config, prompt.id)
			);

			emit(onEvent, 'step:complete', prompt.id, 'bundleEps', {
				elapsedMs: epsMs,
				outputFolder: bundlePath
			});

			// ---- Prompt complete ------------------------------------------------
			completedPrompts++;
			emit(onEvent, 'prompt:complete', prompt.id, undefined, {
				outputFolder: promptDir,
				completedPrompts,
				totalPrompts: prompts.length
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			emit(onEvent, 'prompt:error', prompt.id, undefined, { message });
			// Continue to next prompt
		}
	}

	emit(onEvent, 'pipeline:complete', undefined, undefined, {
		completedPrompts,
		totalPrompts: prompts.length,
		finishedAt: Date.now()
	});
}
