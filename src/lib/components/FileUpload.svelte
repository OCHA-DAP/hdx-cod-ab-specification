<script lang="ts">
  let {
    files = $bindable<File[]>([]),
    disabled = false,
  }: {
    files?: File[];
    disabled?: boolean;
  } = $props();

  // Single-file formats. GeoJSON (.json) is intentionally omitted from
  // this list to avoid matching arbitrary JSON files in directory uploads;
  // it is still accepted by the file picker via the accept attribute below.
  const SINGLE_EXTS = [
    // Native DuckDB
    ".parquet",
    // GDAL / ST_Read — single-file vector formats
    ".geojson",
    ".geojsonl",
    ".geojsonseq",
    ".gpkg",
    ".fgb",
    ".kml",
    ".kmz",
    ".gml",
    ".gpx",
    ".sqlite",
  ];
  const SHP_EXTS = [".shp", ".dbf", ".shx", ".prj", ".cpg"];

  let dragging = $state(false);
  let hasGDB = $state(false);

  function isGDB(file: File): boolean {
    const relPath =
      (file as File & { webkitRelativePath: string }).webkitRelativePath || "";
    return /\.gdb\//i.test(relPath);
  }

  function isIncluded(file: File): boolean {
    const name = file.name.toLowerCase();
    return (
      SINGLE_EXTS.some((ext) => name.endsWith(ext)) ||
      SHP_EXTS.some((ext) => name.endsWith(ext))
    );
  }

  function sortKey(file: File): string {
    return (
      (file as File & { webkitRelativePath: string }).webkitRelativePath ||
      file.name
    );
  }

  function filterAndSort(fileList: File[]): File[] {
    hasGDB = fileList.some(isGDB);
    return fileList
      .filter(isIncluded)
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  }

  /** Build a human-readable summary: individual filenames and shapefile stems. */
  function summarize(fileList: File[]): string {
    const shpStems = new Map<string, string>(); // lowercased stem -> display name
    const singles: string[] = [];
    for (const f of fileList) {
      const relPath =
        (f as File & { webkitRelativePath: string }).webkitRelativePath || "";
      const lname = f.name.toLowerCase();
      if (SHP_EXTS.some((ext) => lname.endsWith(ext))) {
        const fullPath = relPath || f.name;
        const stem = fullPath.slice(0, fullPath.lastIndexOf(".")).toLowerCase();
        // Prefer the actual .shp filename as the display name
        if (lname.endsWith(".shp") || !shpStems.has(stem)) {
          shpStems.set(
            stem,
            lname.endsWith(".shp") ? f.name : stem.split("/").pop()! + ".shp",
          );
        }
        continue;
      }
      singles.push(f.name);
    }
    return [...singles, ...Array.from(shpStems.values()).sort()].join(", ");
  }

  async function readAllEntries(
    reader: FileSystemDirectoryReader,
  ): Promise<FileSystemEntry[]> {
    return new Promise((resolve) => {
      const results: FileSystemEntry[] = [];
      function readBatch() {
        reader.readEntries((batch) => {
          if (batch.length === 0) resolve(results);
          else {
            results.push(...batch);
            readBatch();
          }
        });
      }
      readBatch();
    });
  }

  async function readEntry(
    entry: FileSystemEntry,
    basePath = "",
  ): Promise<File[]> {
    if (entry.isFile) {
      // Get the File object from the entry, then immediately read its bytes.
      // We must read eagerly here: `new File([f], ...)` only holds a lazy
      // reference to `f`, which can become stale by the time DuckDB later
      // calls arrayBuffer(). Creating the File from a concrete Uint8Array
      // guarantees the data is self-contained.
      const f = await new Promise<File>((resolve, reject) => {
        (entry as FileSystemFileEntry).file(resolve, reject);
      });
      const path = basePath ? `${basePath}/${f.name}` : f.name;
      const data = new Uint8Array(await f.arrayBuffer());
      const located = new File([data], f.name, {
        type: f.type,
        lastModified: f.lastModified,
      });
      Object.defineProperty(located, "webkitRelativePath", {
        value: path,
        writable: false,
        configurable: true,
        enumerable: true,
      });
      return [located];
    } else if (entry.isDirectory) {
      const newBase = basePath ? `${basePath}/${entry.name}` : entry.name;
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const entries = await readAllEntries(reader);
      const nested = await Promise.all(
        entries.map((e) => readEntry(e, newBase)),
      );
      return nested.flat();
    }
    return [];
  }

  function handleDragOver(event: DragEvent) {
    if (disabled) return;
    event.preventDefault();
    dragging = true;
  }

  function handleDragLeave(event: DragEvent) {
    // Only clear dragging when leaving the zone entirely (not entering a child)
    const zone = event.currentTarget as HTMLElement;
    if (!zone.contains(event.relatedTarget as Node)) {
      dragging = false;
    }
  }

  async function handleDrop(event: DragEvent) {
    event.preventDefault();
    if (disabled) return;
    dragging = false;
    const items = Array.from(event.dataTransfer?.items ?? []);
    const entries = items
      .map((item) => item.webkitGetAsEntry())
      .filter(Boolean) as FileSystemEntry[];
    try {
      const allFiles = (
        await Promise.all(entries.map((e) => readEntry(e)))
      ).flat();
      files = filterAndSort(allFiles);
    } catch (e) {
      console.error("Failed to read dropped files:", e);
    }
  }

  function handleBrowse(event: Event) {
    const input = event.target as HTMLInputElement;
    files = filterAndSort(Array.from(input.files ?? []));
  }
