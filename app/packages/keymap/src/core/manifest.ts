/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { ScopeId } from "./scopes";

/**
 * A command *declaration*. This is the crux of the design (doc §4.4):
 * declaring a command is separated from binding a handler to it, so the
 * manifest is complete from module load and does not depend on any component
 * being mounted. That is what lets the settings pane list modal and annotation
 * shortcuts while the modal is closed — the thing that is impossible today,
 * because `useKeyBindings` creates commands in a `useEffect` and destroys them
 * on unmount (F3).
 */
export interface CommandManifestEntry {
  /** Stable id; the only thing an override refers to. */
  id: string;
  label: string;
  description?: string;
  /** Grouping in the settings pane; independent of scope. */
  category: string;
  /** Where the binding is live. See `scopes.ts`. */
  scope: ScopeId;
  /** Serialized chords (physical `code`s), in precedence order. */
  defaultKeys: string[];
  /** Fires on `event.repeat` too — brush size, frame stepping. */
  repeatable?: boolean;
  /** Survives the text-editing-target guard — Escape, Cmd+Enter submit. */
  allowInTextInput?: boolean;
  /**
   * Reports press *and* release rather than firing once, via `bindHold` /
   * `useHoldBinding`. Replaces looker's `ControlEventKeyType.HOLD` (F9). A
   * holdable command may declare a bare modifier such as `ShiftLeft`, which
   * ordinary chords forbid.
   */
  holdable?: boolean;
  /** False for keys the user may not rebind. Escape, per §4.6. */
  remappable?: boolean;
  /** Intra-scope tiebreak only; scope depth is the primary axis (§4.3). */
  priority?: number;
  /** Declares that the handler may decline at runtime, so the pane can say
   * "conditional" instead of lying about what the key does (§4.3). */
  mayDecline?: boolean;
}

/**
 * A representative slice of the ~120 bindings inventoried in the doc's
 * Appendix A — enough to exercise every case the settings pane has to render,
 * not an exhaustive port. Nothing here is wired to a real handler; this POC is
 * about the editing and conflict surface, not the migration.
 */
