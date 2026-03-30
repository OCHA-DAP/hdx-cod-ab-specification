"""
Validate all COD-AB boundary files in a directory against the registered scripts.

Reads scripts/index.json to discover available checks and their `applies_to` targets,
then auto-detects each layer's type by name and runs the applicable checks.

Supported formats
-----------------
Single-layer: .parquet, .geojson, .fgb, .shp, .csv, .xlsx, .xls
Multi-layer:  .gpkg (GeoPackage), .gdb (File Geodatabase — a directory)

For multi-layer containers, every layer inside is validated independently.
The layer name (not the filename) drives layer-type detection.

Layer-type detection (by stem / layer name):
  - "admin"  — matches _admin{N} or _admin{N}_em  (e.g. afg_admin0, arm_admin1_em)
  - "lines"  — name contains "adminlines"
  - "points" — name contains "adminpoints", "admincapitals", or "admincentroids"
  - Names matching none of the above run only "all" checks.

Usage:
    uv run scripts/validate_all.py [boundaries_dir]

    boundaries_dir defaults to "boundaries/" relative to the current working directory.

Output:
    JSON to stdout:
        {
          "summary": {"total_layers": N, "total_violations": N, "total_warnings": N},
          "folders": {
            "<folder>": {
              "<filepath>[::layer]": {
                "<check_name>": {"passed": bool, "violations": [...], "warnings": [...], "info": [...]}
              }
            }
          }
        }

    For single-layer files the key is just the file path.
    For multi-layer containers the key is "path::layer_name".

Exit code: 0 if all checks pass, 1 if any violations.
"""

import importlib
import importlib.util
import json
import re
import sys
import tempfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
INDEX_PATH = SCRIPT_DIR / "index.json"

SINGLE_LAYER_EXTS = {".parquet", ".geojson", ".fgb", ".shp", ".csv", ".xlsx", ".xls"}
MULTI_LAYER_EXTS = {".gpkg", ".gdb"}

ADMIN_RE = re.compile(r"_adm(in)?\d+(_em)?$")
LINES_RE = re.compile(r"adm(in)?lines")
POINTS_RE = re.compile(r"adm(in)?points|adm(in)?capitals|adm(in)?centroids")


def detect_layer_types(name: str) -> set[str]:
    """Return the set of applies_to tags that match this layer/file name."""
    tags = {"all"}
    if ADMIN_RE.search(name):
        tags.add("admin")
    elif LINES_RE.search(name):
        tags.add("lines")
    elif POINTS_RE.search(name):
        tags.add("points")
    return tags


def list_layers(path: Path) -> list[str]:
    """Return layer names inside a multi-layer container using pyogrio."""
    import pyogrio
    info = pyogrio.list_layers(str(path))  # ndarray shape (n, 2): col 0 = names, col 1 = geom types
    return list(info[:, 0])


def iter_targets(boundaries_dir: Path):
    """Yield (path, layer_name_or_None, logical_name) for every layer to validate.

    logical_name drives layer-type detection and result keys:
      - single-layer files: the file stem
      - multi-layer containers with >1 layer: the layer name
      - multi-layer containers with exactly 1 layer: the file stem
    """
    seen_containers: set[Path] = set()

    for entry in sorted(boundaries_dir.rglob("*")):
        ext = entry.suffix.lower()

        # FileGDB is a directory with a .gdb suffix
        if entry.is_dir() and ext == ".gdb":
            if entry not in seen_containers:
                seen_containers.add(entry)
                try:
                    layers = list_layers(entry)
                except Exception:
                    continue
                logical = entry.stem if len(layers) == 1 else None
                for layer in layers:
                    yield entry, layer, logical or layer

        elif entry.is_file():
            if ext in SINGLE_LAYER_EXTS:
                yield entry, None, entry.stem

            elif ext in MULTI_LAYER_EXTS and entry not in seen_containers:
                seen_containers.add(entry)
                try:
                    layers = list_layers(entry)
                except Exception:
                    yield entry, None, entry.stem
                    continue
                logical = entry.stem if len(layers) == 1 else None
                for layer in layers:
                    yield entry, layer, logical or layer


def run_check(check_fn, path: Path, layer: str | None) -> dict:
    """Call check_fn against path, extracting to a temp parquet for multi-layer sources."""
    if layer is None:
        return check_fn(str(path))

    import geopandas as gpd

    gdf = gpd.read_file(str(path), layer=layer)
    with tempfile.NamedTemporaryFile(suffix=".parquet", delete=False) as tf:
        tmp_path = Path(tf.name)
    try:
        gdf.to_parquet(tmp_path)
        return check_fn(str(tmp_path))
    finally:
        tmp_path.unlink(missing_ok=True)


def load_checks() -> list[dict]:
    """Load check descriptors from index.json and import each module."""
    with open(INDEX_PATH) as f:
        index = json.load(f)
    checks = []
    for entry in index:
        script_path = (SCRIPT_DIR.parent / entry["script"]).resolve()
        module_name = script_path.stem
        spec = importlib.util.spec_from_file_location(module_name, script_path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        checks.append({
            "name": entry["name"],
            "applies_to": set(entry["applies_to"]),
            "check": mod.check,
        })
    return checks


def validate_directory(boundaries_dir: Path, only: list[str] | None = None) -> dict:
    checks = load_checks()
    if only:
        checks = [c for c in checks if c["name"] in only]

    folders: dict = {}
    total_layers = 0
    total_violations = 0
    total_warnings = 0

    for path, layer, logical_name in iter_targets(boundaries_dir):
        folder = path.parent.name
        layer_types = detect_layer_types(logical_name)
        result_key = f"{path}::{layer}" if layer is not None and layer != path.stem else str(path)

        if folder not in folders:
            folders[folder] = {}
        folders[folder][result_key] = {}
        total_layers += 1

        for check in checks:
            if check["applies_to"] & layer_types:
                try:
                    result = run_check(check["check"], path, layer)
                except Exception as e:
                    result = {"passed": False, "violations": [str(e)], "warnings": [], "info": []}
                folders[folder][result_key][check["name"]] = result
                total_violations += len(result.get("violations", []))
                total_warnings += len(result.get("warnings", []))

    return {
        "summary": {
            "total_layers": total_layers,
            "total_violations": total_violations,
            "total_warnings": total_warnings,
        },
        "folders": folders,
    }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Validate COD-AB boundary files.")
    parser.add_argument("boundaries_dir", nargs="?", default="boundaries",
                        help="Directory containing boundary folders (default: boundaries/)")
    parser.add_argument("--checks", metavar="NAME[,NAME...]",
                        help="Comma-separated list of check names to run (default: all)")
    args = parser.parse_args()

    boundaries_dir = Path(args.boundaries_dir)
    only = [n.strip() for n in args.checks.split(",")] if args.checks else None

    if not boundaries_dir.is_dir():
        print(f"Error: directory not found: {boundaries_dir}", file=sys.stderr)
        sys.exit(2)

    results = validate_directory(boundaries_dir, only=only)
    print(json.dumps(results))

    has_violations = results["summary"]["total_violations"] > 0
    sys.exit(1 if has_violations else 0)
