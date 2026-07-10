// Disable Server-Side Rendering (SSR) for the workflow builder page
// because Svelte Flow relies heavily on browser-only DOM APIs and measurements.
export const ssr = false;
export const prerender = false;
