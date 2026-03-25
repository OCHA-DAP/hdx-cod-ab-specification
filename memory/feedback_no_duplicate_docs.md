---
name: Do not duplicate spec content
description: Don't copy spec content into other files — link to the source instead
type: feedback
---

Don't duplicate spec/documentation content into other files (e.g. a validator prompt). Instead, link to the authoritative source files and instruct the AI or tool to fetch them.

**Why:** The specs change often. Duplicating them creates maintenance burden and drift.

**How to apply:** When building any tooling that needs spec content (validators, prompts, tests), reference the canonical spec files by URL/path rather than embedding their text.
