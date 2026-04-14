import * as duckdb from "@duckdb/duckdb-wasm";

class DuckDBState {
  // db and conn are set once before ready=true; no reactivity needed on them.
  db: duckdb.AsyncDuckDB | null = null;
  conn: duckdb.AsyncDuckDBConnection | null = null;
  ready = $state(false);
  initError = $state<string | null>(null);
}

// Singleton reactive state — shared across all importers
export const duckdbState = new DuckDBState();

export async function initDuckDB(): Promise<void> {
  try {
    const bundles = duckdb.getJsDelivrBundles();
    const bundle = await duckdb.selectBundle(bundles);

    // Wrap the CDN worker URL in a Blob so it loads under the same origin
    const workerUrl = URL.createObjectURL(
      new Blob([`importScripts("${bundle.mainWorker}");`], {
        type: "text/javascript",
      }),
    );
    const worker = new Worker(workerUrl);
    const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
    const instance = new duckdb.AsyncDuckDB(logger, worker);
    await instance.instantiate(bundle.mainModule, bundle.pthreadWorker);
    URL.revokeObjectURL(workerUrl);

    duckdbState.db = instance;
    const conn = await instance.connect();
    duckdbState.conn = conn;

    // Load the spatial extension for GDAL support.
    // Try LOAD first (works when the extension is already cached or bundled);
    // fall back to INSTALL+LOAD to avoid an unnecessary CDN fetch.
    // Failure is non-fatal — errors surface only when validating those formats.
    try {
      try {
        await conn.query("LOAD spatial;");
      } catch {
        await conn.query("INSTALL spatial; LOAD spatial;");
      }
    } catch {
      console.warn("DuckDB spatial extension unavailable — GDAL support disabled.");
    }

    duckdbState.ready = true;
  } catch (e) {
    duckdbState.initError = e instanceof Error ? e.message : String(e);
  }
}
