<script lang="ts">
  import { onMount } from "svelte";
  import { initDuckDB } from "$lib/db/duckdb.svelte";

  let { children } = $props();

  onMount(async () => {
    await initDuckDB();
  });
</script>

{@render children()}
