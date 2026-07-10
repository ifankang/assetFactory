<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		children
	}: {
		title?: string;
		children?: Snippet;
	} = $props();
</script>

<div class="card-wrapper">
	{#if title}
		<div class="card-header">
			<h3 class="card-title">{title}</h3>
		</div>
	{/if}
	<div class="card-body">
		{#if children}
			{@render children()}
		{/if}
	</div>
</div>

<style>
	.card-wrapper {
		background: rgba(30, 41, 59, 0.6);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		transition: all var(--duration-normal) var(--ease-out);
		overflow: hidden;
	}

	.card-wrapper:hover {
		border-color: var(--color-border-hover);
		box-shadow: var(--shadow-md), 0 0 30px rgba(124, 58, 237, 0.06);
	}

	.card-header {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-4) var(--space-5);
		border-bottom: 1px solid var(--color-border);
	}

	.card-title {
		font-size: var(--text-sm);
		font-weight: 700;
		color: var(--color-text);
	}

	.card-body {
		padding: var(--space-5);
	}
</style>
