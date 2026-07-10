<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		variant = 'info',
		children
	}: {
		variant?: 'pending' | 'running' | 'done' | 'error' | 'info';
		children?: Snippet;
	} = $props();

	const iconMap: Record<string, string> = {
		pending: '⏳',
		running: '🔄',
		done: '✅',
		error: '❌',
		info: 'ℹ️'
	};

	let badgeClass = $derived(`badge badge-${variant}`);
	let icon = $derived(iconMap[variant] ?? '');
</script>

<span class={badgeClass}>
	{#if icon}
		<span class="badge-icon" class:spin={variant === 'running'}>{icon}</span>
	{/if}
	{#if children}
		{@render children()}
	{/if}
</span>

<style>
	.badge-icon {
		font-size: 0.65rem;
		line-height: 1;
		display: inline-flex;
	}

	.spin {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}
</style>
