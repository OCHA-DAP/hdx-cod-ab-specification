<script lang="ts">
  import FileUpload from "$lib/components/FileUpload.svelte";
  import ResultsReport from "$lib/components/ResultsReport.svelte";
  import { duckdbState, initDuckDB } from "$lib/db/duckdb.svelte";
  import type { DatasetResult } from "$lib/runner";
  import { runValidation } from "$lib/runner";
  import { marked } from "marked";
  import { onMount, untrack } from "svelte";
  import overviewMd from "../../../specs/boundaries/README.md?raw";

  // Eagerly load all boundary source files. Adding/removing/reordering only
  // requires editing the `sources` list in specs/boundaries/README.md frontmatter.
  const sourceModules = import.meta.glob("../../../specs/boundaries/*.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;

  function stripFrontmatter(md: string): string {
    if (!md.startsWith("---")) return md;
    const end = md.indexOf("\n---", 3);
    return end === -1 ? md : md.slice(end + 4);
  }

  function parseSources(md: string): string[] {
    const fm = md.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
    return [...fm.matchAll(/^\s+-\s+(.+)$/gm)].map((m) => m[1].trim());
  }

  const specTabs = [
    { id: "overview", label: "Overview", md: overviewMd },
    ...parseSources(overviewMd).map((srcPath) => {
      const filename = srcPath.split("/").pop()!;
      const id = filename.replace(".md", "");
      const label = id.charAt(0).toUpperCase() + id.slice(1);
      const resolvedPath = srcPath.includes("/") ? srcPath : `specs/boundaries/${srcPath}`;
      const md = sourceModules[`../../../${resolvedPath}`] ?? "";
      return { id, label, md };
    }),
  ];

  let files = $state<File[]>([]);
  let running = $state(false);
  let result = $state<DatasetResult | null>(null);
  let runError = $state<string | null>(null);
  let showSpec = $state(true);
  let activeTab = $state("overview");
  let copyState = $state<"idle" | "copying" | "copied">("idle");

  async function copyPrompt() {
    copyState = "copying";
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}prompt`);
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      copyState = "copied";
      setTimeout(() => (copyState = "idle"), 2000);
    } catch {
      copyState = "idle";
    }
  }

  const validTabIds = new Set(specTabs.map((t) => t.id));

  function parseHash(hash: string): string {
    const h = hash.replace(/^#/, "");
    return validTabIds.has(h) ? h : "overview";
  }

  function buildHash(tab: string): string {
    return tab === "overview" ? "" : `#${tab}`;
  }

  onMount(() => {
    initDuckDB();

    activeTab = parseHash(window.location.hash);

    function onHashChange() {
      activeTab = parseHash(window.location.hash);
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  });

  $effect(() => {
    const hash = buildHash(activeTab);
    if (typeof window !== "undefined" && window.location.hash !== hash) {
      history.replaceState(null, "", hash || window.location.pathname);
    }
  });

  let activeTabHtml = $derived(
    marked(stripFrontmatter(specTabs.find((t) => t.id === activeTab)?.md ?? "")) as string,
  );

  $effect(() => {
    const f = files;
    if (f.length > 0 && duckdbState.ready) {
      untrack(() => {
        if (!running) handleRun();
      });
    }
  });

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
    <h1>COD-AB Specification & Validator</h1>
    <p class="subtitle">
      Validate UN OCHA administrative boundary files against the COD-AB specification — directly in
      your browser. No account, no upload, no server. Your files stay on your machine.
    </p>
    <p class="llm-hint">
      To validate with an LLM: <button
        class="copy-prompt-button"
        onclick={copyPrompt}
        disabled={copyState !== "idle"}
      >
        {copyState === "copied" ? "Copied!" : copyState === "copying" ? "Copying…" : "Copy prompt"}
      </button> then paste it into your LLM of choice.
    </p>
    <button
      class="spec-button"
      class:active={showSpec}
      onclick={() => {
        showSpec = !showSpec;
      }}
    >
      {showSpec ? "Hide specification" : "View specification"}
    </button>
  </header>

  {#if showSpec}
    <section class="spec">
      <nav class="spec-tabs">
        {#each specTabs as tab (tab.id)}
          <button
            class="spec-tab"
            class:active={activeTab === tab.id}
            onclick={(e) => {
              activeTab = tab.id;
              history.pushState(null, "", buildHash(tab.id));
              (e.currentTarget as HTMLButtonElement).blur();
            }}
          >
            {tab.label}
          </button>
        {/each}
      </nav>
      <div class="spec-content">
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html activeTabHtml}
      </div>
    </section>
  {/if}

  {#if duckdbState.initError}
    <p class="error">Failed to initialise DuckDB: {duckdbState.initError}</p>
  {:else if !duckdbState.ready}
    <p class="status">Initialising DuckDB…</p>
  {/if}

  <FileUpload bind:files disabled={!duckdbState.ready} />

  {#if running}
    <p class="status">
      Running checks<span class="dots"><span>.</span><span>.</span><span>.</span></span>
    </p>
  {/if}

  {#if runError}
    <p class="error">{runError}</p>
  {/if}

  {#if result}
    <div class="results-wide">
      <ResultsReport {result} />
    </div>
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
    margin-bottom: 2rem;
  }
  .results-wide {
    width: 960px;
    margin-left: calc((960px - 720px) / -2);
  }
  h1 {
    margin: 0 0 0.5rem;
    font-size: 1.6rem;
  }
  .subtitle {
    margin: 0 0 1rem;
    color: #6b7280;
    font-size: 0.95rem;
  }
  .llm-hint {
    margin: 0 0 1rem;
    color: #6b7280;
    font-size: 0.85rem;
  }

  .copy-prompt-button {
    display: inline;
    padding: 0;
    background: none;
    border: none;
    font-size: inherit;
    color: #374151;
    cursor: pointer;
    font-family: inherit;
    text-decoration: underline;
    text-underline-offset: 2px;
    text-decoration-color: #9ca3af;
  }
  .copy-prompt-button:hover:not(:disabled) {
    color: #111;
    text-decoration-color: #374151;
  }
  .copy-prompt-button:disabled {
    cursor: default;
    text-decoration: none;
  }
  .status {
    color: #6b7280;
    font-size: 0.9rem;
    margin: 0.5rem 0;
  }
  .dots span {
    animation: blink 1.2s infinite;
    opacity: 0;
  }
  .dots span:nth-child(2) {
    animation-delay: 0.2s;
  }
  .dots span:nth-child(3) {
    animation-delay: 0.4s;
  }
  @keyframes blink {
    0%,
    80%,
    100% {
      opacity: 0;
    }
    40% {
      opacity: 1;
    }
  }
  .error {
    color: #b91c1c;
    font-size: 0.9rem;
    margin: 0.5rem 0;
  }
  .spec-button {
    margin-top: 0.5rem;
    padding: 0.25rem 0.75rem;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 999px;
    font-size: 0.85rem;
    color: #374151;
    cursor: pointer;
    font-family: inherit;
    transition:
      background 0.1s,
      color 0.1s,
      border-color 0.1s;
  }
  .spec-button:hover {
    background: #e5e7eb;
  }
  .spec-button.active {
    background: #1d4ed8;
    border-color: #1d4ed8;
    color: white;
    font-weight: 600;
  }
  .spec-button.active:hover {
    background: #1e40af;
    border-color: #1e40af;
  }
  .spec {
    margin: 1.25rem 0;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    font-size: 0.9rem;
    line-height: 1.65;
  }
  .spec-tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid #e5e7eb;
    padding: 0 1rem;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .spec-tabs::-webkit-scrollbar {
    display: none;
  }
  .spec-tab {
    padding: 0.5rem 0.875rem;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    font-size: 0.85rem;
    color: #6b7280;
    cursor: pointer;
    white-space: nowrap;
    margin-bottom: -1px;
  }
  .spec-tab:hover {
    color: #111;
  }
  .spec-tab.active {
    color: #1d4ed8;
    border-bottom-color: #1d4ed8;
    font-weight: 600;
  }
  .spec-content {
    padding: 1.25rem 1.5rem;
  }
  .spec-content :global(h1) {
    font-size: 1.3rem;
    margin: 0 0 0.75rem;
  }
  .spec-content :global(h2) {
    font-size: 1.05rem;
    margin: 1.25rem 0 0.4rem;
  }
  .spec-content :global(h3) {
    font-size: 0.95rem;
    margin: 1rem 0 0.3rem;
  }
  .spec-content :global(p) {
    margin: 0.4rem 0;
  }
  .spec-content :global(ul),
  .spec-content :global(ol) {
    margin: 0.4rem 0;
    padding-left: 1.5rem;
  }
  .spec-content :global(table) {
    border-collapse: collapse;
    width: 100%;
    font-size: 0.85rem;
    margin: 0.5rem 0;
  }
  .spec-content :global(th),
  .spec-content :global(td) {
    border: 1px solid #d1d5db;
    padding: 0.35rem 0.6rem;
    text-align: left;
  }
  .spec-content :global(th) {
    background: #e5e7eb;
  }
  .spec-content :global(pre) {
    background: #e5e7eb;
    padding: 0.75rem 1rem;
    border-radius: 4px;
    overflow-x: auto;
    font-size: 0.82rem;
  }
  .spec-content :global(code) {
    font-size: 0.85em;
    background: #e5e7eb;
    padding: 0.1em 0.3em;
    border-radius: 3px;
  }
  .spec-content :global(pre code) {
    background: none;
    padding: 0;
  }
</style>
