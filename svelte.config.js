import { relative, sep } from 'node:path';

/** @type {import('@sveltejs/vite-plugin-svelte').SvelteConfig} */
const config = {
  compilerOptions: {
    // Force runes mode for all project files; undefined for node_modules (let libraries opt in).
    // Can be removed in Svelte 6 when runes become the default.
    runes: ({ filename }) => {
      const relativePath = relative(import.meta.dirname, filename);
      const pathSegments = relativePath.toLowerCase().split(sep);
      return pathSegments.includes('node_modules') ? undefined : true;
    },
  },
};

export default config;
