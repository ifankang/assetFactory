<script lang="ts">
	let {
		value = $bindable('./output'),
		placeholder = 'Output folder path...'
	}: {
		value?: string;
		placeholder?: string;
	} = $props();
</script>

<div class="folder-picker">
	<span class="folder-icon">📁</span>
	<input
		type="text"
		bind:value
		{placeholder}
		class="folder-input"
	/>
</div>

<style>
	.folder-picker {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		background: rgba(10, 14, 26, 0.6);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 0 var(--space-3);
		transition: all var(--duration-fast) var(--ease-out);
	}

	.folder-picker:focus-within {
		border-color: var(--color-purple);
		box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.12);
	}

	.folder-icon {
		font-size: var(--text-sm);
		flex-shrink: 0;
	}

	.folder-input {
		flex: 1;
		background: transparent;
		border: none;
		padding: var(--space-2) 0;
		font-size: var(--text-xs);
		font-family: var(--font-mono);
		color: var(--color-text);
		outline: none;
	}

	.folder-input::placeholder {
		color: var(--color-text-muted);
	}
</style>
