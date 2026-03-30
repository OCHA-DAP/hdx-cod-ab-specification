import * as duckdb from "@duckdb/duckdb-wasm";

class DuckDBState {
  db = $state<duckdb.AsyncDuckDB | null>(null);
  conn = $state<duckdb.AsyncDuckDBConnection | null>(null);
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
    duckdbState.conn = await instance.connect();
    duckdbState.ready = true;
  } catch (e) {
    duckdbState.initError = e instanceof Error ? e.message : String(e);
  }
}
