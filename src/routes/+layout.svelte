<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<main class="app-main">
	{@render children?.()}
</main>

<style>
	.app-main {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
</style>
