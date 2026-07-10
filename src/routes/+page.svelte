<script lang="ts">
	import { onDestroy } from 'svelte';
	import {
		promptsText,
		workflowConfig,
		pipelineProgress,
		isRunning,
		promptCount
	} from '$lib/stores/workflow';
	import type {
		PipelineProgress,
		SSEEvent,
		WorkflowRunRequest,
		PromptProgress,
		StepName,
		WorkflowConfig as ConfigType
	} from '$lib/types';
	import { createInitialSteps, STEP_LABELS } from '$lib/types';

	// Runes (Svelte 5 states)
	let running = $state(false);
	let currentPromptsText = $state('');
	let currentPromptCount = $state(0);
	let abortController: AbortController | null = $state(null);

	// Config fields linked to store
	let config = $state<ConfigType>({
		apiKey: '',
		model: 'zimage',
		baseUrl: 'https://gen.pollinations.ai',
		resolution: { width: 1024, height: 1024 },
		gridSize: { rows: 3, cols: 3 },
		outputFolder: './output'
	});

	// UI Active states
	let activeTab = $state<'logs' | 'source' | 'stickers'>('logs');
	let selectedPromptId = $state<number>(1);
	let activeStep = $state<StepName>('readPrompts');
	let expandedSections = $state<Record<string, boolean>>({
		readPrompts: true,
		textToImage: false,
		splitGrid: false,
		removeBackground: false,
		pngToSvg: false,
		bundleEps: false
	});

	// Terminal log entries
	interface LogEntry {
		timestamp: string;
		message: string;
		type: 'info' | 'success' | 'error' | 'default';
	}
	let logs = $state<LogEntry[]>([]);

	// Subscribe to stores
	const unsubConfig = workflowConfig.subscribe((cfg) => {
		if (cfg) config = cfg;
	});

	const unsubRunning = isRunning.subscribe((v) => {
		running = v;
	});

	const unsubPromptsText = promptsText.subscribe((v) => {
		currentPromptsText = v;
	});

	const unsubPromptCount = promptCount.subscribe((v) => {
		currentPromptCount = v;
	});

	let progress = $state<PipelineProgress | null>(null);
	let pausedStep = $state<StepName | null>(null);
	let pausedPromptId = $state<number | null>(null);

	const NEXT_STEPS: Record<StepName, string> = {
		readPrompts: 'Generate Grid',
		textToImage: 'Split 3×3 Grid',
		splitGrid: 'Remove Background',
		removeBackground: 'Convert PNG to SVG',
		pngToSvg: 'Bundle EPS',
		bundleEps: 'Finished'
	};

	async function handleNextStep() {
		if (!pausedStep || !pausedPromptId) return;

		const stepToResolve = pausedStep;
		const promptToResolve = pausedPromptId;

		pausedStep = null;
		pausedPromptId = null;

		try {
			addLog(`▶ Resuming pipeline: running next step...`, 'info');
			const response = await fetch('/api/workflow/next', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ promptId: promptToResolve, stepName: stepToResolve })
			});

			if (!response.ok) {
				const body = await response.json();
				throw new Error(body.error || 'Failed to resume step');
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			addLog(`❌ Failed to resume: ${msg}`, 'error');
		}
	}
	const unsubProgress = pipelineProgress.subscribe((p) => {
		progress = p;
		if (p && p.prompts && p.prompts.length > 0) {
			// If not set or out of bounds, default to current running prompt index
			const currentRunningIndex = p.currentPromptIndex + 1;
			if (!selectedPromptId || selectedPromptId > p.prompts.length) {
				selectedPromptId = currentRunningIndex;
			}
		}
	});

	onDestroy(() => {
		unsubConfig();
		unsubRunning();
		unsubPromptsText();
		unsubPromptCount();
		unsubProgress();
	});

	// Calculate overall percentage
	let overallPercent = $derived(
		progress && progress.totalPrompts > 0
			? Math.round((progress.completedPrompts / progress.totalPrompts) * 100)
			: 0
	);

	// Retrieve active prompt progress based on selected dropdown ID
	let activePromptProgress = $derived(
		progress?.prompts.find((p) => p.promptId === selectedPromptId) || null
	);

	// Add log helper
	function addLog(message: string, type: LogEntry['type'] = 'default') {
		const time = new Date().toLocaleTimeString();
		logs = [...logs, { timestamp: time, message, type }];
		// Auto scroll terminal
		setTimeout(() => {
			const term = document.getElementById('terminal-log');
			if (term) term.scrollTop = term.scrollHeight;
		}, 50);
	}

	function handleTextareaChange(e: Event) {
		const target = e.target as HTMLTextAreaElement;
		promptsText.set(target.value);
	}

	function updateConfigField<K extends keyof ConfigType>(key: K, value: ConfigType[K]) {
		workflowConfig.update((cfg) => {
			const updated = { ...cfg, [key]: value };
			config = updated;
			return updated;
		});
	}

	function toggleSection(section: string) {
		expandedSections = {
			...expandedSections,
			[section]: !expandedSections[section]
		};
	}

	function expandOnly(section: string) {
		const updated: Record<string, boolean> = {};
		Object.keys(expandedSections).forEach((k) => {
			updated[k] = k === section;
		});
		expandedSections = updated;
		activeStep = section as StepName;

		// Auto scroll to element
		setTimeout(() => {
			const el = document.getElementById(`step-card-${section}`);
			if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		}, 100);
	}

	async function handleRun() {
		if (running || currentPromptCount === 0) return;

		abortController = new AbortController();
		logs = []; // Clear old logs
		pausedStep = null;
		pausedPromptId = null;
		activeTab = 'logs';
		addLog('🚀 Initializing Asset Template Pipeline...', 'info');

		const prompts = currentPromptsText
			.split('\n')
			.map((l) => l.trim())
			.filter((l) => l.length > 0);

		selectedPromptId = 1;

		const initialProgress: PipelineProgress = {
			isRunning: true,
			totalPrompts: prompts.length,
			completedPrompts: 0,
			currentPromptIndex: 0,
			prompts: prompts.map((text, i) => ({
				promptId: i + 1,
				promptText: text,
				steps: createInitialSteps(),
				overallStatus: 'pending',
				outputFiles: []
			})),
			startedAt: Date.now(),
			elapsedMs: 0
		};

		pipelineProgress.set(initialProgress);

		try {
			const response = await fetch('/api/workflow/run', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ promptsText: currentPromptsText, config }),
				signal: abortController.signal
			});

			if (!response.ok) {
				throw new Error(`Server error: ${response.status}`);
			}

			const reader = response.body?.getReader();
			if (!reader) throw new Error('No response stream');

			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';

				for (const line of lines) {
					if (line.startsWith('data: ')) {
						const jsonStr = line.slice(6).trim();
						if (jsonStr === '[DONE]') {
							pipelineProgress.update((p) => {
								if (!p) return p;
								return { ...p, isRunning: false, elapsedMs: Date.now() - p.startedAt };
							});
							addLog('🎉 Pipeline complete! All prompts executed.', 'success');
							break;
						}

						try {
							const event: SSEEvent = JSON.parse(jsonStr);
							handleSSEEvent(event);
						} catch {
							/* skip */
						}
					}
				}
			}
		} catch (err: unknown) {
			if (err instanceof DOMException && err.name === 'AbortError') {
				addLog('❌ Pipeline execution aborted by user.', 'error');
			} else {
				const msg = err instanceof Error ? err.message : String(err);
				addLog(`❌ Pipeline error: ${msg}`, 'error');
			}
		}
	}

	function handleSSEEvent(event: SSEEvent) {
		pipelineProgress.update((p) => {
			if (!p) return p;

			const updated = { ...p, elapsedMs: Date.now() - p.startedAt };
			const prompts = [...updated.prompts];

			switch (event.type) {
				case 'pipeline:start':
					addLog(`🚀 Pipeline execution started. Processing ${event.data.totalPrompts} prompts.`, 'info');
					break;

				case 'pipeline:complete':
					updated.isRunning = false;
					break;

				case 'pipeline:error':
					updated.isRunning = false;
					updated.error = String(event.data.message);
					addLog(`❌ Pipeline critical error: ${event.data.message}`, 'error');
					break;

				case 'prompt:start': {
					const pIdx = prompts.findIndex((pp) => pp.promptId === event.promptId);
					if (pIdx !== -1) {
						prompts[pIdx] = { ...prompts[pIdx], overallStatus: 'running' };
						updated.currentPromptIndex = pIdx;
						selectedPromptId = event.promptId!;
					}
					addLog(`\n📝 Processing Prompt #${event.promptId}: "${event.data.promptText}"`, 'info');
					break;
				}

				case 'prompt:complete': {
					const pIdx = prompts.findIndex((pp) => pp.promptId === event.promptId);
					if (pIdx !== -1) {
						prompts[pIdx] = {
							...prompts[pIdx],
							overallStatus: 'done',
							outputFiles: (event.data.outputFiles as string[]) ?? prompts[pIdx].outputFiles
						};
						updated.completedPrompts = prompts.filter((pp) => pp.overallStatus === 'done').length;
					}
					addLog(`✅ Prompt #${event.promptId} complete. Assets saved to: ${event.data.outputFolder}`, 'success');
					activeTab = 'stickers'; // Auto switch to stickers tab on completion
					break;
				}

				case 'prompt:error': {
					const pIdx = prompts.findIndex((pp) => pp.promptId === event.promptId);
					if (pIdx !== -1) {
						prompts[pIdx] = { ...prompts[pIdx], overallStatus: 'error' };
					}
					addLog(`❌ Prompt #${event.promptId} failed: ${event.data.message}`, 'error');
					break;
				}

				case 'step:start': {
					const pIdx = prompts.findIndex((pp) => pp.promptId === event.promptId);
					if (pIdx !== -1) {
						const steps = [...prompts[pIdx].steps];
						const sIdx = steps.findIndex((s) => s.name === event.stepName);
						if (sIdx !== -1) {
							steps[sIdx] = { ...steps[sIdx], status: 'running' };
							prompts[pIdx] = { ...prompts[pIdx], steps };
						}
					}
					if (event.stepName) {
						expandOnly(event.stepName);
						addLog(`⚙️ Starting step: ${STEP_LABELS[event.stepName]}`);
					}
					break;
				}

				case 'step:progress': {
					const pIdx = prompts.findIndex((pp) => pp.promptId === event.promptId);
					if (pIdx !== -1) {
						const steps = [...prompts[pIdx].steps];
						const sIdx = steps.findIndex((s) => s.name === event.stepName);
						if (sIdx !== -1) {
							steps[sIdx] = {
								...steps[sIdx],
								progress: (event.data.progress as number) ?? steps[sIdx].progress,
								elapsedMs: (event.data.elapsedMs as number) ?? steps[sIdx].elapsedMs
							};
							prompts[pIdx] = { ...prompts[pIdx], steps };
						}
					}
					break;
				}

				case 'step:complete': {
					const pIdx = prompts.findIndex((pp) => pp.promptId === event.promptId);
					if (pIdx !== -1) {
						const steps = [...prompts[pIdx].steps];
						const sIdx = steps.findIndex((s) => s.name === event.stepName);
						if (sIdx !== -1) {
							steps[sIdx] = {
								...steps[sIdx],
								status: 'done',
								progress: 100,
								elapsedMs: (event.data.elapsedMs as number) ?? steps[sIdx].elapsedMs
							};
							prompts[pIdx] = { ...prompts[pIdx], steps };
						}
					}
					if (event.stepName) {
						addLog(`✓ Completed ${STEP_LABELS[event.stepName]} in ${event.data.elapsedMs}ms`, 'success');
						if (event.stepName === 'textToImage') {
							activeTab = 'source'; // Auto switch to source grid view when image is ready
						}
					}
					break;
				}

				case 'step:error': {
					const pIdx = prompts.findIndex((pp) => pp.promptId === event.promptId);
					if (pIdx !== -1) {
						const steps = [...prompts[pIdx].steps];
						const sIdx = steps.findIndex((s) => s.name === event.stepName);
						if (sIdx !== -1) {
							steps[sIdx] = {
								...steps[sIdx],
								status: 'error',
								error: (event.data.error as string) ?? 'Unknown error',
								elapsedMs: (event.data.elapsedMs as number) ?? steps[sIdx].elapsedMs
							};
							prompts[pIdx] = { ...prompts[pIdx], steps };
						}
					}
					if (event.stepName) {
						addLog(`❌ Error in ${STEP_LABELS[event.stepName]}: ${event.data.error}`, 'error');
					}
					break;
				}
				case 'step:paused': {
					pausedStep = event.stepName!;
					pausedPromptId = event.promptId!;
					addLog(`⏸️ Pipeline paused after completing ${STEP_LABELS[pausedStep]}. Click "Next Step" to run ${NEXT_STEPS[pausedStep]}...`, 'info');
					break;
				}
			}

			updated.prompts = prompts;
			return updated;
		});
	}

	function handleStop() {
		pausedStep = null;
		pausedPromptId = null;
		if (abortController) {
			abortController.abort();
			abortController = null;
			pipelineProgress.update((p) => {
				if (!p) return p;
				return { ...p, isRunning: false };
			});
		}
	}

	async function openPromptFolder(promptId: number) {
		try {
			const path = `${config.outputFolder}/prompt_${promptId}`;
			await fetch('/api/workflow/open-folder', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ folderPath: path })
			});
		} catch (err) {
			console.error('Failed to open folder:', err);
		}
	}
