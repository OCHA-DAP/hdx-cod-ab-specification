# AGENTS.md

This file provides guidance to AI Agents when working with code in this repository.

## Repository Purpose

This is a **specification repository** for the COD-AB (Common Operational Dataset – Administrative Boundaries) format published by UN OCHA. It contains Markdown specifications, JSON schemas (in `schemas/`), and example data (in `examples/`). There is no build system, test suite, or application code.

## Structure

- `specs/boundaries.md` — Main specification for admin boundary file layout, column schemas, naming conventions, CRS, and known deviations
- `specs/metadata.md` — Specification for the metadata registry table schema
- `schemas/` — JSON schemas (currently empty, to be populated)
- `examples/` — Example datasets (currently empty, to be populated)

## Editing Guidelines

- Preserve RFC 2119 keyword semantics when editing specs — changes to MUST/SHOULD/MAY have normative impact
- The "Known Deviations" sections document gaps between the spec and current real-world data; keep these accurate as the spec evolves
- New column additions should include: column name, type, max length (if string), nullable status, and notes — matching the table format in the existing specs