export const MANIFEST: CommandManifestEntry[] = [
  // ── Application ──────────────────────────────────────────────────────────
  {
    id: "fo.undo",
    label: "Undo",
    description: "Undo the previous command",
    category: "Application",
    scope: "app",
    defaultKeys: ["ctrl+KeyZ", "meta+KeyZ"],
  },
  {
    id: "fo.redo",
    label: "Redo",
    description: "Redo a previously undone command",
    category: "Application",
    scope: "app",
    defaultKeys: ["ctrl+shift+KeyZ", "meta+shift+KeyZ", "meta+KeyY"],
  },
  {
    id: "fo.dismiss",
    label: "Dismiss / cancel",
    description:
      "Pops exactly one layer off the dismissal stack — locked tooltip, in-progress shape, active tool, popout, panel, then modal",
    category: "Application",
    scope: "app",
    defaultKeys: ["Escape"],
    allowInTextInput: true,
    remappable: false,
  },
  {
    id: "fo.settings.open",
    label: "Open settings",
    category: "Application",
    scope: "app",
    defaultKeys: ["ctrl+Comma", "meta+Comma"],
  },
  {
    id: "fo.operator-browser.toggle",
    label: "Toggle operator browser",
    category: "Application",
    scope: "app",
    defaultKeys: ["Backquote"],
  },

  {
    id: "fo.operator-browser.next",
    label: "Next operator",
    category: "Operator browser",
    scope: "overlay.operator-browser",
    defaultKeys: ["ArrowDown"],
    repeatable: true,
  },
  {
    id: "fo.operator-browser.previous",
    label: "Previous operator",
    category: "Operator browser",
    scope: "overlay.operator-browser",
    defaultKeys: ["ArrowUp"],
    repeatable: true,
  },
  {
    id: "fo.operator-browser.submit",
    label: "Run selected operator",
    category: "Operator browser",
    scope: "overlay.operator-browser",
    defaultKeys: ["Enter"],
  },

  // ── Grid ─────────────────────────────────────────────────────────────────
  {
    id: "fo.grid.selection.clear",
    label: "Clear selection",
    category: "Grid",
    scope: "grid.selection",
    defaultKeys: [],
    remappable: false,
    description: "Handled by the dismissal stack, not a standalone binding",
  },
  {
    id: "fo.grid.view.save",
    label: "Save view",
    category: "Grid",
    scope: "grid",
    defaultKeys: ["ctrl+KeyS", "meta+KeyS"],
  },

  // ── Sample viewer ────────────────────────────────────────────────────────
  {
    id: "fo.modal.fullscreen.toggle",
    label: "Toggle fullscreen",
    category: "Sample viewer",
    scope: "modal",
    defaultKeys: ["KeyF"],
  },
  {
    id: "fo.modal.sidebar.toggle",
    label: "Toggle sidebar",
    description: "Show or hide the sample sidebar",
    category: "Sample viewer",
    scope: "modal",
    defaultKeys: ["KeyS"],
  },
  {
    id: "fo.modal.select",
    label: "Select sample",
    category: "Sample viewer",
    scope: "modal",
    defaultKeys: ["KeyX"],
  },
  {
    id: "fo.modal.next.sample",
    label: "Next sample",
    category: "Sample viewer",
    scope: "modal",
    defaultKeys: ["ArrowRight"],
    repeatable: true,
  },
  {
    id: "fo.modal.previous.sample",
    label: "Previous sample",
    category: "Sample viewer",
    scope: "modal",
    defaultKeys: ["ArrowLeft"],
    repeatable: true,
  },
  {
    id: "fo.modal.zoom.reset",
    label: "Reset zoom",
    category: "Sample viewer",
    scope: "modal",
    defaultKeys: ["KeyR"],
  },
  {
    id: "fo.modal.controls.toggle",
    label: "Toggle controls",
    description: "Show or hide the sample viewer's hover controls",
    category: "Sample viewer",
    scope: "modal",
    defaultKeys: ["KeyC"],
  },
  {
    id: "fo.modal.json.toggle",
    label: "Toggle JSON",
    category: "Sample viewer",
    scope: "modal",
    defaultKeys: ["KeyJ"],
  },
  {
    id: "fo.modal.help",
    label: "Show shortcut help",
    category: "Sample viewer",
    scope: "modal",
    defaultKeys: ["Slash", "shift+Slash"],
  },
  {
    id: "fo.modal.overlays.hide",
    label: "Hide overlays (hold)",
    description:
      "Hold to peek at the image underneath the overlays; release to restore them",
    category: "Sample viewer",
    scope: "modal",
    defaultKeys: ["ShiftLeft", "ShiftRight"],
    holdable: true,
    remappable: false,
  },

  // ── Video ────────────────────────────────────────────────────────────────
  {
    id: "fo.modal.play.pause",
    label: "Play / pause",
    category: "Video",
    scope: "modal.video",
    defaultKeys: ["Space"],
  },
  {
    id: "fo.modal.step.forward",
    label: "Step forward one frame",
    category: "Video",
    scope: "modal.video",
    defaultKeys: ["Period"],
    repeatable: true,
  },
  {
    id: "fo.modal.step.back",
    label: "Step back one frame",
    category: "Video",
    scope: "modal.video",
    defaultKeys: ["Comma"],
    repeatable: true,
  },
  {
    id: "fo.modal.video.mute",
    label: "Mute",
    category: "Video",
    scope: "modal.video",
    defaultKeys: ["KeyM"],
  },
  {
    id: "fo.modal.video.temporal-tag",
    label: "Temporal tag",
    category: "Video",
    scope: "modal.video",
    defaultKeys: ["shift+KeyT"],
  },

  // ── 3D ───────────────────────────────────────────────────────────────────
  {
    id: "fo.modal.3d.grid.toggle",
    label: "Toggle grid",
    category: "3D",
    scope: "modal.3d",
    defaultKeys: ["KeyG"],
  },
  {
    id: "fo.modal.3d.view.top",
    label: "Top view",
    category: "3D",
    scope: "modal.3d",
    defaultKeys: ["KeyT"],
  },
  {
    id: "fo.modal.3d.view.ego",
    label: "Ego view",
    category: "3D",
    scope: "modal.3d",
    defaultKeys: ["KeyE"],
  },
  {
    id: "fo.modal.3d.json.fo3d",
    label: "Toggle fo3d JSON",
    category: "3D",
    scope: "modal.3d",
    defaultKeys: ["KeyI"],
  },
  {
    id: "fo.modal.3d.json.sample",
    label: "Toggle sample JSON",
    description:
      "Shadows the sample viewer's JSON toggle while the 3D viewer is active — legal and expected, per 4.7",
    category: "3D",
    scope: "modal.3d",
    defaultKeys: ["KeyJ"],
  },
  {
    id: "fo.modal.3d.leva.toggle",
    label: "Toggle Leva panel",
    category: "3D",
    scope: "modal.3d",
    defaultKeys: ["KeyR"],
  },

  // ── Annotate ─────────────────────────────────────────────────────────────
  {
    id: "fo.modal.annotate.delete",
    label: "Delete label",
    category: "Annotate",
    scope: "modal.annotate",
    defaultKeys: ["Delete", "Backspace"],
  },
  {
    id: "fo.modal.annotate.keyframe",
    label: "Toggle keyframe",
    category: "Annotate",
    scope: "modal.annotate",
    defaultKeys: ["KeyK"],
  },

  // ── Annotate ▸ Segmentation ──────────────────────────────────────────────
  {
    id: "fo.modal.annotate.seg.tool.brush",
    label: "Brush tool",
    category: "Annotate ▸ Segmentation",
    scope: "modal.annotate.segmentation",
    defaultKeys: ["KeyB"],
  },
  {
    id: "fo.modal.annotate.seg.tool.pen",
    label: "Pen tool",
    category: "Annotate ▸ Segmentation",
    scope: "modal.annotate.segmentation",
    defaultKeys: ["KeyP"],
  },
  {
    id: "fo.modal.annotate.seg.brush.shape",
    label: "Cycle brush shape",
    category: "Annotate ▸ Segmentation",
    scope: "modal.annotate.segmentation",
    defaultKeys: ["KeyS"],
  },
  {
    id: "fo.modal.annotate.seg.brush.smaller",
    label: "Decrease brush size",
    category: "Annotate ▸ Segmentation",
    scope: "modal.annotate.segmentation",
    defaultKeys: ["BracketLeft"],
    repeatable: true,
  },
  {
    id: "fo.modal.annotate.seg.brush.bigger",
    label: "Increase brush size",
    category: "Annotate ▸ Segmentation",
    scope: "modal.annotate.segmentation",
    defaultKeys: ["BracketRight"],
    repeatable: true,
  },

  // ── Annotate ▸ 3D ────────────────────────────────────────────────────────
  {
    id: "fo.modal.annotate.3d.translate",
    label: "Translate gizmo",
    category: "Annotate ▸ 3D",
    scope: "modal.annotate.3d",
    defaultKeys: ["KeyT"],
  },
  {
    id: "fo.modal.annotate.3d.scale",
    label: "Scale gizmo",
    category: "Annotate ▸ 3D",
    scope: "modal.annotate.3d",
    defaultKeys: ["KeyS"],
  },
  {
    id: "fo.modal.annotate.3d.rotate",
    label: "Rotate gizmo",
    category: "Annotate ▸ 3D",
    scope: "modal.annotate.3d",
    defaultKeys: ["KeyR"],
  },
  {
    id: "fo.modal.annotate.3d.cuboid",
    label: "Cuboid mode",
    category: "Annotate ▸ 3D",
    scope: "modal.annotate.3d",
    defaultKeys: ["KeyC"],
  },

  // ── Panels ───────────────────────────────────────────────────────────────
  {
    id: "fo.panel.embeddings.lasso",
    label: "Lasso select",
    category: "Embeddings panel",
    scope: "panel.embeddings",
    defaultKeys: ["KeyS"],
  },
  {
    id: "fo.panel.embeddings.pan",
    label: "Pan",
    category: "Embeddings panel",
    scope: "panel.embeddings",
    defaultKeys: ["KeyG"],
  },
  {
    id: "fo.panel.map.fit-selection",
    label: "Fit to selection",
    category: "Map panel",
    scope: "panel.map",
    defaultKeys: ["KeyF"],
  },

  // ── Demo route ───────────────────────────────────────────────────────────
  // These are bound to real handlers on /keymap-demo so the resolution rules
  // can be observed rather than described.
  {
    id: "demo.page.flash",
    label: "Flash the page",
    description:
      "Bound at the page scope; reachable from anywhere on the route",
    category: "Demo",
    scope: "demo",
    defaultKeys: ["KeyP"],
  },
  {
    id: "demo.page.action",
    label: "Page action",
    description:
      "Shares its chord with the canvas and tool actions — watch which one fires as you focus deeper boxes",
    category: "Demo",
    scope: "demo",
    defaultKeys: ["KeyA"],
  },
  {
    id: "demo.canvas.action",
    label: "Canvas action",
    description: "Shadows the page action while the canvas is focused",
    category: "Demo",
    scope: "demo.canvas",
    defaultKeys: ["KeyA"],
  },
  {
    id: "demo.tool.action",
    label: "Tool action",
    description: "Shadows both while the tool is active",
    category: "Demo",
    scope: "demo.canvas.tool",
    defaultKeys: ["KeyA"],
  },
  {
    id: "demo.canvas.draw",
    label: "Draw",
    description:
      "Ships colliding with 'Duplicate' on purpose, so the pane has a true same-scope conflict to render",
    category: "Demo",
    scope: "demo.canvas",
    defaultKeys: ["KeyD"],
  },
  {
    id: "demo.canvas.duplicate",
    label: "Duplicate",
    description:
      "Ships colliding with 'Draw' on purpose, so the pane has a true same-scope conflict to render",
    category: "Demo",
    scope: "demo.canvas",
    defaultKeys: ["KeyD"],
  },
  {
    id: "demo.canvas.nudge",
    label: "Nudge (repeatable)",
    description:
      "Hold to repeat, unlike every other binding here. Deliberately not an arrow key — arrows are a bad default for a demo, since a broken or remapped arrow makes the feature look broken rather than unbound",
    category: "Demo",
    scope: "demo.canvas",
    defaultKeys: ["KeyN"],
    repeatable: true,
  },
  {
    id: "demo.tool.activate",
    label: "Activate tool",
    description: "Pushes the tool scope and a dismisser onto the stack",
    category: "Demo",
    scope: "demo.canvas",
    defaultKeys: ["KeyE"],
  },
  {
    id: "demo.inspector.toggle",
    label: "Toggle inspector",
    category: "Demo",
    scope: "demo",
    defaultKeys: ["KeyI"],
  },
  {
    id: "demo.inspector.commit",
    label: "Commit from a text field",
    description:
      "Declares allowInTextInput, so it fires while you are typing — every other binding is suppressed there",
    category: "Demo",
    scope: "demo.inspector",
    defaultKeys: ["ctrl+Enter", "meta+Enter"],
    allowInTextInput: true,
  },
];

export const MANIFEST_BY_ID: ReadonlyMap<string, CommandManifestEntry> =
  new Map(MANIFEST.map((entry) => [entry.id, entry]));

export const lookupCommand = (id: string): CommandManifestEntry | undefined =>
  MANIFEST_BY_ID.get(id);
