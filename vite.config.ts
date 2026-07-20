import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
			// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
			// See https://svelte.dev/docs/kit/adapters for more information about adapters.
			adapter: adapter(),
			alias: {
				'@vectrace/core': './src/packages/core/src/index.ts',
				'@vectrace/preprocess': './src/packages/preprocess/src/index.ts',
				'@vectrace/quantize': './src/packages/quantize/src/index.ts',
				'@vectrace/trace': './src/packages/trace/src/index.ts',
				'@vectrace/loader/node': './src/packages/loader/src/node.ts',
				'@vectrace/loader/browser': './src/packages/loader/src/browser.ts',
				'@vectrace/loader': './src/packages/loader/src/index.ts',
				'@vectrace/export': './src/packages/export/src/index.ts'
			}
		})
	],
	resolve: {
		alias: {
			'@vectrace/core': path.resolve('./src/packages/core/src/index.ts'),
			'@vectrace/preprocess': path.resolve('./src/packages/preprocess/src/index.ts'),
			'@vectrace/quantize': path.resolve('./src/packages/quantize/src/index.ts'),
			'@vectrace/trace': path.resolve('./src/packages/trace/src/index.ts'),
			'@vectrace/loader/node': path.resolve('./src/packages/loader/src/node.ts'),
			'@vectrace/loader/browser': path.resolve('./src/packages/loader/src/browser.ts'),
			'@vectrace/loader': path.resolve('./src/packages/loader/src/index.ts'),
			'@vectrace/export': path.resolve('./src/packages/export/src/index.ts')
		}
	}
});