</script>

<div
  class="drop-zone"
  class:dragging
  class:disabled
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
  role="region"
  aria-label="File upload drop zone"
>
  <p class="drop-message">Drop files or folders here</p>
  <label class="browse-label">
    <input
      type="file"
      accept={[...SINGLE_EXTS, ".json", ...SHP_EXTS].join(",")}
      multiple
      onchange={handleBrowse}
      {disabled}
      class="file-input"
    />
    <span class="browse-link">or browse files</span>
  </label>

  {#if files.length > 0}
    <p class="file-list">
      {files.length}
      {files.length === 1 ? "file" : "files"} selected:
      <span class="filenames">{summarize(files)}</span>
    </p>
  {/if}
  {#if hasGDB}
    <p class="gdb-warning">
      File Geodatabase (.gdb) is not supported — convert to GeoPackage (.gpkg)
      using QGIS or GDAL.
    </p>
  {/if}
</div>

<style>
  .drop-zone {
    margin: 1rem 0;
    border: 2px dashed #9ca3af;
    border-radius: 8px;
    padding: 2rem 1.5rem;
    text-align: center;
    transition:
      border-color 0.15s,
      background-color 0.15s;
    background: #f9fafb;
  }
  .drop-zone.dragging {
    border-color: #1d4ed8;
    background: #eff6ff;
  }
  .drop-zone.disabled {
    opacity: 0.5;
    pointer-events: none;
  }
  .drop-message {
    margin: 0 0 0.5rem;
    font-size: 0.95rem;
    color: #374151;
  }
  .browse-label {
    display: inline-block;
    cursor: pointer;
  }
  .file-input {
    position: absolute;
    opacity: 0;
    width: 0.1px;
    height: 0.1px;
    overflow: hidden;
  }
  .browse-link {
    font-size: 0.875rem;
    color: #1d4ed8;
    text-decoration: underline;
    cursor: pointer;
  }
  .browse-label:focus-within .browse-link {
    outline: 2px solid #1d4ed8;
    outline-offset: 2px;
    border-radius: 2px;
  }
  .file-list {
    margin: 1rem 0 0;
    font-size: 0.85rem;
    color: #374151;
  }
  .filenames {
    font-family: monospace;
    color: #111;
  }
  .gdb-warning {
    margin: 0.5rem 0 0;
    font-size: 0.85rem;
    color: #92400e;
    background: #fef3c7;
    border: 1px solid #f59e0b;
    border-radius: 4px;
    padding: 0.4rem 0.6rem;
  }
</style>
