<script lang="ts">
  import type { FileResult } from "$lib/runner";
  import MapPreview from "./MapPreview.svelte";
  import MessageList from "./MessageList.svelte";

  type CheckMeta = { name: string; label: string; specSection: string };
  let { fileResult, checks }: { fileResult: FileResult; checks: CheckMeta[] } = $props();

  let mapOpen = $state(Object.values(fileResult.checks).some((r) => r.overlayGeojson != null));

  let overlays = $derived(
    Object.values(fileResult.checks)
      .filter((r) => r.overlayGeojson != null)
      .map((r) => r.overlayGeojson!),
  );
</script>

<div class="file-result">
  <h3 class="filename">{fileResult.fileName}</h3>

  {#if fileResult.preview}
    <button class="map-toggle" onclick={() => (mapOpen = !mapOpen)}>
      {mapOpen ? "▼ Hide map" : "▶ Show map"}
    </button>
    {#if mapOpen}
      <MapPreview preview={fileResult.preview} {overlays} />
    {/if}
  {/if}

  {#if fileResult.loadError}
    <p class="load-error">Load error: {fileResult.loadError}</p>
  {:else}
    <div class="badges">
      {#each checks as check (check.name)}
        {@const r = fileResult.checks[check.name]}
        {#if r}
          <span class="badge" class:pass={r.passed} class:fail={!r.passed}>
            {check.label}: {r.passed ? "Pass" : "Fail"}
          </span>
        {/if}
      {/each}
    </div>

    {#each checks as check (check.name)}
      {@const r = fileResult.checks[check.name]}
      {#if r && (r.violations.length || r.warnings.length || r.info.length)}
        <details open={!r.passed || r.warnings.length > 0}>
          <summary class="check-summary">
            <span class="check-label">{check.label}</span>
            <span class="spec-ref">spec: {check.specSection}</span>
          </summary>
          <div class="check-detail">
            <MessageList violations={r.violations} warnings={r.warnings} info={r.info} />
          </div>
        </details>
      {/if}
    {/each}
  {/if}
</div>

<style>
  .file-result {
    margin: 1.5rem 0;
    padding: 1rem 1.25rem;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    background: #fafafa;
  }
  .filename {
    margin: 0 0 0.75rem;
    font-size: 1rem;
    font-family: monospace;
    font-weight: 600;
    color: #111;
  }
  .load-error {
    color: #b91c1c;
    font-size: 0.9rem;
  }
  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-bottom: 0.75rem;
  }
  .badge {
    padding: 0.2rem 0.6rem;
    border-radius: 4px;
    font-size: 0.8rem;
    font-weight: 600;
  }
  .badge.pass {
    background: #dcfce7;
    color: #15803d;
    border: 1px solid #bbf7d0;
  }
  .badge.fail {
    background: #fee2e2;
    color: #b91c1c;
    border: 1px solid #fecaca;
  }
  details {
    margin-top: 0.5rem;
  }
  .check-summary {
    cursor: pointer;
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.3rem 0;
    user-select: none;
  }
  .check-label {
    font-weight: 600;
    font-size: 0.9rem;
  }
  .spec-ref {
    font-size: 0.75rem;
    color: #6b7280;
  }
  .check-detail {
    padding-left: 1rem;
    border-left: 2px solid #e5e7eb;
    margin-left: 0.25rem;
  }
  .map-toggle {
    background: none;
    border: none;
    padding: 0;
    margin-bottom: 0.6rem;
    font-size: 0.8rem;
    color: #6b7280;
    cursor: pointer;
  }
  .map-toggle:hover {
    color: #111;
  }
</style>
