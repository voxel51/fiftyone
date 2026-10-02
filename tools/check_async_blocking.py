"""
Flags blocking calls made directly inside ``async def`` functions of the App
server.

A blocking call (a synchronous database read or write, a dataset load, a
sample save) inside an ``async def`` holds the event loop, so every other
request waits until it returns. Such work belongs in ``run_sync_task`` or an
awaited async API.

A call counts when it reaches a known blocking API directly or through a sync
function in the same module. It is allowed when it is awaited (or drives an
``async for``), or when it sits inside a nested function or lambda, which is
how work is handed to ``run_sync_task``. Existing
violations are listed in the baseline so only new ones fail; fix one and
rerun with ``--update-baseline`` to drop it.

Usage::

    python tools/check_async_blocking.py [--update-baseline] [paths ...]

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import argparse
import ast
import collections
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_PATHS = [ROOT / "fiftyone" / "server"]
BASELINE = ROOT / "tools" / "async_blocking_baseline.txt"

# Method names that block when called on a pymongo collection or a FiftyOne
# dataset, view or sample. Generic names that builtins share (``values``,
# ``count``, ``get``) are left out: they would mostly flag dicts and strings.
BLOCKING_METHODS = {
    # pymongo
    "bulk_write",
    "count_documents",
    "delete_many",
    "delete_one",
    "estimated_document_count",
    "find",
    "find_one",
    "find_one_and_update",
    "insert_many",
    "insert_one",
    "replace_one",
    "update_many",
    "update_one",
    # FiftyOne SDK
    "first",
    "iter_frames",
    "iter_samples",
    "reload",
    "save",
}

# Functions that block wherever they are called from.
BLOCKING_FUNCTIONS = {"get_db_conn", "load_dataset"}

# ``module.attr`` calls that block.
BLOCKING_QUALIFIED = {
    ("time", "sleep"),
    ("requests", "delete"),
    ("requests", "get"),
    ("requests", "patch"),
    ("requests", "post"),
    ("requests", "put"),
    ("subprocess", "run"),
}


def _call_name(call, helpers=frozenset()):
    """The blocking API (or blocking same-module helper) ``call`` reaches, or
    ``None``.
    """
    func = call.func
    if isinstance(func, ast.Name):
        if func.id in BLOCKING_FUNCTIONS or func.id in helpers:
            return func.id

        return None

    if not isinstance(func, ast.Attribute):
        return None

    if isinstance(func.value, ast.Name):
        if (func.value.id, func.attr) in BLOCKING_QUALIFIED:
            return f"{func.value.id}.{func.attr}"

        # self._helper(...) / cls._helper(...)
        if func.value.id in ("self", "cls") and func.attr in helpers:
            return func.attr

    if func.attr in BLOCKING_METHODS or func.attr in BLOCKING_FUNCTIONS:
        return func.attr

    return None


class _Visitor(ast.NodeVisitor):
    """Collects blocking calls made directly inside ``async def`` bodies."""

    def __init__(self, helpers=frozenset()):
        self.findings = []
        self._helpers = helpers
        self._async = []
        self._awaited = 0

    def visit_AsyncFunctionDef(self, node):
        self._async.append(node.name)
        saved, self._awaited = self._awaited, 0
        for child in node.body:
            self.visit(child)
        self._awaited = saved
        self._async.pop()

    def _visit_sync_scope(self, node):
        # a nested sync function or lambda runs wherever it is called; handed
        # to run_sync_task, that is off the loop
        saved = self._async
        self._async = []
        self.generic_visit(node)
        self._async = saved

    visit_FunctionDef = _visit_sync_scope
    visit_Lambda = _visit_sync_scope

    def visit_Await(self, node):
        self._awaited += 1
        self.generic_visit(node)
        self._awaited -= 1

    def visit_AsyncFor(self, node):
        # `async for x in cursor` drives an async iterator
        self._awaited += 1
        self.visit(node.iter)
        self._awaited -= 1
        self.visit(node.target)
        for child in node.body + node.orelse:
            self.visit(child)

    def visit_Call(self, node):
        if self._async and not self._awaited:
            name = _call_name(node, self._helpers)
            if name:
                self.findings.append((self._async[-1], name, node.lineno))

        self.generic_visit(node)


def _blocking_helpers(tree):
    """Names of sync functions and methods in ``tree`` that make a blocking
    call, directly or through another such function.
    """
    bodies = {
        node.name: node
        for node in ast.walk(tree)
        if isinstance(node, ast.FunctionDef)
    }
    helpers = set()
    changed = True
    while changed:
        changed = False
        for name, node in bodies.items():
            if name in helpers:
                continue

            calls = (n for n in ast.walk(node) if isinstance(n, ast.Call))
            if any(_call_name(call, frozenset(helpers)) for call in calls):
                helpers.add(name)
                changed = True

    return frozenset(helpers)


def find_blocking_calls(source, filename="<string>"):
    """Returns ``(function, call, lineno)`` for each blocking call made
    directly inside an ``async def`` in ``source``, including calls to sync
    functions in the same module that block.
    """
    tree = ast.parse(source, filename=filename)
    visitor = _Visitor(_blocking_helpers(tree))
    visitor.visit(tree)
    return visitor.findings


def _scan(paths):
    found = collections.Counter()
    where = collections.defaultdict(list)
    for root in paths:
        files = [root] if root.is_file() else sorted(root.rglob("*.py"))
        for path in files:
            rel = path.resolve().relative_to(ROOT).as_posix()
            source = path.read_text(encoding="utf-8")
            for function, call, lineno in find_blocking_calls(source, rel):
                key = f"{rel}::{function}::{call}"
                found[key] += 1
                where[key].append(lineno)

    return found, where


def _read_baseline():
    counts = collections.Counter()
    if not BASELINE.exists():
        return counts

    for line in BASELINE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue

        key, _, count = line.rpartition(" ")
        counts[key] = int(count)

    return counts


def _write_baseline(found):
    lines = [
        "# Blocking calls inside async functions that predate",
        "# tools/check_async_blocking.py. Fix them, don't add to them.",
        "# <file>::<async function>::<call> <count>",
    ]
    lines += [f"{key} {found[key]}" for key in sorted(found)]
    BASELINE.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("paths", nargs="*", type=pathlib.Path)
    parser.add_argument("--update-baseline", action="store_true")
    args = parser.parse_args(argv)

    found, where = _scan(args.paths or DEFAULT_PATHS)

    if args.update_baseline:
        _write_baseline(found)
        print(f"Wrote {len(found)} entries to {BASELINE.relative_to(ROOT)}")
        return 0

    baseline = _read_baseline()
    new = {
        key: found[key] - baseline[key]
        for key in found
        if found[key] > baseline[key]
    }

    if not new:
        return 0

    print("Blocking calls inside async functions hold the event loop:\n")
    for key in sorted(new):
        path, function, call = key.split("::")
        lines = ", ".join(str(n) for n in where[key])
        print(f"  {path}:{lines}  {call}() in async {function}()")

    print(
        "\nAwait an async API, or move the work into a sync function and "
        "await it with run_sync_task."
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
