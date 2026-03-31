# hdx-cod-ab-specification

Normative specification for the **COD-AB (Common Operational Dataset – Administrative Boundaries)** format published by UN OCHA. It defines the required file structure, column schemas, naming conventions, coordinate reference systems, and metadata registry layout for admin boundary datasets on HDX.

## Specification files

- [specs/boundaries.md](specs/boundaries.md) — Admin boundary file overview, column order, and known deviations
- [specs/boundaries/names.md](specs/boundaries/names.md) — Name and language column schema
- [specs/boundaries/codes.md](specs/boundaries/codes.md) — P-code and version column schema
- [specs/boundaries/attributes.md](specs/boundaries/attributes.md) — Date, computed, and identifier column schema
- [specs/file-structure.md](specs/file-structure.md) — Directory and file naming conventions, CRS requirements
- [specs/metadata.md](specs/metadata.md) — Metadata registry table schema

## Validating a dataset with an LLM

This repository includes an [`llms.txt`](llms.txt) file — a machine-readable index following the [llms.txt convention](https://llmstxt.org/) that points LLMs to the relevant spec content. It also includes a self-contained validator prompt.

To interactively validate a COD-AB dataset:

1. Open a conversation with an LLM that supports URL fetching (e.g. Claude, ChatGPT with browsing).
2. Paste this message into the chat:

   ```
   Please fetch https://raw.githubusercontent.com/OCHA-DAP/hdx-cod-ab-specification/main/validator.md and follow the instructions there to validate my COD-AB dataset.
   ```

3. Follow the guided prompts to check your dataset against the spec.

Alternatively, open [`validator.md`](validator.md) and paste its contents directly into a chat session — no URL fetching needed.
