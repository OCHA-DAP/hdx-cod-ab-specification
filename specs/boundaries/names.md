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

`adm{L}_name` MUST be non-null and non-empty for all rows. The alternate language name columns are REQUIRED but MAY contain null values. A name column MUST be null when its corresponding language column (`lang1`, `lang2`, `lang3`) is null. Empty strings (`""`) MUST be treated as equivalent to null for all name columns.

### Name Value Consistency

Name values within a dataset MUST be internally consistent in style. The following requirements apply to all name columns:

- **No extraneous whitespace.** Names MUST NOT contain leading or trailing whitespace, consecutive spaces, or any non-space whitespace characters (e.g. tabs `\t`, newlines `\n`).
- **No ALL CAPS names.** Names MUST NOT be fully uppercased (e.g., `KANDAHAR` is not acceptable; use `Kandahar`). Individual words in acronyms or established abbreviations that are conventionally uppercase are permitted (e.g., `DRC`).
- **No all-lowercase names.** Names MUST NOT be fully lowercased (e.g., `kandahar` is not acceptable; use `Kandahar`). This does not apply to function words or particles that are intentionally lowercased within a name.
- **No indiscriminate auto-capitalization.** Names MUST NOT apply title-case capitalization mechanically to every word. Language-specific capitalization rules MUST be respected. In particular, function words and particles such as prepositions and articles (e.g., `de`, `do`, `da`, `di`, `du`, `van`, `von`, `of`, `al-`) MUST be lowercased when they appear in the interior of a name, following the conventions of the relevant language (e.g., `Río de la Plata`, not `Río De La Plata`).
- **Names must contain alphabetic characters.** Every name value MUST contain at least one alphabetic character (Unicode letter). Values consisting entirely of digits, punctuation, or other non-letter characters are not valid names.
- **Consistent use of abbreviated vs. full forms.** Within a single name column, all names MUST use either the abbreviated form or the full form of a descriptor — not a mixture. For example, if `Special` is used in one name, `SP` MUST NOT appear in another (e.g., all rows should use `Special Administrative Region` or all should use `SAR`, not a mix). Abbreviations that are part of the official name of a unit (i.e., the full official name contains the abbreviation) are permitted.
- **Consistent script and encoding.** All values within a single name column MUST be in the script and encoding appropriate for the declared language (`lang`, `lang1`, etc.) and MUST be consistently encoded throughout the file (e.g., no mixing of Latin and non-Latin scripts within the same column). Each individual name value MUST contain only characters from the Unicode block(s) appropriate for the declared language. Validators SHOULD flag values containing characters outside the expected block(s) as violations.

### Name Uniqueness and Consistency

The name columns collectively form a unique identifier for each row: the concatenation of names across all levels (e.g. `adm0_name` + `adm1_name` + `adm2_name`) must uniquely identify each unit. This is enforced at each level independently via the two rules below, which together guarantee uniqueness of the full name path by transitivity. Each unit at level L is identified by its `adm{L}_pcode`. These checks apply to every level L present in the file. Null name values are excluded from both checks.

Two requirements apply to every level L present in the file:

- **No duplicate names within a parent**: No two child units with the same parent (`adm{L-1}_pcode`) may have the same value in any name column (`adm{L}_name`, `adm{L}_name1`, `adm{L}_name2`, `adm{L}_name3`). This catches two different areas that have been given the same name.
- **No name variation for the same P-code**: Every row carrying the same `adm{L}_pcode` MUST use the same value in each name column. This catches the same area named inconsistently across rows (e.g. a typo or variant spelling).

## Admin 0 Country Name

For any name column whose declared language (`lang`, `lang1`, `lang2`, `lang3`) is one of the six official UN languages (Arabic, Chinese, English, French, Russian, Spanish), `adm0_name` (or the corresponding alternate name column) MUST use the short name for that language from the [UN M49 standard](https://unstats.un.org/unsd/methodology/m49/) (e.g., `Afghanistan` in English, `République démocratique du Congo` in French).

## Language Columns

Language codes identify which language each name column is written in:

| Column  | Type   | Max length | Notes                                                    |
| ------- | ------ | ---------- | -------------------------------------------------------- |
| `lang`  | string | 3          | BCP 47 language tag for `adm{L}_name` columns            |
| `lang1` | string | 3          | BCP 47 language tag for `adm{L}_name1` columns, nullable |
| `lang2` | string | 3          | BCP 47 language tag for `adm{L}_name2` columns, nullable |
| `lang3` | string | 3          | BCP 47 language tag for `adm{L}_name3` columns, nullable |

Language tags MUST be valid [BCP 47](https://www.rfc-editor.org/rfc/rfc5646) language tags. All rows in a file MUST share the same values for `lang`, `lang1`, `lang2`, and `lang3` (language codes are constant per layer). `lang` MUST be non-null and MUST be a romanized language (e.g. English, French, Spanish, Portuguese). `lang1`, `lang2`, and `lang3` are nullable; a language column being null means that alternate language is absent from the dataset.
