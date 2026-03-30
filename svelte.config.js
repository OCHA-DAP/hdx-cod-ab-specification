import adapter from "@sveltejs/adapter-static";
import { relative, sep } from "node:path";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  compilerOptions: {
    // Force runes mode for all project files; undefined for node_modules (let libraries opt in).
    // Can be removed in Svelte 6 when runes become the default.
    runes: ({ filename }) => {
      const relativePath = relative(import.meta.dirname, filename);
      const pathSegments = relativePath.toLowerCase().split(sep);
      return pathSegments.includes("node_modules") ? undefined : true;
    },
  },
  kit: {
    adapter: adapter({
      fallback: "index.html",
    }),
  },
};

export default config;
