"""Bring a FiftyOne docs change into the voxel51 docs.

Usage: python docs/scripts/docs_sync.py --upstream FIFTYONE_CLONE --base SHA
           --head SHA --docs VOXEL51_SDK/docs [--dry-run] [--report-json F]
           [--markdown F]

Looks at what changed under ``docs/source`` between ``--base`` and ``--head``
in a FiftyOne checkout and applies it to the voxel51 docs (``--docs`` is the
``docs`` directory of a voxel51-sdk checkout, whose own converters it uses),
so the two stay in step while both are published.

Only documentation content crosses over: pages (``.rst``, ``.md``, ``.ipynb``)
and their images. Never the theme, templates, styles, ``conf.py``, redirects,
release notes or ``user_guide/config.rst``, and never a page the voxel51 docs
removed or rewrote on purpose (the ``STATUS`` table in ``rework_report.py``).

Each changed page goes through the same converters that made the voxel51
copy (``rework.py``, ``rename.py``) and is then three-way merged into the
voxel51 page: base and head converted, ours as it is now. A page that does not
merge cleanly is left untouched and reported. Nothing is ever written outside
``--docs``.
"""

import argparse
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile

TEXT = {".rst", ".md", ".ipynb"}
IMAGES = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}
DENY_PREFIXES = ("_static/", "_templates/", "assets/", "_extra/")
DENY_FILES = {"conf.py", "redirects", "redirects.py", "user_guide/config.rst"}
DENY_NAME_PREFIXES = ("release-notes",)
DENY_STATUSES = {"removed", "rewritten"}


