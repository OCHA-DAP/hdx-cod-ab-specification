import svelte from "@astrojs/svelte";
import { defineConfig } from "astro/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: process.env.BASE_PATH ?? "",
  integrations: [svelte()],
  vite: {
    plugins: [
      {
        name: "configure-response-headers",
        configureServer(server) {
          server.middlewares.use((_req, res, next) => {
            res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
            res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
            next();
          });
        },
      },
    ],
    optimizeDeps: { exclude: ["@duckdb/duckdb-wasm"] },
    resolve: { alias: { $lib: path.resolve(__dirname, "src/lib") } },
  },
});
