"""
Generate a formatted validation report for COD-AB boundary files.

Runs all registered checks (or a subset via --checks) against every layer in
boundaries_dir and prints a human-readable Markdown report to stdout.

Usage:
    uv run scripts/report.py [boundaries_dir] [--checks NAME[,NAME...]]

    boundaries_dir defaults to "boundaries/" relative to the current working directory.

Examples:
    uv run scripts/report.py
    uv run scripts/report.py --checks check_pcode_hierarchy
    uv run scripts/report.py --checks check_pcode_format,check_pcode_hierarchy
    uv run scripts/report.py boundaries/cod_ab_afg_v01 --checks check_dates
"""

import argparse
import collections
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from validate_all import validate_directory


# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------

CHECK_LABELS = {
    "check_versions": "Version",
    "check_dates": "Dates",
    "check_pcode_format": "P-Code Format",
    "check_pcode_hierarchy": "P-Code Hierarchy",
}


def label(check_name: str) -> str:
    return CHECK_LABELS.get(check_name, check_name)


def cell(result: dict) -> str:
    if result["passed"]:
        return "Pass"
    return "**Fail**"


def short_path(filepath: str) -> str:
    """Return just the filename (or filename::layer for multi-layer)."""
    if "::" in filepath:
        path_part, layer = filepath.rsplit("::", 1)
        return f"{Path(path_part).name}::{layer}"
    return Path(filepath).name


def country_name(folder: str) -> str:
    """Extract ISO3 from folder name like cod_ab_afg_v01."""
    m = re.match(r"cod_ab_([a-z]+)_", folder)
    return m.group(1).upper() if m else folder


# ---------------------------------------------------------------------------
# Report sections
# ---------------------------------------------------------------------------

def render_folder(folder: str, files: dict, check_names: list[str]) -> list[str]:
    """Return lines for one folder. Returns empty list if all checks passed."""
    lines = []

    # Collect only files that actually have check results (skip non-admin layers)
    checked = {fp: results for fp, results in files.items() if results}
    if not checked:
        return lines

    all_passed = all(
        r["passed"]
        for results in checked.values()
        for r in results.values()
    )

    iso = country_name(folder)
    heading = f"### {iso} — {folder}"

    if all_passed:
        lines.append(f"{heading}: All checks passed")
        return lines

    lines.append(heading)
    lines.append("")

    # Table header
    col_headers = [label(c) for c in check_names if any(c in r for r in checked.values())]
    present_checks = [c for c in check_names if any(c in r for r in checked.values())]

    lines.append("| File | " + " | ".join(col_headers) + " |")
    lines.append("|------|" + "|".join(["------"] * len(col_headers)) + "|")

    for filepath, results in sorted(checked.items()):
        fname = short_path(filepath)
        cells = []
        for c in present_checks:
            if c in results:
                cells.append(cell(results[c]))
            else:
                cells.append("—")
        lines.append(f"| {fname} | " + " | ".join(cells) + " |")

    lines.append("")

    # Failing details
    for filepath, results in sorted(checked.items()):
        fname = short_path(filepath)
        for c in present_checks:
            r = results.get(c)
            if not r or r["passed"]:
                continue
            lines.append(f"**{fname} — {label(c)}**")
            for v in r.get("violations", []):
                lines.append(f"- VIOLATION: {v}")
            for w in r.get("warnings", []):
                lines.append(f"- WARNING: {w}")
            lines.append("")

    return lines


def render_issue_summary(folders: dict, check_names: list[str]) -> list[str]:
    """Return the cross-folder issue summary table."""
    # issue_text -> {severity, folders, files}
    issues: dict[str, dict] = collections.defaultdict(
        lambda: {"severity": "MUST", "folders": set(), "files": set()}
    )

    for folder, files in folders.items():
        for filepath, results in files.items():
            for check_name, r in results.items():
                for v in r.get("violations", []):
                    # Normalise to a short key by stripping per-row counts/examples
                    key = re.sub(r" for \d+ row\(s\).*", "", v)
                    key = re.sub(r"Examples.*", "", key).strip(" .")
                    issues[key]["severity"] = "MUST"
                    issues[key]["folders"].add(folder)
                    issues[key]["files"].add(filepath)
                for w in r.get("warnings", []):
                    key = re.sub(r" for \d+ row\(s\).*", "", w)
                    key = re.sub(r"Examples.*", "", key).strip(" .")
                    issues[key]["severity"] = "SHOULD"
                    issues[key]["folders"].add(folder)
                    issues[key]["files"].add(filepath)

    if not issues:
        return []

    lines = ["### Issue Summary", ""]
    lines.append("| Issue | Severity | Folders affected | Files affected |")
    lines.append("|-------|----------|-----------------|----------------|")
    for issue, counts in sorted(issues.items(), key=lambda x: (-len(x[1]["files"]), x[0])):
        lines.append(
            f"| {issue} | {counts['severity']} | {len(counts['folders'])} | {len(counts['files'])} |"
        )
    lines.append("")

    return lines


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def generate_report(boundaries_dir: Path, only: list[str] | None = None) -> str:
    results = validate_directory(boundaries_dir, only=only)
    summary = results["summary"]
    folders = results["folders"]

    # Collect all check names that appear in results
    check_names = only or []
    if not check_names:
        seen = []
        for files in folders.values():
            for results_map in files.values():
                for c in results_map:
                    if c not in seen:
                        seen.append(c)
        check_names = seen

    lines = ["# COD-AB Validation Report", ""]
    checks_label = ", ".join(label(c) for c in check_names) if check_names else "All"
    lines.append(f"**Checks run:** {checks_label}  ")
    lines.append(f"**Admin layers checked:** {summary['total_layers']}  ")
    lines.append(f"**Total violations:** {summary['total_violations']}  ")
    lines.append(f"**Total warnings:** {summary['total_warnings']}  ")
    lines.append("")

    any_failure = False
    for folder, files in sorted(folders.items()):
        folder_lines = render_folder(folder, files, check_names)
        if folder_lines:
            lines.extend(folder_lines)
            if "**Fail**" in "\n".join(folder_lines):
                any_failure = True

    if not any_failure:
        lines.append("### All checks passed")
    else:
        lines.extend(render_issue_summary(folders, check_names))

    return "\n".join(lines)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate a COD-AB validation report.")
    parser.add_argument("boundaries_dir", nargs="?", default="boundaries",
                        help="Directory containing boundary folders (default: boundaries/)")
    parser.add_argument("--checks", metavar="NAME[,NAME...]",
                        help="Comma-separated check names to run (default: all)")
    args = parser.parse_args()

    boundaries_dir = Path(args.boundaries_dir)
    only = [n.strip() for n in args.checks.split(",")] if args.checks else None

    if not boundaries_dir.is_dir():
        print(f"Error: directory not found: {boundaries_dir}", file=sys.stderr)
        sys.exit(2)

    print(generate_report(boundaries_dir, only=only))