def load_status(docs):
    path = os.path.join(docs, "_tools", "rework_report.py")
    spec = importlib.util.spec_from_file_location("rework_report", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.STATUS


def classify(rel, status):
    """Return None when ``rel`` may cross over, else the reason it may not."""
    ext = os.path.splitext(rel)[1].lower()
    if ext not in TEXT | IMAGES:
        return "not documentation content"
    if rel.startswith(DENY_PREFIXES):
        return "theme, template or static asset"
    if rel in DENY_FILES:
        return "SDK-specific file"
    if os.path.basename(rel).startswith(DENY_NAME_PREFIXES):
        return "release notes"
    for key, (state, _) in status.items():
        if state in DENY_STATUSES and (
            rel == key or (key.endswith("/") and rel.startswith(key))
        ):
            return f"{state} in the voxel51 docs"
    return None


def git(upstream, *args, check=True):
    return subprocess.run(
        ["git", "-C", upstream, *args], capture_output=True, check=check
    )


def blob(upstream, rev, rel):
    r = git(upstream, "show", f"{rev}:docs/source/{rel}", check=False)
    return r.stdout if r.returncode == 0 else None


def changed_files(upstream, base, head):
    out = git(
        upstream,
        "diff",
        "--name-status",
        "--no-renames",
        base,
        head,
        "--",
        "docs/source",
    ).stdout.decode()
    changes = []
    for line in out.splitlines():
        state, path = line.split("\t", 1)
        changes.append((state[0], path[len("docs/source/") :]))
    return changes


def convert(pages, docs):
    """Run the voxel51 converters over {rel: text} and return {rel: text}."""
    if not pages:
        return {}
    root = tempfile.mkdtemp(prefix="docs_sync_")
    try:
        tools = os.path.join(root, "_tools")
        os.makedirs(tools)
        for name in ("rework.py", "rename.py"):
            shutil.copy(os.path.join(docs, "_tools", name), tools)
        paths = []
        for rel, text in pages.items():
            p = os.path.join(root, rel)
            os.makedirs(os.path.dirname(p), exist_ok=True)
            with open(p, "w", encoding="utf-8") as f:
                f.write(text)
            paths.append(p)
        for i in range(0, len(paths), 100):
            chunk = paths[i : i + 100]
            for cmd in (
                [
                    sys.executable,
                    os.path.join(tools, "rework.py"),
                    "--docs",
                    root,
                ],
                [sys.executable, os.path.join(tools, "rename.py")],
            ):
                r = subprocess.run(cmd + chunk, capture_output=True, text=True)
                if r.returncode:
                    raise RuntimeError(f"{cmd[1]} failed: {r.stderr[-300:]}")
        return {
            rel: open(os.path.join(root, rel), encoding="utf-8").read()
            for rel in pages
        }
    finally:
        shutil.rmtree(root, ignore_errors=True)


def merge(ours, base, theirs):
    """Three-way merge; returns (text, clean)."""
    tmp = tempfile.mkdtemp(prefix="docs_merge_")
    try:
        files = []
        for name, text in (("ours", ours), ("base", base), ("theirs", theirs)):
            p = os.path.join(tmp, name)
            with open(p, "w", encoding="utf-8") as f:
                f.write(text)
            files.append(p)
        r = subprocess.run(
            ["git", "merge-file", "-p", *files], capture_output=True, text=True
        )
        return r.stdout, r.returncode == 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def inside(docs, path):
    return os.path.realpath(path).startswith(os.path.realpath(docs) + os.sep)


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def plan(upstream, base, head, docs):
    status = load_status(docs)
    result = {
        "updated": [],
        "added": [],
        "deleted": [],
        "images": [],
        "unchanged": [],
        "conflicts": [],
        "skipped": [],
    }
    text_changes, image_changes = [], []
    for state, rel in changed_files(upstream, base, head):
        reason = classify(rel, status)
        if reason:
            result["skipped"].append({"path": rel, "reason": reason})
        elif os.path.splitext(rel)[1].lower() in IMAGES:
            image_changes.append((state, rel))
        else:
            text_changes.append((state, rel))

    base_pages, head_pages = {}, {}
    for state, rel in text_changes:
        if state != "A":
            raw = blob(upstream, base, rel)
            if raw is not None:
                base_pages[rel] = raw.decode("utf-8")
        if state != "D":
            raw = blob(upstream, head, rel)
            if raw is not None:
                head_pages[rel] = raw.decode("utf-8")
    base_conv, head_conv = convert(base_pages, docs), convert(head_pages, docs)

    writes = {}
    for state, rel in text_changes:
        ours_path = os.path.join(docs, rel)
        exists = os.path.exists(ours_path)
        if state == "A":
            if exists:
                result["conflicts"].append(
                    {
                        "path": rel,
                        "reason": "added upstream, but the voxel51 docs already have a page here",
                    }
                )
            else:
                writes[rel] = head_conv[rel]
                result["added"].append(rel)
        elif state == "D":
            if exists and read(ours_path) == base_conv.get(rel):
                result["deleted"].append(rel)
            elif exists:
                result["conflicts"].append(
                    {
                        "path": rel,
                        "reason": "deleted upstream, but the voxel51 page was edited",
                    }
                )
            else:
                result["skipped"].append(
                    {
                        "path": rel,
                        "reason": "deleted upstream, not present in the voxel51 docs",
                    }
                )
        else:
            if not exists:
                result["skipped"].append(
                    {"path": rel, "reason": "no such page in the voxel51 docs"}
                )
                continue
            ours = read(ours_path)
            merged, clean = merge(ours, base_conv[rel], head_conv[rel])
            if clean and rel.endswith(".ipynb"):
                try:
                    json.loads(merged)
                except ValueError:
                    clean = False
            if not clean:
                result["conflicts"].append(
                    {
                        "path": rel,
                        "reason": "does not merge cleanly into the voxel51 page",
                    }
                )
            elif merged == ours:
                result["unchanged"].append(rel)
            else:
                writes[rel] = merged
                result["updated"].append(rel)

    image_writes = {}
    for state, rel in image_changes:
        if state == "D":
            result["skipped"].append(
                {"path": rel, "reason": "image deleted upstream"}
            )
            continue
        data = blob(upstream, head, rel)
        target = os.path.join(docs, rel)
        if data is not None and not (
            os.path.exists(target) and open(target, "rb").read() == data
        ):
            image_writes[rel] = data
            result["images"].append(rel)
    return result, writes, image_writes


def apply(docs, result, writes, image_writes):
    for rel, text in writes.items():
        path = os.path.join(docs, rel)
        assert inside(docs, path), f"refusing to write outside the docs: {rel}"
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)
    for rel, data in image_writes.items():
        path = os.path.join(docs, rel)
        assert inside(docs, path), f"refusing to write outside the docs: {rel}"
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(data)
    for rel in result["deleted"]:
        path = os.path.join(docs, rel)
        assert inside(
            docs, path
        ), f"refusing to delete outside the docs: {rel}"
        os.remove(path)

    touched = [r for r in writes if r.endswith((".rst", ".ipynb"))]
    report_path = os.path.join(docs, "_tools", "rework_report.json")
    if not (touched or result["deleted"]) or not os.path.exists(report_path):
        return
    tmp = tempfile.mkdtemp(prefix="docs_sync_report_")
    try:
        part = os.path.join(tmp, "part.json")
        if touched:
            r = subprocess.run(
                [
                    sys.executable,
                    os.path.join(docs, "_tools", "rework.py"),
                    "--docs",
                    docs,
                    "--report",
                    part,
                ]
                + [os.path.join(docs, t) for t in touched],
                capture_output=True,
                text=True,
            )
            if r.returncode:
                raise RuntimeError(f"rework.py failed: {r.stderr[-300:]}")
        with open(report_path) as f:
            report = json.load(f)
        if touched:
            with open(part) as f:
                report["pages"].update(json.load(f)["pages"])
        for rel in result["deleted"]:
            report["pages"].pop(rel, None)
        report["pages"] = dict(sorted(report["pages"].items()))
        with open(report_path, "w") as f:
            json.dump(report, f, indent=1)
        r = subprocess.run(
            [
                sys.executable,
                os.path.join(docs, "_tools", "rework_report.py"),
                "--docs",
                docs,
            ],
            capture_output=True,
            text=True,
        )
        if r.returncode:
            raise RuntimeError(f"rework_report.py failed: {r.stderr[-300:]}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def markdown(result, base, head):
    def rows(items):
        return "\n".join(f"- `{p}`" for p in items) or "- none"

    lines = [
        f"Synced from FiftyOne `docs/source` ({base[:10]}..{head[:10]}).",
        "",
        f"**Updated ({len(result['updated'])})**",
        rows(result["updated"]),
        "",
        f"**Added ({len(result['added'])})**",
        rows(result["added"]),
        "",
        f"**Deleted ({len(result['deleted'])})**",
        rows(result["deleted"]),
        "",
        f"**Images ({len(result['images'])})**",
        rows(result["images"]),
    ]
    if result["conflicts"]:
        lines += [
            "",
            f"**Needs a manual port ({len(result['conflicts'])})**",
            "These were not applied:",
        ]
        lines += [
            f"- `{c['path']}`: {c['reason']}" for c in result["conflicts"]
        ]
    if result["skipped"]:
        lines += [
            "",
            "<details><summary>Not synced on purpose (%d)</summary>"
            % len(result["skipped"]),
            "",
        ]
        lines += [f"- `{s['path']}`: {s['reason']}" for s in result["skipped"]]
        lines += ["", "</details>"]
    return "\n".join(lines) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument(
        "--upstream", required=True, help="a FiftyOne git checkout"
    )
    ap.add_argument("--base", required=True)
    ap.add_argument("--head", required=True)
    ap.add_argument(
        "--docs",
        required=True,
        help="the docs directory of a voxel51-sdk checkout",
    )
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--report-json")
    ap.add_argument("--markdown")
    args = ap.parse_args(argv)
    docs = os.path.abspath(args.docs)

    result, writes, image_writes = plan(
        args.upstream, args.base, args.head, docs
    )
    result["has_changes"] = bool(writes or image_writes or result["deleted"])
    result["has_conflicts"] = bool(result["conflicts"])
    if not args.dry_run:
        apply(docs, result, writes, image_writes)
    if args.report_json:
        with open(args.report_json, "w") as f:
            json.dump(result, f, indent=1)
    if args.markdown:
        with open(args.markdown, "w") as f:
            f.write(markdown(result, args.base, args.head))
    for key in (
        "updated",
        "added",
        "deleted",
        "images",
        "unchanged",
        "conflicts",
        "skipped",
    ):
        print(f"{key}: {len(result[key])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
