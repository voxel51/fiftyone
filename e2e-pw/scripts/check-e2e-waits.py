#!/usr/bin/env python3
"""Find every wait/assert pattern the e2e cause-wait rule forbids.

Usage: check-e2e-waits.py <repo-root>
Exit status 1 if anything is found. Each finding is `file:line  RULE  text`.
"""

import glob
import os
import re
import sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
E2E = os.path.join(ROOT, "e2e-pw", "src")
APP = os.path.join(ROOT, "app", "packages")

RETRYING = (
    "BeVisible|BeHidden|HaveText|ContainText|HaveCount|HaveAttribute|HaveValue|"
    "BeChecked|BeEnabled|BeDisabled|HaveClass|HaveCSS|BeAttached|BeFocused|HaveId|"
    "BeEmpty|BeEditable|BeInViewport|HaveJSProperty|HaveAccessibleName|"
    "HaveAccessibleDescription|HaveRole|HaveValues|HaveURL|HaveTitle|HaveScreenshot"
)

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
    (
        "retry-loop",
        re.compile(
            r"\b(?:while|for)\s*\([^)]*\b(?:attempts?|correctionAttempts|retr(?:y|ies)|max[A-Z]\w*|MAX_[A-Z_]+)\b"
        ),
    ),
]

APP_RULES = [
    # test signals are e2e: bus events, not DOM CustomEvents
    ("app-custom-event", re.compile(r"new CustomEvent\(")),
    (
        "app-guarded-dispatch",
        re.compile(
            r"if\s*\(\s*!?\s*(?:isE2E\(\)|navigator\.webdriver)[^)]*\)\s*\{?[^}]{0,200}?\.dispatch\(",
            re.S,
        ),
    ),
]

# files whose matches are infrastructure, not waits in the page
E2E_SKIP = re.compile(
    r"(shared/network-utils/|shared/media-factory/|oss/fixtures/fo-server\.ts|shared/python-runner/)"
)

# accepted sites, as "relative/path:substring of the matched text" -> reason.
# app-custom-event entries must name the app code that listens (a test-only
# CustomEvent is never allowed: it becomes an e2e: bus event).
ALLOW = {
    "app/packages/looker-3d/src/Looker3d.tsx:addAfterEffect": "the guard decides whether a per-frame after-effect is registered at all",
    "app/packages/core/src/components/Grid/GridCustomRendererItem.tsx:new CustomEvent(": "item events (refresh, selectthumbnail); Grid/useRenderer.ts listens via item.addEventListener",
    "app/packages/core/src/components/Grid/useEvents.ts:new CustomEvent(": "grid-mount; Grid/useResize.ts listens (document.addEventListener) to sync the grid width",
    "app/packages/core/src/components/Modal/TooltipInfo.tsx:new CustomEvent(": "fo-hide-label-change; TooltipInfo.tsx itself listens (window.addEventListener) to refresh hidden labels",
    "app/packages/core/src/components/Modal/VideoTimelineSurface.tsx:new CustomEvent(": "dead file, removed in its own PR",
    "app/packages/core/src/components/Sidebar/InteractiveSidebar/InteractiveSidebar.tsx:new CustomEvent(": "animation-onRest; InteractiveSidebar/useRegisterSidebarCommandHandlers.ts listens",
    "app/packages/core/src/plugins/SchemaIO/components/FrameLoaderView.tsx:new CustomEvent(": "frames-loaded; FrameLoaderView.tsx itself listens (window.addEventListener)",
    "app/packages/looker-3d/src/action-bar/index.tsx:new CustomEvent(": "fo-action-set-top/ego-view; hooks/use-fo3d-camera-view-events.ts listens (useEventHandler on window)",
    "app/packages/looker-3d/src/hooks/use-camera-views.ts:new CustomEvent(": "fo-action-set-top/ego-view and zoom-to-selected; use-fo3d-camera-view-events.ts and use-fo3d-interaction-lifecycle.ts listen",
    "app/packages/looker-3d/src/hooks/use-fo3d-camera-look-at.ts:new CustomEvent(": "looker3d-camera-look-at-settled; Looker3d.tsx listens (document.addEventListener)",
    "app/packages/looker/src/lookers/abstract.ts:new CustomEvent(": "looker events (play, pause, select, clear, ...); Modal/ImaVidLooker.tsx, Modal/useLookerPlaybackBridge.ts and Actions/Tag listen via useEventHandler(looker, ...)",
    "app/packages/looker/src/lookers/imavid/controller.ts:new CustomEvent(": "fetchMore; core Modal/ImaVidLooker.tsx listens (fetchMoreListener)",
    "app/packages/playback/src/lib/timeline/use-timeline.ts:new CustomEvent(": "play/pause; timeline/use-create-timeline.ts listens (useEventHandler on window)",
    "app/packages/playback/src/lib/timeline/utils.ts:new CustomEvent(": "set-frame-number; timeline/use-create-timeline.ts listens",
    "e2e-pw/src/oss/poms/modal/annotate-sidebar.ts:waitForResponse(": "waitForPatch: the grouped-video specs assert which sample the PATCH URL targets, so the request itself is the subject; saves wait on afterSave",
    "app/packages/playback/src/views/Timeline/Timeline.tsx:new CustomEvent(": "seek; timeline/use-create-timeline.ts listens (useEventHandler on window)",
}


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
        if re.search(r"\.(test|spec)\.tsx?$", path) and rules is APP_RULES:
            continue
        raw = open(path).read()
        src = strip_comments(raw)
        for name, rx in rules:
            for m in rx.finditer(src):
                line = src.count("\n", 0, m.start()) + 1
                text = " ".join(raw[m.start() : m.end()].split())[:110]
                rel = os.path.relpath(path, ROOT)
                if any(
                    k.split(":")[0] == rel and k.split(":", 1)[1] in text
                    for k in ALLOW
                ):
                    continue
                found.append((rel, line, name, text))
    return found


e2e_files = glob.glob(os.path.join(E2E, "**", "*.ts"), recursive=True)
app_files = [
    f
    for f in glob.glob(os.path.join(APP, "**", "*.ts*"), recursive=True)
    if "/node_modules/" not in f
    and "/__generated__/" not in f
    and "/dist/" not in f
]
findings = scan(e2e_files, E2E_RULES, E2E_SKIP) + scan(app_files, APP_RULES)

by_rule = {}
for rel, line, name, text in sorted(findings):
    by_rule.setdefault(name, []).append(f"{rel}:{line}  {text}")
for name, items in by_rule.items():
    print(f"== {name} ({len(items)})")
    for i in items:
        print("  " + i)
print(f"TOTAL {len(findings)}")
sys.exit(1 if findings else 0)