</script>

<div class="dashboard-layout">
	<!-- Top Navigation Header -->
	<header class="dashboard-header">
		<div class="dashboard-brand">
			<span class="dashboard-logo">Asset Template Factory</span>
		</div>

		<!-- Top Execution Actions -->
		<div class="toolbar-left" style="display: flex; gap: 8px; align-items: center;">
			<button
				class="btn btn-primary run-btn"
				disabled={running || currentPromptCount === 0}
				onclick={handleRun}
			>
				{#if running}
					<span class="btn-icon spin">⟳</span>
					<span>Running...</span>
				{:else}
					<span class="btn-icon">▶</span>
					<span>Run Pipeline</span>
				{/if}
			</button>

			{#if pausedStep}
				<button
					class="btn pulse-btn"
					onclick={handleNextStep}
					style="background: #2ed573; border-color: #2ed573; color: #fff; animation: pulse 1.5s infinite; font-weight: 700; display: flex; align-items: center; gap: 6px;"
				>
					<span class="btn-icon">⏭</span>
					<span>Next: {NEXT_STEPS[pausedStep]}</span>
				</button>
			{/if}

			{#if running}
				<button class="btn btn-danger" onclick={handleStop}>
					<span class="btn-icon">■</span>
					<span>Stop</span>
				</button>
			{/if}
		</div>
	</header>

	<!-- Horizontal Process Timeline -->
	<div class="timeline-container">
		<div class="timeline-step" class:active={activeStep === 'readPrompts'} class:completed={progress && progress.prompts[0]?.steps[0].status === 'done'}>
			<span class="step-number">1</span>
			<span>Read Prompts</span>
		</div>
		<div class="step-connector" class:completed={activePromptProgress?.steps.find(s => s.name === 'textToImage')?.status === 'done'}></div>

		<div class="timeline-step" class:active={activeStep === 'textToImage'} class:completed={activePromptProgress?.steps.find(s => s.name === 'textToImage')?.status === 'done'}>
			<span class="step-number">2</span>
			<span>Generate Grid</span>
		</div>
		<div class="step-connector" class:completed={activePromptProgress?.steps.find(s => s.name === 'splitGrid')?.status === 'done'}></div>

		<div class="timeline-step" class:active={activeStep === 'splitGrid'} class:completed={activePromptProgress?.steps.find(s => s.name === 'splitGrid')?.status === 'done'}>
			<span class="step-number">3</span>
			<span>Split 3×3</span>
		</div>
		<div class="step-connector" class:completed={activePromptProgress?.steps.find(s => s.name === 'removeBackground')?.status === 'done'}></div>

		<div class="timeline-step" class:active={activeStep === 'removeBackground'} class:completed={activePromptProgress?.steps.find(s => s.name === 'removeBackground')?.status === 'done'}>
			<span class="step-number">4</span>
			<span>Remove BG</span>
		</div>
		<div class="step-connector" class:completed={activePromptProgress?.steps.find(s => s.name === 'bundleEps')?.status === 'done'}></div>

		<div class="timeline-step" class:active={activeStep === 'pngToSvg' || activeStep === 'bundleEps'} class:completed={activePromptProgress?.overallStatus === 'done'}>
			<span class="step-number">5</span>
			<span>Bundle EPS</span>
		</div>
	</div>

	<!-- Dashboard Main Split Pane Body -->
	<div class="dashboard-body">
		<!-- Left Panel: Settings Collapsible Accordions -->
		<aside class="control-panel">
			<div class="control-scroll">
				<!-- Step 1: Read Prompts Accordion -->
				<div class="accordion-card" class:active={expandedSections.readPrompts} id="step-card-readPrompts">
					<button class="accordion-header" onclick={() => toggleSection('readPrompts')}>
						<div class="accordion-title-group">
							<span class="accordion-icon">📝</span>
							<span class="accordion-title">Step 1: Read Prompts</span>
						</div>
						<span class="accordion-chevron">▼</span>
					</button>
					{#if expandedSections.readPrompts}
						<div class="accordion-content">
							<span class="input-label">Enter Prompts (one per line)</span>
							<textarea
								rows="5"
								value={currentPromptsText}
								oninput={handleTextareaChange}
								placeholder="e.g. Grumpy Capybara Stickers&#10;Cute Dog Vector Art"
								class="prompt-textarea"
							></textarea>
							<div class="prompt-hint">
								<span class="hint-icon">💡</span>
								<span>Total prompts detected: <strong>{currentPromptCount}</strong></span>
							</div>
						</div>
					{/if}
				</div>

				<!-- Step 2: Image Generation settings -->
				<div class="accordion-card" class:active={expandedSections.textToImage} id="step-card-textToImage">
					<button class="accordion-header" onclick={() => toggleSection('textToImage')}>
						<div class="accordion-title-group">
							<span class="accordion-icon">🎨</span>
							<span class="accordion-title">Step 2: Generate Grid</span>
						</div>
						<span class="accordion-chevron">▼</span>
					</button>
					{#if expandedSections.textToImage}
						<div class="accordion-content">
							<div class="input-group">
								<span class="input-label">Model Name</span>
								<input
									type="text"
									value={config.model}
									oninput={(e) => updateConfigField('model', (e.target as HTMLInputElement).value)}
									placeholder="zimage"
								/>
							</div>
							<div class="input-group-row" style="display: flex; gap: 8px;">
								<div class="input-group" style="flex: 1;">
									<span class="input-label">Width</span>
									<input
										type="number"
										value={config.resolution.width}
										oninput={(e) => updateConfigField('resolution', { ...config.resolution, width: Number((e.target as HTMLInputElement).value) })}
									/>
								</div>
								<div class="input-group" style="flex: 1;">
									<span class="input-label">Height</span>
									<input
										type="number"
										value={config.resolution.height}
										oninput={(e) => updateConfigField('resolution', { ...config.resolution, height: Number((e.target as HTMLInputElement).value) })}
									/>
								</div>
							</div>
							<div class="input-group">
								<span class="input-label">API Key</span>
								<input
									type="password"
									value={config.apiKey}
									oninput={(e) => updateConfigField('apiKey', (e.target as HTMLInputElement).value)}
									placeholder="sk_..."
								/>
							</div>
							<div class="input-group">
								<span class="input-label">Base URL</span>
								<input
									type="text"
									value={config.baseUrl}
									oninput={(e) => updateConfigField('baseUrl', (e.target as HTMLInputElement).value)}
								/>
							</div>
							<div class="input-group">
								<span class="input-label">Workflow Mode</span>
								<select
									value={config.workflowMode || 'auto'}
									onchange={(e) => updateConfigField('workflowMode', (e.target as HTMLSelectElement).value as 'auto' | 'manual')}
									style="width: 100%; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text); padding: var(--space-2) var(--space-3); font-size: var(--text-xs); outline: none;"
								>
									<option value="auto">Automatic (Run all steps sequentially)</option>
									<option value="manual">Manual (Pause after each step, require "Next")</option>
								</select>
							</div>
							<div class="input-group">
								<span class="input-label">Default System Prompt</span>
								<textarea
									value={config.systemPrompt || ''}
									oninput={(e) => updateConfigField('systemPrompt', (e.target as HTMLTextAreaElement).value)}
									placeholder="System prompt template..."
									rows="5"
									style="width: 100%; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text); padding: var(--space-2) var(--space-3); font-size: 0.65rem; outline: none; resize: vertical; font-family: var(--font-mono); line-height: 1.4;"
								></textarea>
								<span style="font-size: 0.6rem; color: var(--color-text-muted); margin-top: -2px;">
									Use <code>[PROMPT]</code> as the placeholder for your text.
								</span>
							</div>
						</div>
					{/if}
				</div>

				<!-- Step 3: Split Grid settings -->
				<div class="accordion-card" class:active={expandedSections.splitGrid} id="step-card-splitGrid">
					<button class="accordion-header" onclick={() => toggleSection('splitGrid')}>
						<div class="accordion-title-group">
							<span class="accordion-icon">✂️</span>
							<span class="accordion-title">Step 3: Split 3×3 Grid</span>
						</div>
						<span class="accordion-chevron">▼</span>
					</button>
					{#if expandedSections.splitGrid}
						<div class="accordion-content">
							<div class="input-group-row" style="display: flex; gap: 8px;">
								<div class="input-group" style="flex: 1;">
									<span class="input-label">Grid Rows</span>
									<input
										type="number"
										value={config.gridSize.rows}
										oninput={(e) => updateConfigField('gridSize', { ...config.gridSize, rows: Number((e.target as HTMLInputElement).value) })}
									/>
								</div>
								<div class="input-group" style="flex: 1;">
									<span class="input-label">Grid Cols</span>
									<input
										type="number"
										value={config.gridSize.cols}
										oninput={(e) => updateConfigField('gridSize', { ...config.gridSize, cols: Number((e.target as HTMLInputElement).value) })}
									/>
								</div>
							</div>
							<div style="font-size: 0.65rem; color: var(--color-text-muted); line-height: 1.4;">
								The generated composite image will be sliced into {config.gridSize.rows * config.gridSize.cols} separate PNG assets.
							</div>
						</div>
					{/if}
				</div>

				<!-- Step 4: Remove Background settings -->
				<div class="accordion-card" class:active={expandedSections.removeBackground} id="step-card-removeBackground">
					<button class="accordion-header" onclick={() => toggleSection('removeBackground')}>
						<div class="accordion-title-group">
							<span class="accordion-icon">🖼️</span>
							<span class="accordion-title">Step 4: Remove Background</span>
						</div>
						<span class="accordion-chevron">▼</span>
					</button>
					{#if expandedSections.removeBackground}
						<div class="accordion-content">
							<div style="display: flex; align-items: center; justify-content: space-between; padding: 4px 0;">
								<span class="input-label" style="margin-bottom: 0;">AI Background Removal</span>
								<label class="toggle-switch">
									<input type="checkbox" checked={true} disabled />
									<span class="toggle-slider"></span>
								</label>
							</div>
							<div style="display: flex; flex-direction: column; gap: 6px; font-size: 0.65rem; color: var(--color-text-muted); line-height: 1.4;">
								<div>Auto-detects and removes background pixels from each cell to generate transparent stickers.</div>
								<div style="display: flex; align-items: center; gap: 6px;">
									<span style="color: var(--color-success);">●</span>
									<span>Model: <strong>RMBG-1.4 (ONNX)</strong> (runs locally)</span>
								</div>
							</div>
						</div>
					{/if}
				</div>

				<!-- Step 5: Bundle EPS settings -->
				<div class="accordion-card" class:active={expandedSections.pngToSvg || expandedSections.bundleEps} id="step-card-bundleEps">
					<button class="accordion-header" onclick={() => toggleSection('bundleEps')}>
						<div class="accordion-title-group">
							<span class="accordion-icon">📦</span>
							<span class="accordion-title">Step 5: Bundle EPS</span>
						</div>
						<span class="accordion-chevron">▼</span>
					</button>
					{#if expandedSections.pngToSvg || expandedSections.bundleEps}
						<div class="accordion-content">
							<div class="input-group">
								<span class="input-label">Output Folder</span>
								<input
									type="text"
									value={config.outputFolder}
									oninput={(e) => updateConfigField('outputFolder', (e.target as HTMLInputElement).value)}
								/>
							</div>
							<div class="input-group">
								<span class="input-label">Vectorizer Engine</span>
								<select
									value={config.vectorizerEngine || 'vtracer'}
									onchange={(e) => updateConfigField('vectorizerEngine', (e.target as HTMLSelectElement).value as 'vtracer' | 'potrace')}
									class="vectorizer-select"
									style="width: 100%; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text); padding: var(--space-2) var(--space-3); font-size: var(--text-xs); outline: none;"
								>
									<option value="vtracer">VTracer (Smooth Color Shapes)</option>
									<option value="potrace">Potrace (Posterized Smooth Curves)</option>
								</select>
							</div>
							<div style="display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--color-border); padding-top: var(--space-3); font-size: 0.65rem; color: var(--color-text-muted); line-height: 1.4;">
								<div style="display: flex; align-items: center; gap: 6px;">
									<span style="color: var(--color-success);">✓</span>
									<span>Inkscape integration: <strong>ACTIVE</strong></span>
								</div>
								<div style="display: flex; align-items: center; gap: 6px;">
									<span style="color: var(--color-success);">✓</span>
									<span>Outputs: <strong>SVG, EPS, PNG</strong></span>
								</div>
							</div>
						</div>
					{/if}
				</div>
			</div>

			<!-- Control Footer: overall status -->
			{#if progress}
				<div class="control-footer">
					<div style="display: flex; justify-content: space-between; font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">
						<span style="color: var(--color-text-secondary);">Batch Progress</span>
						<span style="color: var(--color-cyan); font-family: var(--font-mono);">{progress.completedPrompts} / {progress.totalPrompts} Done</span>
					</div>
					<div class="progress-bar">
						<div
							class="progress-bar-fill"
							class:complete={overallPercent === 100 && !progress.isRunning}
							style="width: {overallPercent}%;"
						></div>
					</div>
				</div>
			{/if}
		</aside>

		<!-- Right Panel: Previews Dashboard (Tabs & Outputs) -->
		<main class="preview-panel">
			<!-- Preview Pane Headers & Tab Toggles -->
			<div class="preview-header">
				<div class="tabs-group">
					<button
						class="tab-btn"
						class:active={activeTab === 'logs'}
						onclick={() => activeTab = 'logs'}
					>
						<span>📊</span>
						<span>Activity Logs</span>
					</button>

					<button
						class="tab-btn"
						class:active={activeTab === 'source'}
						onclick={() => activeTab = 'source'}
						disabled={!activePromptProgress || activePromptProgress.steps[1].status === 'pending'}
					>
						<span>🖼️</span>
						<span>Source Grid</span>
					</button>

					<button
						class="tab-btn"
						class:active={activeTab === 'stickers'}
						onclick={() => activeTab = 'stickers'}
						disabled={!activePromptProgress || activePromptProgress.steps[2].status === 'pending'}
					>
						<span>✨</span>
						<span>Processed Stickers</span>
					</button>
				</div>

				<!-- Prompt Dropdown Selector (visible when progress exists) -->
				{#if progress && progress.prompts.length > 0}
					<div class="prompt-selector-container">
						<span class="prompt-select-label">Prompt:</span>
						<select
							class="prompt-select"
							bind:value={selectedPromptId}
						>
							{#each progress.prompts as p}
								<option value={p.promptId}>
									Prompt {p.promptId}: {p.promptText.substring(0, 24)}... ({p.overallStatus})
								</option>
							{/each}
						</select>
					</div>
				{/if}
			</div>

			<!-- Dynamic Tab Content Rendering -->
			<div class="preview-content-container">
				{#if activeTab === 'logs'}
					<!-- Tab 1: Terminal Log stream -->
					{#if logs.length > 0}
						<div class="terminal-window" id="terminal-log">
							{#each logs as log}
								<div class="terminal-line" class:info={log.type === 'info'} class:success={log.type === 'success'} class:error={log.type === 'error'}>
									<span class="terminal-timestamp">[{log.timestamp}]</span>
									<span>{log.message}</span>
								</div>
							{/each}
						</div>
					{:else}
						<div class="placeholder-view">
							<span class="placeholder-icon">📊</span>
							<h3 style="font-size: var(--text-sm); font-weight: 700; color: var(--color-text);">No Active Run</h3>
							<p class="placeholder-text">Enter prompts on the left and click "Run Pipeline" to stream logs and progress events.</p>
						</div>
					{/if}

				{:else if activeTab === 'source'}
					<!-- Tab 2: Raw Pollinations generated grid image -->
					{#if activePromptProgress}
						<div class="source-grid-container">
							<div style="font-size: 0.65rem; color: var(--color-text-muted); margin-bottom: var(--space-3); text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em;">
								Composite Grid Output (1024 × 1024 Composite)
							</div>
							<img
								src="/api/workflow/download/prompt_{selectedPromptId}/generated.png"
								alt="Composite Source Grid"
								class="source-img"
							/>
						</div>
					{:else}
						<div class="placeholder-view">
							<span class="placeholder-icon">🖼️</span>
							<p class="placeholder-text">Source grid image will load here once the Text → Image generation step completes.</p>
						</div>
					{/if}

				{:else if activeTab === 'stickers'}
					<!-- Tab 3: Processed Transparent PNG/SVG/EPS stickers list -->
					{#if activePromptProgress}
						<div style="display: flex; flex-direction: column; gap: var(--space-4);">
							<!-- Prompt Info & Explorer trigger -->
							<div style="display: flex; align-items: center; justify-content: space-between; background: var(--color-card); padding: var(--space-3) var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-md);">
								<div style="display: flex; flex-direction: column; gap: 2px;">
									<span style="font-size: 0.6rem; text-transform: uppercase; color: var(--color-text-muted); font-weight: 700; letter-spacing: 0.05em;">Selected Input</span>
									<span style="font-size: var(--text-xs); font-weight: 600; color: var(--color-cyan);">{activePromptProgress.promptText}</span>
								</div>
								{#if activePromptProgress.overallStatus === 'done'}
									<button class="btn btn-ghost btn-sm" onclick={() => openPromptFolder(selectedPromptId)}>
										<span>📂</span>
										<span>Open Folder</span>
									</button>
								{/if}
							</div>

							<!-- Visual 3x3 Grid of transparent output cells -->
							<div class="grid-preview" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; background: transparent; padding: 0;">
								{#each Array(config.gridSize.rows * config.gridSize.cols) as _, i}
									<div class="grid-item" style="background: var(--color-card); border: 1px solid var(--color-border); padding: var(--space-3); border-radius: var(--radius-md); display: flex; flex-direction: column; gap: var(--space-3);">
										
										<!-- Side-by-Side PNG vs SVG Preview -->
										<div class="side-by-side-row" style="display: flex; gap: 8px;">
											<!-- PNG Preview (Left) -->
											<div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
												<span style="font-size: 0.55rem; color: var(--color-text-muted); font-weight: 700; text-align: center; text-transform: uppercase; letter-spacing: 0.02em;">PNG</span>
												<div class="grid-img-container" style="height: 160px; background-color: #e5e5df; border: 1px solid var(--color-border); display: flex; align-items: center; justify-content: center; border-radius: var(--radius-sm); position: relative;">
													{#if activePromptProgress.steps.find(s => s.name === 'removeBackground')?.status === 'done'}
														<img
															src="/api/workflow/download/prompt_{selectedPromptId}/nobg_{i}.png"
															alt="PNG {i}"
															class="grid-img hover-zoom"
															style="max-width: 90%; max-height: 90%; object-fit: contain;"
														/>
													{:else}
														<img
															src="/api/workflow/download/prompt_{selectedPromptId}/split_{i}.png"
															alt="PNG {i}"
															class="grid-img hover-zoom"
															style="max-width: 90%; max-height: 90%; object-fit: contain;"
														/>
													{/if}
												</div>
											</div>

											<!-- SVG Preview (Right) -->
											<div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
												<span style="font-size: 0.55rem; color: var(--color-text-muted); font-weight: 700; text-align: center; text-transform: uppercase; letter-spacing: 0.02em;">SVG</span>
												<div class="grid-img-container" style="height: 160px; background-color: #e5e5df; border: 1px solid var(--color-border); display: flex; align-items: center; justify-content: center; border-radius: var(--radius-sm); position: relative;">
													{#if activePromptProgress.steps.find(s => s.name === 'pngToSvg')?.status === 'done'}
														<img
															src="/api/workflow/download/prompt_{selectedPromptId}/svg_{i}.svg"
															alt="SVG {i}"
															class="grid-img hover-zoom"
															style="max-width: 90%; max-height: 90%; object-fit: contain;"
														/>
													{:else}
														<span style="font-size: 0.55rem; color: var(--color-text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Tracing...</span>
													{/if}
												</div>
											</div>
										</div>

										<div class="grid-links" style="display: flex; justify-content: center; gap: var(--space-3); font-size: var(--text-xs); border-top: 1px dashed var(--color-border); padding-top: var(--space-2);">
											<!-- Download anchors -->
											{#if activePromptProgress.steps.find(s => s.name === 'pngToSvg')?.status === 'done'}
												<a
													href="/api/workflow/download/prompt_{selectedPromptId}/svg_{i}.svg"
													download="sticker_{selectedPromptId}_{i}.svg"
													class="grid-link svg-link"
													style="text-decoration: none;"
												>
													SVG
												</a>
											{:else}
												<span style="color: var(--color-text-muted);">SVG</span>
											{/if}

											<span class="link-divider">|</span>

											{#if activePromptProgress.steps.find(s => s.name === 'bundleEps')?.status === 'done'}
												<a
													href="/api/workflow/download/prompt_{selectedPromptId}/eps_{i}.eps"
													download="sticker_{selectedPromptId}_{i}.eps"
													class="grid-link eps-link"
													style="text-decoration: none;"
												>
													EPS
												</a>
											{:else}
												<span style="color: var(--color-text-muted);">EPS</span>
											{/if}
										</div>
									</div>
								{/each}
							</div>
						</div>
					{:else}
						<div class="placeholder-view">
							<span class="placeholder-icon">✨</span>
							<p class="placeholder-text">Generated sticker assets and vector downloads will appear here once the splitting process begins.</p>
						</div>
					{/if}
				{/if}
			</div>
		</main>
	</div>
</div>

<style>
	/* Textarea adjustments */
	.prompt-textarea {
		width: 100%;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		color: var(--color-text);
		padding: var(--space-2) var(--space-3);
		outline: none;
		transition: border-color var(--duration-fast);
	}

	.prompt-textarea:focus {
		border-color: var(--color-purple);
	}

	.prompt-hint {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		margin-top: var(--space-1);
		font-size: 0.65rem;
		color: var(--color-text-secondary);
	}

	.hint-icon {
		font-size: var(--text-xs);
	}

	/* Simple input settings groups */
	.input-group {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.input-label {
		font-size: 0.6rem;
		text-transform: uppercase;
		color: var(--color-text-muted);
		font-weight: 700;
		letter-spacing: 0.05em;
		margin-bottom: 2px;
	}

	input[type="text"],
	input[type="password"],
	input[type="number"] {
		width: 100%;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		color: var(--color-text);
		padding: var(--space-2) var(--space-3);
		font-size: var(--text-xs);
		outline: none;
		transition: border-color var(--duration-fast);
	}

	input[type="text"]:focus,
	input[type="password"]:focus,
	input[type="number"]:focus {
		border-color: var(--color-cyan);
	}

	.hover-zoom {
		transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
		cursor: zoom-in;
		position: relative;
		z-index: 1;
	}

	.hover-zoom:hover {
		transform: scale(2.2);
		z-index: 50;
		filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.18));
	}

	@keyframes pulse {
		0% {
			box-shadow: 0 0 0 0 rgba(46, 213, 115, 0.5);
		}
		70% {
			box-shadow: 0 0 0 8px rgba(46, 213, 115, 0);
		}
		100% {
			box-shadow: 0 0 0 0 rgba(46, 213, 115, 0);
		}
	}
</style>
