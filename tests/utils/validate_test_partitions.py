"""
Validates that the core and ML/cloud test partitions are complete.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import ast
from configparser import ConfigParser
from fnmatch import fnmatch
from pathlib import Path
import subprocess
import sys

ROOT_DIR = Path(__file__).resolve().parents[2]
UNCOLLECTED_SCAN_IGNORES = [
    Path("tests/benchmarking"),
    Path("tests/isolated"),
    Path("tests/utils"),
    Path("tests/intensive"),
]
SUITE_ARGS = [
    "tests/",
    "--ignore",
    "tests/benchmarking/",
    "--ignore",
    "tests/isolated/",
    "--ignore",
    "tests/utils/",
    "--ignore",
    "tests/intensive/",
    "--ignore",
    "tests/no_wrapper",
]


def _is_ignored(path):
    relative_path = path.relative_to(ROOT_DIR)
    return any(
        relative_path == ignored_path or ignored_path in relative_path.parents
        for ignored_path in UNCOLLECTED_SCAN_IGNORES
    )


def _python_file_patterns():
    config = ConfigParser()
    config.read(ROOT_DIR / "pytest.ini")
    return config.get(
        "pytest",
        "python_files",
        fallback="test_*.py *_test.py",
    ).split()


def _contains_test_definition(path):
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    return any(
        isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef))
        and node.name.startswith("test")
        for node in ast.walk(tree)
    )


def _find_uncollected_test_files():
    patterns = _python_file_patterns()
    return {
        path.relative_to(ROOT_DIR).as_posix()
        for path in (ROOT_DIR / "tests").rglob("*.py")
        if not _is_ignored(path)
        and not any(fnmatch(path.name, pattern) for pattern in patterns)
        and _contains_test_definition(path)
    }


def _collect(marker=None):
    command = [
        sys.executable,
        "-m",
        "pytest",
        "--collect-only",
        "--quiet",
        "--disable-warnings",
        *SUITE_ARGS,
    ]
    if marker is not None:
        command.extend(["-m", marker])

    result = subprocess.run(
        command,
        cwd=ROOT_DIR,
        check=True,
        capture_output=True,
        text=True,
    )
    return {
        line.strip() for line in result.stdout.splitlines() if "::" in line
    }


def main():
    uncollected_files = _find_uncollected_test_files()
    if uncollected_files:
        print(
            "test definitions found in files excluded by python_files:",
            file=sys.stderr,
        )
        for path in sorted(uncollected_files):
            print(f"  {path}", file=sys.stderr)

        return 1

    all_tests = _collect()
    core_tests = _collect("not ml and not cloud")
    ml_cloud_tests = _collect("ml or cloud")

    overlap = core_tests & ml_cloud_tests
    missing = all_tests - (core_tests | ml_cloud_tests)
    unexpected = (core_tests | ml_cloud_tests) - all_tests

    if overlap or missing or unexpected:
        for label, node_ids in (
            ("overlap", overlap),
            ("missing", missing),
            ("unexpected", unexpected),
        ):
            if node_ids:
                print(f"{label} test node IDs:", file=sys.stderr)
                for node_id in sorted(node_ids):
                    print(f"  {node_id}", file=sys.stderr)

        return 1

    if not all_tests or not core_tests or not ml_cloud_tests:
        print(
            "test partitions must all contain collected tests",
            file=sys.stderr,
        )
        return 1

    print(
        f"validated {len(all_tests)} tests: "
        f"{len(core_tests)} core, "
        f"{len(ml_cloud_tests)} ML/cloud"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
