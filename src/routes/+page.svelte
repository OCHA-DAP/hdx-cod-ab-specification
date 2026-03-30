<script lang="ts">
  import { duckdbState } from "$lib/db/duckdb.svelte";
  import { runValidation } from "$lib/runner";
  import type { DatasetResult } from "$lib/runner";
  import FileUpload from "$lib/components/FileUpload.svelte";
  import ResultsReport from "$lib/components/ResultsReport.svelte";

  let files = $state<File[]>([]);
  let running = $state(false);
  let result = $state<DatasetResult | null>(null);
  let runError = $state<string | null>(null);

  let canRun = $derived(
    duckdbState.ready && files.length > 0 && !running,
  );

  async function handleRun() {
    const { db, conn } = duckdbState;
    if (!db || !conn) return;
    running = true;
    result = null;
    runError = null;
    try {
      result = await runValidation(files, db, conn);
    } catch (e) {
      runError = e instanceof Error ? e.message : String(e);
    } finally {
      running = false;
    }
  }
</script>

<main>
  <header>
    <h1>COD-AB Data Validator</h1>
    <p class="subtitle">
      Validate administrative boundary files against the COD-AB specification.
    </p>
  </header>

  {#if duckdbState.initError}
    <p class="error">Failed to initialise DuckDB: {duckdbState.initError}</p>
  {:else if !duckdbState.ready}
    <p class="status">Initialising DuckDB…</p>
  {/if}

  <FileUpload bind:files disabled={!duckdbState.ready} />

  <button onclick={handleRun} disabled={!canRun} class="run-button">
    {running ? "Running…" : "Validate"}
  </button>

  {#if running}
    <p class="status">Running checks…</p>
  {/if}

  {#if runError}
    <p class="error">{runError}</p>
  {/if}

  {#if result}
    <ResultsReport {result} />
  {/if}
</main>

<style>
  main {
    max-width: 720px;
    margin: 2rem auto;
    padding: 0 1.5rem;
    font-family: system-ui, sans-serif;
    color: #111;
  }
  header {
    margin-bottom: 1.5rem;
  }
  h1 {
    margin: 0 0 0.25rem;
    font-size: 1.6rem;
  }
  .subtitle {
    margin: 0;
    color: #6b7280;
    font-size: 0.95rem;
  }
  .status {
    color: #6b7280;
    font-size: 0.9rem;
    margin: 0.5rem 0;
  }
  .error {
    color: #b91c1c;
    font-size: 0.9rem;
    margin: 0.5rem 0;
  }
  .run-button {
    padding: 0.45rem 1.25rem;
    background: #1d4ed8;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    margin-top: 0.25rem;
  }
  .run-button:disabled {
    background: #9ca3af;
    cursor: not-allowed;
  }
  .run-button:not(:disabled):hover {
    background: #1e40af;
  }
</style>
