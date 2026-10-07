#!/usr/bin/env python3
"""Find every pattern the e2e coding standards forbid.

Usage: check-e2e-events.py <repo-root>
Exit status 1 if anything is found. Each finding is `file:line  RULE  text`.
"""

import glob
import os
import re
import sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
E2E = os.path.join(ROOT, "e2e-pw", "src")
APP = os.path.join(ROOT, "app", "packages")

# web-first matchers that usually stand in for product events (a query's
# count, a loaded sample); a plain component use carries `// component-only:`.
# Visible-state matchers on plain UI (toBeVisible, toBeHidden, toBeFocused,
# toHaveText) and form-control state (toHaveValue, toBeChecked, toBeEnabled,
# toBeDisabled, toBeEditable) are allowed without a marker; whether one stands
# in for a product event is a review call.
RETRYING = (
    "ContainText|HaveCount|HaveAttribute|"
    "HaveClass|HaveCSS|BeAttached|HaveId|BeEmpty|BeInViewport|HaveJSProperty|"
    "HaveAccessibleName|HaveAccessibleDescription|HaveRole|HaveURL|HaveTitle"
)
COMPONENT_ONLY = "// component-only:"

# matchers that accept a range of values instead of one; the read after an
# event is exact. A named time budget (`draw.t - open.t < BUDGET_MS`) carries
# `// time-budget:` on its line or the line above.
LOOSE = (
    "Contain|ContainEqual|Match|MatchObject|BeGreaterThan|BeGreaterThanOrEqual|"
    "BeLessThan|BeLessThanOrEqual|BeCloseTo|BeTruthy|BeFalsy|BeDefined"
)
TIME_BUDGET = "// time-budget:"
MARKERS = {"retrying-assert": COMPONENT_ONLY, "loose-assert": TIME_BUDGET}

E2E_RULES = [
    # expect(<not an awaited value>).to<retrying matcher>, across lines
    (
        "retrying-assert",
        re.compile(
            r"expect(?:\.soft)?\(\s*(?!await\b)[^;]*?\)\s*\.\s*(?:not\s*\.\s*)?to(?:"
            + RETRYING
            + r")\b",
            re.S,
        ),
    ),
    (
        "loose-assert",
        re.compile(
            r"\.\s*(?:not\s*\.\s*)?to(?:" + LOOSE + r")\("
            # "anything but": not.toBe(x), not.toBeNull(), ...
            + r"|\.\s*not\s*\.\s*to(?:Be|Equal|StrictEqual|BeNull|BeUndefined)\("
            # a substring or regex check folded into the expected value
            + r"|\bexpect(?:\.soft)?\((?:(?!\bexpect\b)[^;])*?\.(?:includes|startsWith|"
            + r"endsWith|test|match|search|indexOf|some)\(",
            re.S,
        ),
    ),
    ("expect-poll", re.compile(r"expect\.poll\(")),
    ("to-pass", re.compile(r"\.toPass\(")),
    ("wait-for-timeout", re.compile(r"waitForTimeout\(")),
    ("wait-for-function", re.compile(r"waitForFunction\(")),
    ("wait-for-selector", re.compile(r"waitForSelector\(")),
    (
        "wait-for-response",
        re.compile(r"waitFor(?:Response|Request|LoadState|URL)\("),
    ),
    ("explicit-timeout", re.compile(r"\btimeout\s*:")),
    ("set-timeout", re.compile(r"setTimeout\(")),
    # fs.rm / fs.rmSync take a `force` option too; that is not a click
    (
        "force-click",
        re.compile(r"(?m)^(?![^\n]*\brm(?:Sync)?\()[^\n]*?\bforce\s*:\s*true"),
    ),
    # locator.waitFor and the removed DOM-mutation wait are DOM polls
    ("locator-wait-for", re.compile(r"\.waitFor\(")),
    ("until-dom", re.compile(r"\buntilDom\(")),
    # datasets come from DatasetFactory, built from data the spec controls
    ("raw-dataset", re.compile(r"\bfo\.Dataset\(|load_zoo_dataset\(")),
    # the sample canvas POM is the only authority over the modal canvas: its
    # primitives drive the pointer, and its asserter takes the screenshots
    (
        "raw-mouse",
        re.compile(r"\.mouse\.(?:move|down|up|click|dblclick|wheel)\("),
    ),
    (
        "canvas-locator-input",
        re.compile(
            r"\b(?:looker3d|groupLooker|looker|canvas)\b(?:\(\))?\.(?:click|hover|dblclick)\("
        ),
    ),
    # a mode switch remounts the modal's sidebar and renderer: run it through
    # the event that remount sends
    ("bare-mode-switch", re.compile(r"(?m)^\s*await [\w.]+\.switchMode\(")),
    (
        "raw-screenshot",
        re.compile(r"\.screenshot\(|\.toMatchSnapshot\(|\.toHaveScreenshot\("),
    ),
    ("direct-expect-screenshot", re.compile(r"\bexpectScreenshot\(")),
    (
        "retry-loop",
        re.compile(
            r"\b(?:while|for)\s*\([^)]*\b(?:attempts?|correctionAttempts|retr(?:y|ies)|max[A-Z]\w*|MAX_[A-Z_]+)\b"
        ),
    ),
]

