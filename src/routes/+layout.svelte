<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<div class="app-shell">
	<header class="app-header">
		<div class="header-gradient-line"></div>
		<div class="header-content">
			<div class="header-branding">
				<div class="logo-icon">
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
						<rect x="2" y="2" width="8" height="8" rx="2" fill="url(#grad1)" opacity="0.9"/>
						<rect x="14" y="2" width="8" height="8" rx="2" fill="url(#grad1)" opacity="0.7"/>
						<rect x="2" y="14" width="8" height="8" rx="2" fill="url(#grad1)" opacity="0.7"/>
						<rect x="14" y="14" width="8" height="8" rx="2" fill="url(#grad1)" opacity="0.5"/>
						<defs>
							<linearGradient id="grad1" x1="0" y1="0" x2="24" y2="24">
								<stop offset="0%" stop-color="#7c3aed"/>
								<stop offset="100%" stop-color="#06b6d4"/>
							</linearGradient>
						</defs>
					</svg>
				</div>
				<div class="header-text">
					<h1 class="app-title">
						<span class="gradient-text">Asset Template Factory</span>
					</h1>
					<p class="app-subtitle">Visual Workflow Builder</p>
				</div>
			</div>
		</div>
	</header>

	<main class="app-main">
		{@render children?.()}
	</main>
</div>

<style>
	.app-shell {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		background-color: var(--color-base);
	}

	.app-header {
		position: relative;
		flex-shrink: 0;
		background: rgba(17, 24, 39, 0.85);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border-bottom: 1px solid var(--color-border);
		z-index: var(--z-sticky);
	}

	.header-gradient-line {
		height: 2px;
		background: var(--gradient-accent);
		background-size: 200% 100%;
		animation: gradientShift 4s ease-in-out infinite;
	}

	@keyframes gradientShift {
		0%   { background-position: 0% 50%; }
		50%  { background-position: 100% 50%; }
		100% { background-position: 0% 50%; }
	}

	.header-content {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-3) var(--space-6);
		max-width: 100%;
	}

	.header-branding {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.logo-icon {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.header-text {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.app-title {
		font-size: var(--text-lg);
		font-weight: 800;
		letter-spacing: -0.02em;
		line-height: 1.2;
	}

	.app-subtitle {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		font-weight: 500;
		letter-spacing: 0.03em;
	}

	.app-main {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
</style>
