<script lang="ts">
  let {
    files = $bindable<File[]>([]),
    disabled = false,
  }: {
    files?: File[];
    disabled?: boolean;
  } = $props();

  function filterAndSort(fileList: File[]): File[] {
    return fileList
      .filter((f) => f.name.toLowerCase().endsWith(".parquet"))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function handleFiles(event: Event) {
    const input = event.target as HTMLInputElement;
    files = filterAndSort(Array.from(input.files ?? []));
  }

  function handleDirectory(event: Event) {
    const input = event.target as HTMLInputElement;
    files = filterAndSort(Array.from(input.files ?? []));
  }
</script>

<div class="upload" class:disabled>
  <div class="upload-row">
    <label class="upload-label">
      <span class="upload-text">Parquet file(s):</span>
      <input
        type="file"
        accept=".parquet"
        multiple
        onchange={handleFiles}
        {disabled}
        class="file-input"
      />
      <span class="upload-button" aria-hidden="true">Choose files…</span>
    </label>

    <label class="upload-label">
      <span class="upload-text">Or a directory:</span>
      <input
        type="file"
        webkitdirectory
        onchange={handleDirectory}
        {disabled}
        class="file-input"
      />
      <span class="upload-button" aria-hidden="true">Choose directory…</span>
    </label>
  </div>

  {#if files.length > 0}
    <p class="file-list">
      {files.length}
      {files.length === 1 ? "file" : "files"} selected:
      <span class="filenames">{files.map((f) => f.name).join(", ")}</span>
    </p>
  {/if}
</div>

<style>
  .upload {
    margin: 1rem 0;
  }
  .upload-row {
    display: flex;
    gap: 1rem;
    align-items: flex-end;
    flex-wrap: wrap;
  }
  .upload-label {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .upload-text {
    font-size: 0.9rem;
    color: #374151;
  }
  .file-input {
    /* visually hidden, activated by the button below */
    position: absolute;
    opacity: 0;
    width: 0.1px;
    height: 0.1px;
    overflow: hidden;
  }
  .upload-button {
    display: inline-block;
    padding: 0.4rem 1rem;
    background: #1d4ed8;
    color: white;
    border-radius: 4px;
    font-size: 0.875rem;
    cursor: pointer;
    width: fit-content;
  }
  .upload.disabled .upload-button {
    background: #9ca3af;
    cursor: not-allowed;
  }
  .upload-label:focus-within .upload-button {
    outline: 2px solid #1d4ed8;
    outline-offset: 2px;
  }
  .file-list {
    margin: 0.5rem 0 0;
    font-size: 0.85rem;
    color: #374151;
  }
  .filenames {
    font-family: monospace;
    color: #111;
  }
</style>