# files whose matches are infrastructure, not waits in the page
# App code sends events on the @fiftyone/events bus and never branches on
# browser automation; the App ESLint config flags the same for editors
APP_RULES = [
    ("app-custom-event", re.compile(r"new CustomEvent\(")),
    (
        "app-e2e-guard",
        re.compile(r"\bisE2E\b|\bIS_PLAYWRIGHT\b|navigator\.webdriver"),
    ),
]
# App unit tests stand in for the App's events and the automation flag
APP_SKIP = re.compile(r"/(node_modules|dist|__generated__)/|\.test\.tsx?$")

E2E_SKIP = re.compile(
    # test plugin sources run inside the App; their timers are not test waits
    r"(shared/network-utils/|shared/media-factory/|oss/fixtures/fo-server\.ts|shared/python-runner/|shared/assets/plugins/)"
)

# accepted sites, as "relative/path:substring of the matched text" -> reason
ALLOW = {
    "app/packages/events/src/dispatch/legacyDomEvents.ts:new CustomEvent(": "deprecated plugin compatibility: mirrors the closed LEGACY_DOM_EVENTS list below to the DOM events main sent",
    "app/packages/events/src/dispatch/dispatcher.ts:isE2E": "the bus itself: drops e2e: events outside automation",
    "app/packages/events/src/dispatch/dispatcher.ts:navigator.webdriver": "the bus's automation check",
    "app/packages/events/src/dispatch/registry.ts:isE2E": "the bus itself: exposes its tap only under automation",
    "e2e-pw/src/shared/dataset-factory/build.ts:fo.Dataset(": "the factory itself creates the dataset",
    "e2e-pw/src/oss/poms/modal/sample-canvas/index.ts:.mouse.": "the sample canvas POM: its primitives are the only pointer input to the canvas",
    "e2e-pw/src/oss/poms/modal/sample-canvas/index.ts:expectScreenshot(": "the sample canvas asserter",
    "e2e-pw/src/oss/poms/grid/index.ts:expectScreenshot(": "the grid asserter: each tile's canvas, in grid order",
    "e2e-pw/src/oss/poms/panels/histogram-panel.ts:expectScreenshot(": "the histogram asserter: the chart's SVG",
    "e2e-pw/src/oss/utils/screenshot.ts:screenshot(": "the capture under the POM asserters",
    "e2e-pw/src/oss/utils/screenshot.ts:toMatchSnapshot(": "the exact comparison under the POM asserters",
    "e2e-pw/src/oss/poms/modal/video-annotate.ts:.mouse.": "drags on the timeline's DOM (tag range overlay, interval resize handle), not the canvas",
    "e2e-pw/src/oss/poms/multimodal/episode.ts:.mouse.": "seeks and scrubs on the episode timeline's DOM, not a canvas",
    "e2e-pw/src/oss/poms/modal/index.ts:looker.click(": "a group carousel thumbnail, which navigates like a grid tile; not the sample canvas",
}


# The DOM events the App still sends for plugins, as main sent them. The
# compatibility module may mirror exactly these; a new name is a new DOM event,
# which App code must not add, so changing this set needs a reviewer.
LEGACY_DOM_EVENTS_FILE = os.path.join(
    ROOT, "app", "packages", "events", "src", "dispatch", "legacyDomEvents.ts"
)
LEGACY_DOM_EVENTS = {
    "play",
    "pause",
    "seek",
    "set-frame-number-",
    "fetchMore",
    "fo-hide-label-change",
    "frames-loaded",
    "fo-action-set-top-view",
    "fo-action-set-ego-view",
    "fo-action-zoom-to-selected",
    "grid-mount",
    "looker3d-camera-look-at-settled",
    "animation-onRest",
}


