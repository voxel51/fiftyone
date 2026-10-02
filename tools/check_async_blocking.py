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


def _call_name(call, helpers=frozenset(), cls=None, local=frozenset()):
    """The blocking API (or blocking same-module helper) ``call`` reaches, or
    ``None``. ``helpers`` holds ``(class, name)`` pairs, ``class`` being
    ``None`` for module-level functions; ``cls`` is the class ``call`` is made
    in, which is what ``self.x()`` resolves against; ``local`` holds the names
    the calling function binds itself, which shadow module-level ones.
    """
    func = call.func
    if isinstance(func, ast.Name):
        if func.id in local:
            return None

        if func.id in BLOCKING_FUNCTIONS or (None, func.id) in helpers:
            return func.id

        return None

    if not isinstance(func, ast.Attribute):
        return None

    if isinstance(func.value, ast.Name):
        owner = func.value.id
        if (owner, func.attr) in BLOCKING_QUALIFIED:
            return f"{owner}.{func.attr}"

        # self._helper(), cls._helper(), or Route._helper(); a local named
        # like a class is something else
        if owner in ("self", "cls"):
            if (cls, func.attr) in helpers:
                return func.attr
        elif owner not in local and (owner, func.attr) in helpers:
            return func.attr

    if func.attr in BLOCKING_METHODS or func.attr in BLOCKING_FUNCTIONS:
        return func.attr

    return None


_SCOPES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)


def _definition_time_nodes(node):
    """What Python evaluates when it defines a function or lambda: decorators
    and argument defaults, not the body.
    """
    nodes = list(getattr(node, "decorator_list", []))
    nodes += node.args.defaults
    nodes += [d for d in node.args.kw_defaults if d is not None]
    return nodes


def _body(node):
    return node.body if isinstance(node.body, list) else [node.body]


def _walk_own(nodes):
    """Every node the statements in ``nodes`` evaluate when they run: nested
    function and lambda bodies only run when something calls them, so of
    those only the definition-time expressions are included.
    """
    stack = list(nodes)
    while stack:
        node = stack.pop()
        yield node
        if isinstance(node, _SCOPES):
            stack.extend(_definition_time_nodes(node))
        else:
            stack.extend(ast.iter_child_nodes(node))


def _local_names(func):
    """Names ``func`` binds in its own scope: arguments, assignment targets,
    imports and nested definitions.
    """
    args = func.args
    names = {
        a.arg
        for a in args.posonlyargs + args.args + args.kwonlyargs
        if a is not None
    }
    names |= {a.arg for a in (args.vararg, args.kwarg) if a is not None}
    for node in _walk_own(_body(func)):
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            names.add(node.id)
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            names.add(node.name)
        elif isinstance(node, ast.ClassDef):
            names.add(node.name)
        elif isinstance(node, (ast.Import, ast.ImportFrom)):
            names |= {(a.asname or a.name).split(".")[0] for a in node.names}

    return frozenset(names)


def _own_calls(func):
    """Calls ``func`` executes when called: those in its body, plus those in
    the bodies of functions it defines and then calls. Its own defaults and
    decorators ran when it was defined.
    """
    nested = {
        node.name: node
        for node in _walk_own(_body(func))
        if isinstance(node, ast.FunctionDef)
    }
    pending, followed = [func], set()
    while pending:
        scope = pending.pop()
        for node in _walk_own(_body(scope)):
            if not isinstance(node, ast.Call):
                continue

            yield node
            name = node.func.id if isinstance(node.func, ast.Name) else None
            if name in nested and name not in followed:
                followed.add(name)
                pending.append(nested[name])


class _Visitor(ast.NodeVisitor):
    """Collects blocking calls made directly inside ``async def`` bodies."""

    def __init__(self, helpers=frozenset()):
        self.findings = []
        self._helpers = helpers
        # (async function name, names it binds), innermost last
        self._async = []
        self._classes = []
        # calls that are themselves awaited (or drive an `async for`); their
        # arguments and receivers are still evaluated on the loop
        self._exempt = set()

    def visit_ClassDef(self, node):
        self._classes.append(node.name)
        self.generic_visit(node)
        self._classes.pop()

    def visit_AsyncFunctionDef(self, node):
        for child in _definition_time_nodes(node):
            self.visit(child)

        self._async.append((node.name, _local_names(node)))
        for child in node.body:
            self.visit(child)
        self._async.pop()

    def _visit_sync_scope(self, node):
        # defaults and decorators run where the function is defined; the body
        # runs wherever it is called, which for run_sync_task is off the loop
        for child in _definition_time_nodes(node):
            self.visit(child)

        saved = self._async
        self._async = []
        for child in _body(node):
            self.visit(child)
        self._async = saved

    visit_FunctionDef = _visit_sync_scope
    visit_Lambda = _visit_sync_scope

    def visit_Await(self, node):
        if isinstance(node.value, ast.Call):
            self._exempt.add(id(node.value))

        self.generic_visit(node)

    def visit_AsyncFor(self, node):
        # `async for x in cursor` drives an async iterator
        if isinstance(node.iter, ast.Call):
            self._exempt.add(id(node.iter))

        self.generic_visit(node)

    def visit_Call(self, node):
        if self._async and id(node) not in self._exempt:
            function, local = self._async[-1]
            cls = self._classes[-1] if self._classes else None
            name = _call_name(node, self._helpers, cls, local)
            if name:
                self.findings.append(
                    (function, name, node.lineno, ast.unparse(node))
                )

        self.generic_visit(node)


def _blocking_helpers(tree):
    """``(class, name)`` of the sync functions and methods in ``tree`` that
    make a blocking call when called, directly or through another such
    function; ``class`` is ``None`` for a module-level function.
    """
    bodies = {}
    for node in tree.body:
        if isinstance(node, ast.FunctionDef):
            bodies[(None, node.name)] = node
        elif isinstance(node, ast.ClassDef):
            for item in node.body:
                if isinstance(item, ast.FunctionDef):
                    bodies[(node.name, item.name)] = item

    helpers = set()
    changed = True
    while changed:
        changed = False
        for key, node in bodies.items():
            if key in helpers:
                continue

            found, local = frozenset(helpers), _local_names(node)
            if any(
                _call_name(call, found, key[0], local)
                for call in _own_calls(node)
            ):
                helpers.add(key)
                changed = True

    return frozenset(helpers)


def find_blocking_calls(source, filename="<string>"):
    """Returns ``(function, call, lineno, expression)`` for each blocking call
    made directly inside an ``async def`` in ``source``, including calls to
    sync functions in the same module that block.
    """
    tree = ast.parse(source, filename=filename)
    visitor = _Visitor(_blocking_helpers(tree))
    visitor.visit(tree)
    return visitor.findings


def _scan(paths):
    # keyed by the call's source text as well as its name, so replacing one
    # baselined call with a different one is still a new call
    found = collections.Counter()
    where = collections.defaultdict(list)
    for root in paths:
        files = [root] if root.is_file() else sorted(root.rglob("*.py"))
        for path in files:
            rel = path.resolve().relative_to(ROOT).as_posix()
            source = path.read_text(encoding="utf-8")
            for function, call, lineno, expr in find_blocking_calls(
                source, rel
            ):
                key = f"{rel}::{function}::{call}::{' '.join(expr.split())}"
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
        "# <file>::<async function>::<call>::<expression> <count>",
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
        path, function, call, _ = key.split("::", 3)
        lines = ", ".join(str(n) for n in where[key])
        print(f"  {path}:{lines}  {call}() in async {function}()")

    print(
        "\nAwait an async API, or move the work into a sync function and "
        "await it with run_sync_task."
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
