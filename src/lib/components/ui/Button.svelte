<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		variant = 'default',
		disabled = false,
		onclick,
		children
	}: {
		variant?: 'primary' | 'ghost' | 'danger' | 'default';
		disabled?: boolean;
		onclick?: (e: MouseEvent) => void;
		children?: Snippet;
	} = $props();

	let classList = $derived(() => {
		const classes = ['btn'];
		if (variant === 'primary') classes.push('btn-primary');
		else if (variant === 'ghost') classes.push('btn-ghost');
		else if (variant === 'danger') classes.push('btn-danger');
		return classes.join(' ');
	});
</script>

<button
	class={classList()}
	{disabled}
	{onclick}
>
	{#if children}
		{@render children()}
	{/if}
</button>

<style>
	button {
		position: relative;
		overflow: hidden;
	}

	button::before {
		content: '';
		position: absolute;
		top: 50%;
		left: 50%;
		width: 0;
		height: 0;
		background: rgba(255, 255, 255, 0.12);
		border-radius: 50%;
		transform: translate(-50%, -50%);
		transition: width 0.4s ease, height 0.4s ease;
	}

	button:active::before {
		width: 200px;
		height: 200px;
	}
</style>
