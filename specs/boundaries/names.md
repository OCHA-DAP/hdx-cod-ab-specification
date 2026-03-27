---
version: 0.1.0-draft
referenced_by: validator.md
---

# Names

## Name Columns

Each admin level N file contains name columns for all ancestor levels 0 through N. For each level L (0 ≤ L ≤ N):

| Column         | Type   | Max length | Notes                                                     |
| -------------- | ------ | ---------- | --------------------------------------------------------- |
| `adm{L}_name`  | string | 100        | Name in the primary language (`lang`)                     |
| `adm{L}_name1` | string | 100        | Name in the first alternate language (`lang1`), nullable  |
| `adm{L}_name2` | string | 100        | Name in the second alternate language (`lang2`), nullable |
| `adm{L}_name3` | string | 100        | Name in the third alternate language (`lang3`), nullable  |

`adm{L}_name` MUST be present and non-null for all rows. `adm{L}_name1`, `adm{L}_name2`, and `adm{L}_name3` are REQUIRED columns but MAY contain null values. A name column MUST be null if the corresponding language column (`lang1`, `lang2`, `lang3`) is null.

### Name Value Consistency

Name values within a dataset MUST be internally consistent in style. The following requirements apply to all name columns:

- **No ALL CAPS names.** Names MUST NOT be fully uppercased (e.g., `KANDAHAR` is not acceptable; use `Kandahar`). Individual words in acronyms or established abbreviations that are conventionally uppercase are permitted (e.g., `DRC`).
- **No indiscriminate auto-capitalization.** Names MUST NOT apply title-case capitalization mechanically to every word. Language-specific capitalization rules MUST be respected. In particular, function words and particles such as prepositions and articles (e.g., `de`, `do`, `da`, `di`, `du`, `van`, `von`, `of`, `al-`) MUST be lowercased when they appear in the interior of a name, following the conventions of the relevant language (e.g., `Río de la Plata`, not `Río De La Plata`).
- **Consistent use of abbreviated vs. full forms.** Within a single name column, all names MUST use either the abbreviated form or the full form of a descriptor — not a mixture. For example, if `Special` is used in one name, `SP` MUST NOT appear in another (e.g., all rows should use `Special Administrative Region` or all should use `SAR`, not a mix). Abbreviations that are part of the official name of a unit (i.e., the full official name contains the abbreviation) are permitted.
- **Consistent script and encoding.** All values within a single name column MUST be in the script and encoding appropriate for the declared language (`lang`, `lang1`, etc.) and MUST be consistently encoded throughout the file (e.g., no mixing of Latin and non-Latin scripts within the same column).

## Language Columns

Language codes identify which language each name column is written in:

| Column  | Type   | Max length | Notes                                                    |
| ------- | ------ | ---------- | -------------------------------------------------------- |
| `lang`  | string | 3          | BCP 47 language tag for `adm{L}_name` columns            |
| `lang1` | string | 3          | BCP 47 language tag for `adm{L}_name1` columns, nullable |
| `lang2` | string | 3          | BCP 47 language tag for `adm{L}_name2` columns, nullable |
| `lang3` | string | 3          | BCP 47 language tag for `adm{L}_name3` columns, nullable |

Language tags MUST be valid [BCP 47](https://www.rfc-editor.org/rfc/rfc5646) language tags. All rows in a file MUST share the same values for `lang`, `lang1`, `lang2`, and `lang3` (language codes are constant per layer). `lang` MUST be non-null and MUST be a romanized language (e.g. English, French, Spanish, Portuguese). `lang1`, `lang2`, and `lang3` are nullable; a language column being null means that alternate language is absent from the dataset.
