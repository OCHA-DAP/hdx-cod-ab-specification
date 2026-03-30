# AGENTS.md

This file provides guidance to AI Agents when working with code in this repository.

## Repository Purpose

This is a **specification repository** for the COD-AB (Common Operational Dataset – Administrative Boundaries) format published by UN OCHA. It contains Markdown specifications and example data (in `examples/`). There is no build system, test suite, or application code.

## Structure

- `specs/boundaries.md` — Main specification for admin boundary file layout, column schemas, naming conventions, CRS, and known deviations
- `specs/metadata.md` — Specification for the metadata registry table schema
- `examples/` — Example datasets
- `scripts/` — Validation scripts callable by AI agents (see `scripts/index.json` for the manifest)

## Validation Scripts

When a user asks you to validate a COD-AB file, check `scripts/index.json` for available scripts and run them with the Bash tool. Each script accepts a file path and returns JSON to stdout.

Example:

```bash
uv run scripts/check_versions.py path/to/file.gpkg
```

Scripts exit 0 on pass, 1 on violations. After running one or more validation scripts, always present results as a formatted summary report using a table where:

- Rows are files
- Columns are validation checks, using clean human-readable names (e.g. `check_versions` → "Version")
- Cells show Pass/Fail

When validating multiple countries (or multiple version groups within a country), use a `###` heading per group (country name and folder) and render one table per group. Follow each table with any violations (MUST rules broken), warnings (SHOULD rules broken), or info messages for that group.

## Editing Guidelines

- Preserve RFC 2119 keyword semantics when editing specs — changes to MUST/SHOULD/MAY have normative impact
- The "Known Deviations" sections document gaps between the spec and current real-world data; keep these accurate as the spec evolves
- New column additions should include: column name, type, max length (if string), nullable status, and notes — matching the table format in the existing specs