def legacy_dom_events():
    """The compatibility module's mirrored names must be the pinned set"""
    src = strip_comments(open(LEGACY_DOM_EVENTS_FILE).read())
    names = re.findall(r"""\bname:\s*["']([^"']+)["']""", src)
    rel = os.path.relpath(LEGACY_DOM_EVENTS_FILE, ROOT)
    found = []
    for name in sorted(set(names) - LEGACY_DOM_EVENTS):
        found.append(
            (rel, 1, "legacy-dom-event", f"{name}: not a DOM event main sent")
        )
    for name in sorted(LEGACY_DOM_EVENTS - set(names)):
        found.append(
            (rel, 1, "legacy-dom-event", f"{name}: pinned but not mirrored")
        )
    if len(names) != len(set(names)):
        found.append((rel, 1, "legacy-dom-event", "a name is listed twice"))
    return found


def strip_comments(src: str) -> str:
    """Blank comments while keeping offsets (and so line numbers) intact."""

    def blank(m):
        return re.sub(r"[^\n]", " ", m.group(0))

    src = re.sub(r"/\*[\s\S]*?\*/", blank, src)
    src = re.sub(
        r"(?m)(^|[^:\"'`])//[^\n]*",
        lambda m: m.group(1) + blank(m)[len(m.group(1)) :],
        src,
    )
    return src


def scan(files, rules, skip=None):
    found = []
    for path in files:
        if skip and skip.search(path):
            continue
        # unit tests of e2e helpers assert on helper internals, not the App
        if re.search(r"\.test\.ts$", path):
            continue
        raw = open(path).read()
        src = strip_comments(raw)
        raw_lines = raw.split("\n")
        for name, rx in rules:
            for m in rx.finditer(src):
                line = src.count("\n", 0, m.start()) + 1
                if name in MARKERS and any(
                    MARKERS[name] in raw_lines[i]
                    for i in range(max(0, line - 2), line)
                ):
                    continue
                text = " ".join(raw[m.start() : m.end()].split())[:110]
                rel = os.path.relpath(path, ROOT)
                if any(
                    k.split(":")[0] == rel and k.split(":", 1)[1] in text
                    for k in ALLOW
                ):
                    continue
                found.append((rel, line, name, text))
    return found


EVENT_NAME = re.compile(r"""["'`](e2e:[\w:-]+)["'`]""")
# a name built from a prefix, as in `e2e:multimodal:${event}`
EVENT_PREFIX = re.compile(r"`(e2e:[\w:-]*)\$\{")
STRING = re.compile(r"""["']([\w-]+)["']""")


def unused_app_events(e2e_files):
    """`e2e:` events the App names that no spec, POM or fixture listens for"""
    listened = set()
    for path in e2e_files:
        src = strip_comments(open(path).read())
        listened.update(EVENT_NAME.findall(src))
        for prefix in EVENT_PREFIX.findall(src):
            listened.update(prefix + name for name in STRING.findall(src))

    found = []
    app_files = glob.glob(os.path.join(APP, "**", "*.ts*"), recursive=True)
    for path in sorted(app_files):
        if re.search(
            r"/(node_modules|dist|__generated__)/|\.test\.tsx?$", path
        ):
            continue
        raw = open(path).read()
        src = strip_comments(raw)
        for m in EVENT_NAME.finditer(src):
            if m.group(1) in listened:
                continue
            line = src.count("\n", 0, m.start()) + 1
            found.append(
                (
                    os.path.relpath(path, ROOT),
                    line,
                    "unused-app-event",
                    f"{m.group(1)}: no spec or POM waits for it; delete it",
                )
            )
    return found


e2e_files = glob.glob(os.path.join(E2E, "**", "*.ts"), recursive=True)
app_files = glob.glob(os.path.join(APP, "**", "*.ts*"), recursive=True)
findings = (
    scan(e2e_files, E2E_RULES, E2E_SKIP)
    + scan(app_files, APP_RULES, APP_SKIP)
    + unused_app_events(e2e_files)
    + legacy_dom_events()
)

by_rule = {}
for rel, line, name, text in sorted(findings):
    by_rule.setdefault(name, []).append(f"{rel}:{line}  {text}")
for name, items in by_rule.items():
    print(f"== {name} ({len(items)})")
    for i in items:
        print("  " + i)
print(f"TOTAL {len(findings)}")
if findings:
    print(
        "Run product-event actions through the e2e: event they cause, read"
        " the result once with an exact matcher (a time budget carries"
        " `// time-budget: <why>`), mark other web-first matchers on plain"
        " components `// component-only: <why>`, delete App e2e: events"
        " nothing waits for, and in App code send events on the bus without"
        " automation guards; see e2e-pw/CODING_STANDARDS.md"
    )
sys.exit(1 if findings else 0)
