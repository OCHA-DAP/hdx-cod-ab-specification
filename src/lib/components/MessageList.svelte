<script lang="ts">
  let {
    violations = [],
    warnings = [],
    info = [],
  }: {
    violations?: string[];
    warnings?: string[];
    info?: string[];
  } = $props();
</script>

{#if violations.length}
  <h4 class="heading violation-heading">Violations (MUST)</h4>
  <ul class="message-list violations">
    {#each violations as v}<li>{v}</li>{/each}
  </ul>
{/if}

{#if warnings.length}
  <h4 class="heading warning-heading">Warnings (SHOULD)</h4>
  <ul class="message-list warnings">
    {#each warnings as w}<li>{w}</li>{/each}
  </ul>
{/if}

{#if info.length}
  <h4 class="heading info-heading">Info</h4>
  <ul class="message-list info-list">
    {#each info as i}<li>{i}</li>{/each}
  </ul>
{/if}

<style>
  .heading {
    margin: 0.75rem 0 0.25rem;
    font-size: 0.85rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .violation-heading {
    color: #b91c1c;
  }
  .warning-heading {
    color: #b45309;
  }
  .info-heading {
    color: #1d4ed8;
  }
  .message-list {
    margin: 0 0 0.5rem;
    padding-left: 1.25rem;
  }
  .message-list li {
    margin: 0.25rem 0;
    font-size: 0.9rem;
    line-height: 1.5;
  }
</style>
