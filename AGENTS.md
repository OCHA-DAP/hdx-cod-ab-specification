# COD-AB Validator

A browser-based validation tool for UN OCHA COD-AB (Common Operational Dataset – Administrative Boundaries) files. All validation runs client-side via DuckDB-WASM — no server required.

## Tech Stack

- **SvelteKit 2** with **Svelte 5 runes** (`$state`, `$derived`, `$bindable`)
- **TypeScript** (strict mode)
- **DuckDB-WASM** with spatial extension for geospatial queries
- **Vite** with `@sveltejs/adapter-static` (fully prerendered static site)

## Commands

```bash
npm run dev       # Start dev server
npm run build     # Build static site to ./build/
npm run preview   # Preview production build
npm run check     # Type-check (svelte-check + tsc)
```

## Project Structure

```
src/
  routes/           # SvelteKit pages and layouts
  lib/
    checks/         # Validation logic (registry.ts + check_*.ts files)
    components/     # Svelte UI components
    db/             # DuckDB singleton and file loader
    runner.ts       # Validation orchestrator
specs/              # COD-AB specification markdown docs
examples/           # Sample test data (multiple formats)
```

## Adding a Validation Check

1. Create `src/lib/checks/check_<name>.ts` implementing the `Check` interface from `types.ts`
2. Import and add it to the array in `registry.ts`

No other files need to change. Each check's `run()` returns `{ violations, warnings, info }`.

## File Format Notes

- **Single-file**: Parquet, GeoJSON, GeoPackage, KML, FlatGeobuf, etc.
- **Shapefiles**: Grouped by stem; requires `.shp` + sidecars (`.dbf`, `.shx`, `.prj`, `.cpg`)

Multi-layer files (e.g. GeoPackage) produce one result per layer.

## DuckDB-WASM Notes

- Initialized as singleton on first layout mount (`src/lib/db/duckdb.svelte.ts`)
- Requires COOP/COEP headers (configured in `vite.config.ts`) for `SharedArrayBuffer`
- Spatial extension loaded at init (non-fatal if unavailable)
- Files registered in DuckDB's virtual FS before querying
