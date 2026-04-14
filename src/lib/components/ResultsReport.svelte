<script lang="ts">
  import { checks, hierarchyChecks } from "$lib/checks/registry";
  import type { DatasetResult } from "$lib/runner";
  import CheckRow from "./CheckRow.svelte";

  const allChecks = [...checks, ...hierarchyChecks];

  let { result }: { result: DatasetResult } = $props();

  let totalViolations = $derived(
    result.files.reduce(
      (sum, f) => sum + Object.values(f.checks).reduce((s, r) => s + r.violations.length, 0),
      0,
    ),
  );

  let allPassed = $derived(totalViolations === 0 && result.files.every((f) => !f.loadError));
</script>

<section class="report">
  <h2 class="report-title">Validation Report</h2>

  <div class="summary" class:all-passed={allPassed} class:has-issues={!allPassed}>
    {result.files.length}
    {result.files.length === 1 ? "layer" : "layers"} checked &nbsp;·&nbsp;
    {totalViolations}
    {totalViolations === 1 ? "violation" : "violations"}
    {#if allPassed}
      &nbsp;— all checks passed
    {/if}
  </div>

  {#each result.files as fileResult (fileResult.fileName)}
    <CheckRow {fileResult} checks={allChecks} />
  {/each}
</section>

<style>
  .report {
    margin-top: 2rem;
  }
  .report-title {
    font-size: 1.25rem;
    margin: 0 0 0.75rem;
  }
  .summary {
    padding: 0.6rem 1rem;
    border-radius: 4px;
    font-size: 0.9rem;
    font-weight: 500;
    margin-bottom: 0.5rem;
  }
  .summary.all-passed {
    background: #dcfce7;
    color: #15803d;
    border: 1px solid #bbf7d0;
  }
  .summary.has-issues {
    background: #fee2e2;
    color: #b91c1c;
    border: 1px solid #fecaca;
  }
</style>
