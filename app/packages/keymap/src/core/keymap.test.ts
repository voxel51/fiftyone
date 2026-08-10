/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatChord,
  isModifierCode,
  parseChord,
  tryParseChord,
} from "./chords";
import { describeKeys } from "./layout";
import { analyzeOverlaps, trueConflicts } from "./conflicts";
import {
  MANIFEST,
  isRemappable,
  lookupCommand,
  notYetMigrated,
} from "./manifest";
import { DismissalStack } from "./dismiss";
import { DEFAULT_PRESET, PRESETS, resolveKeymap } from "./overrides";
import { KeymapRegistry, keymap } from "./registry";
import { SCOPE_PARENTS, isAncestorScope, scopeDepth } from "./scopes";

const press = (
  code: string,
  modifiers: Partial<
    Record<"ctrlKey" | "altKey" | "shiftKey" | "metaKey", boolean>
  > = {},
  extra: { repeat?: boolean } = {},
) =>
  new KeyboardEvent("keydown", {
    code,
    bubbles: true,
    cancelable: true,
    repeat: extra.repeat ?? false,
    ...modifiers,
  });

describe("chords", () => {
  it("round-trips through the canonical form", () => {
    expect(formatChord(parseChord("meta+shift+KeyZ"))).toBe("meta+shift+KeyZ");
    // Modifier order in the input doesn't matter; the output is canonical, so
    // two spellings of the same binding compare equal.
    expect(formatChord(parseChord("shift+meta+KeyZ"))).toBe("meta+shift+KeyZ");
    expect(formatChord(parseChord("ctrl+shift+KeyZ"))).toBe("ctrl+shift+KeyZ");
  });

  it("rejects a chord with no non-modifier key", () => {
    expect(() => parseChord("ctrl+ShiftLeft")).toThrow();
  });
});

describe("scopes", () => {
  it("orders by depth", () => {
    expect(scopeDepth("app")).toBe(0);
    expect(scopeDepth("modal")).toBe(1);
    expect(scopeDepth("modal.annotate.3d")).toBe(3);
  });

  it("knows ancestors", () => {
    expect(isAncestorScope("modal", "modal.annotate.3d")).toBe(true);
    expect(isAncestorScope("modal.annotate.3d", "modal")).toBe(false);
    expect(isAncestorScope("panel.map", "modal")).toBe(false);
  });
});

describe("conflict analysis", () => {
  const overlaps = analyzeOverlaps(resolveKeymap("fiftyone-default", {}));

  it("calls same-key-same-scope a conflict", () => {
    // The manifest ships Draw and Duplicate colliding on KeyD in demo.canvas,
    // deliberately, so the pane has a real conflict to render.
    const conflicts = trueConflicts(overlaps);
    expect(
      conflicts.some(
        (overlap) =>
          overlap.otherId === "demo.canvas.duplicate" &&
          overlap.chord === "KeyD",
      ),
    ).toBe(true);
  });

  it("calls a descendant taking a parent's key shadowing, not a conflict", () => {
    // KeyS is Toggle sidebar in `modal` and Scale gizmo in `modal.annotate.3d`.
    // §4.7: that is shadowing an ancestor — legal, but worth its own affordance.
    const forScale = overlaps.get("fo.modal.annotate.3d.scale") ?? [];
    const againstSidebar = forScale.find(
      (overlap) => overlap.otherId === "fo.modal.sidebar.toggle",
    );
    expect(againstSidebar?.kind).toBe("shadows-ancestor");
  });

  it("calls the same key in unrelated scopes plain shadowing", () => {
    // KeyF is modal fullscreen and map fit-selection — the F2 double-fire today.
    const forMap = overlaps.get("fo.panel.map.fit-selection") ?? [];
    expect(
      forMap.find((overlap) => overlap.otherId === "fo.modal.fullscreen.toggle")
        ?.kind,
    ).toBe("shadows");
  });
});

describe("dismissal stack", () => {
  it("consults deepest scope first, regardless of push order", () => {
    const stack = new DismissalStack();
    const order: string[] = [];

    // Pushed shallow-last on purpose: React runs child effects before parent
    // effects, so this is the order a nested UI actually produces.
    stack.push({
      id: "tool",
      label: "tool",
      scope: "demo.canvas.tool",
      dismiss: () => {
        order.push("tool");
        return true;
      },
    });
    stack.push({
      id: "canvas",
      label: "canvas",
      scope: "demo.canvas",
      dismiss: () => {
        order.push("canvas");
        return true;
      },
    });

    expect(stack.dismiss().consumedBy?.id).toBe("tool");
    expect(order).toEqual(["tool"]);
  });

  it("falls through a decliner to the next layer", () => {
    const stack = new DismissalStack();
    stack.push({
      id: "inner",
      label: "inner",
      scope: "demo.canvas.tool",
      dismiss: () => false,
    });
    stack.push({
      id: "outer",
      label: "outer",
      scope: "demo",
      dismiss: () => true,
    });

    const result = stack.dismiss();
    expect(result.consumedBy?.id).toBe("outer");
    expect(result.declined.map((entry) => entry.id)).toEqual(["inner"]);
  });

  it("pops exactly one layer per dismissal", () => {
    const stack = new DismissalStack();
    const hits: string[] = [];
    const popInner = stack.push({
      id: "inner",
      label: "inner",
      scope: "demo.canvas.tool",
      dismiss: () => {
        hits.push("inner");
        return true;
      },
    });
    stack.push({
      id: "outer",
      label: "outer",
      scope: "demo",
      dismiss: () => {
        hits.push("outer");
        return true;
      },
    });

    stack.dismiss();
    expect(hits).toEqual(["inner"]);
    popInner();
    stack.dismiss();
    expect(hits).toEqual(["inner", "outer"]);
  });
});

describe("registry resolution", () => {
  let registry: KeymapRegistry;

  beforeEach(() => {
    // The registry is a singleton owning a capture-phase document listener, so
    // it has to be disposed rather than merely dropped — an orphaned instance
    // keeps consuming events and silently steals them from the new one.
    registry?.dispose();
    localStorage.clear();
    registry = keymap();
  });

  it("does not fire a binding whose scope isn't pushed", () => {
    const handler = vi.fn();
    registry.bind("fo.modal.sidebar.toggle", handler);

    document.dispatchEvent(press("KeyS"));
    expect(handler).not.toHaveBeenCalled();

    registry.pushScope("modal");
    document.dispatchEvent(press("KeyS"));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("gives the deepest active scope the key", () => {
    const page = vi.fn();
    const canvas = vi.fn();
    const tool = vi.fn();
    registry.bind("demo.page.action", page);
    registry.bind("demo.canvas.action", canvas);
    registry.bind("demo.tool.action", tool);

    registry.pushScope("demo");
    document.dispatchEvent(press("KeyA"));
    expect(page).toHaveBeenCalledTimes(1);

    registry.pushScope("demo.canvas");
    document.dispatchEvent(press("KeyA"));
    expect(canvas).toHaveBeenCalledTimes(1);
    expect(page).toHaveBeenCalledTimes(1);

    const popTool = registry.pushScope("demo.canvas.tool");
    document.dispatchEvent(press("KeyA"));
    expect(tool).toHaveBeenCalledTimes(1);
    expect(canvas).toHaveBeenCalledTimes(1);

    // Popping the deepest scope hands the key back, which is the property the
    // hardcoded always-active stack cannot express (F1).
    popTool();
    document.dispatchEvent(press("KeyA"));
    expect(canvas).toHaveBeenCalledTimes(2);
  });

  it("suppresses the event so competing handlers don't also run", () => {
    // F2: the existing bus listens on bubble, so its stopPropagation cannot
    // stop sibling document handlers. On capture it can.
    const bystander = vi.fn();
    document.addEventListener("keydown", bystander);
    registry.bind("demo.page.flash", vi.fn());
    registry.pushScope("demo");

    document.dispatchEvent(press("KeyP"));
    expect(bystander).not.toHaveBeenCalled();
    document.removeEventListener("keydown", bystander);
  });

  it("leaves unmatched keys alone", () => {
    const bystander = vi.fn();
    document.addEventListener("keydown", bystander);
    registry.pushScope("demo");

    document.dispatchEvent(press("KeyQ"));
    expect(bystander).toHaveBeenCalledTimes(1);
    document.removeEventListener("keydown", bystander);
  });

  it("drops key repeat unless the binding opts in", () => {
    const nudge = vi.fn();
    const draw = vi.fn();
    registry.bind("demo.canvas.nudge", nudge);
    registry.bind("demo.canvas.draw", draw);
    registry.pushScope("demo");
    registry.pushScope("demo.canvas");

    // Read the key from the manifest rather than hardcoding it: this test
    // previously asserted ArrowRight and broke the moment the default moved,
    // which is the same drift the manifest exists to prevent.
    const nudgeKey = lookupCommand("demo.canvas.nudge")!.defaultKeys[0];
    document.dispatchEvent(press(nudgeKey, {}, { repeat: true }));
    expect(nudge).toHaveBeenCalledTimes(1);

    document.dispatchEvent(press("KeyD", {}, { repeat: true }));
    expect(draw).not.toHaveBeenCalled();
  });

  it("matches modifiers exactly", () => {
    const undo = vi.fn();
    registry.bind("fo.undo", undo);

    document.dispatchEvent(press("KeyZ", { ctrlKey: true }));
    expect(undo).toHaveBeenCalledTimes(1);

    // ctrl+shift+z is Redo, so it must not also reach Undo.
    document.dispatchEvent(press("KeyZ", { ctrlKey: true, shiftKey: true }));
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it("honors an enablement predicate without consuming the event", () => {
    const disabled = vi.fn();
    registry.bind("demo.page.flash", disabled, () => false);
    registry.pushScope("demo");

    const bystander = vi.fn();
    document.addEventListener("keydown", bystander);
    document.dispatchEvent(press("KeyP"));

    expect(disabled).not.toHaveBeenCalled();
    // Nothing consumed it, so it must still be free to reach anyone else.
    expect(bystander).toHaveBeenCalledTimes(1);
    document.removeEventListener("keydown", bystander);
  });

  it("rebinds via an override and stops honoring the old key", () => {
    const sidebar = vi.fn();
    registry.bind("fo.modal.sidebar.toggle", sidebar);
    registry.pushScope("modal");

    registry.setKeys("fo.modal.sidebar.toggle", ["KeyB"]);
    document.dispatchEvent(press("KeyB"));
    expect(sidebar).toHaveBeenCalledTimes(1);

    document.dispatchEvent(press("KeyS"));
    expect(sidebar).toHaveBeenCalledTimes(1);
  });

  it("disables via an empty key list and restores to the default", () => {
    const sidebar = vi.fn();
    registry.bind("fo.modal.sidebar.toggle", sidebar);
    registry.pushScope("modal");

    registry.setKeys("fo.modal.sidebar.toggle", []);
    document.dispatchEvent(press("KeyS"));
    expect(sidebar).not.toHaveBeenCalled();

    registry.restore("fo.modal.sidebar.toggle");
    document.dispatchEvent(press("KeyS"));
    expect(sidebar).toHaveBeenCalledTimes(1);
  });

  it("layers a preset under user overrides", () => {
    registry.setPreset("cvat-compatible");
    const view = new Map(
      registry.resolved().map((binding) => [binding.entry.id, binding]),
    );
    expect(view.get("fo.modal.sidebar.toggle")?.keys).toEqual(["KeyB"]);
    expect(view.get("fo.modal.sidebar.toggle")?.source).toBe("preset");

    registry.setKeys("fo.modal.sidebar.toggle", ["KeyN"]);
    const after = new Map(
      registry.resolved().map((binding) => [binding.entry.id, binding]),
    );
    expect(after.get("fo.modal.sidebar.toggle")?.keys).toEqual(["KeyN"]);
    expect(after.get("fo.modal.sidebar.toggle")?.source).toBe("user");
  });

  it("refuses a binding for a command that isn't declared", () => {
    // Otherwise the binding would be invisible to the settings pane, which is
    // exactly the drift the manifest exists to prevent.
    expect(() => registry.bind("fo.not.declared", vi.fn())).toThrow(/manifest/);
  });

  it("lists every declared command whether or not a handler is mounted", () => {
    // The whole point of §4.4: a settings pane can render modal and annotation
    // shortcuts with nothing mounted.
    const resolved = registry.resolved();
    expect(
      resolved.some(
        (binding) => binding.entry.id === "fo.modal.annotate.3d.scale",
      ),
    ).toBe(true);
    expect(registry.isBound("fo.modal.annotate.3d.scale")).toBe(false);
  });

  it("explains why each candidate did or didn't win", () => {
    registry.bind("demo.page.action", vi.fn());
    registry.bind("demo.canvas.action", vi.fn());
    registry.pushScope("demo");
    registry.pushScope("demo.canvas");

    const candidates = registry.explain(press("KeyA"));
    expect(candidates[0].entry.id).toBe("demo.tool.action");
    expect(candidates[0].status).toBe("scope-inactive");
    expect(candidates[1].entry.id).toBe("demo.canvas.action");
    expect(candidates[1].status).toBe("would-fire");
    expect(candidates[2].entry.id).toBe("demo.page.action");
    expect(candidates[2].status).toBe("shadowed");
  });
});

describe("display labels", () => {
  it("never returns an empty label for an unbound command", () => {
    // A rebound-away or disabled command must read as "unbound" rather than
    // rendering nothing, which is how a broken demo looks fine but isn't.
    expect(describeKeys([])).toBe("unbound");
  });

  it("labels a chord from its physical code", () => {
    expect(describeKeys(["KeyS"])).toBe("S");
    expect(describeKeys(["BracketLeft"])).toBe("[");
    expect(describeKeys(["ArrowRight"])).toBe("→");
  });

  it("joins multiple bindings rather than showing only the first", () => {
    expect(describeKeys(["Delete", "Backspace"])).toBe("Delete or Backspace");
  });

  it("puts the meta key first off Apple, so it doesn't read as a typo", () => {
    // "Shift + Win + Z" is what storage order would produce; users read that
    // as a mistake.
    expect(describeKeys(["meta+shift+KeyZ"])).toBe("Win + Shift + Z");
    expect(describeKeys(["ctrl+Enter"])).toBe("Ctrl + Enter");
  });
});

describe("held bindings (F9)", () => {
  let registry: KeymapRegistry;

  beforeEach(() => {
    registry?.dispose();
    localStorage.clear();
    registry = keymap();
  });

  const shiftDown = () =>
    new KeyboardEvent("keydown", {
      code: "ShiftLeft",
      shiftKey: true,
      bubbles: true,
    });
  const shiftUp = () =>
    new KeyboardEvent("keyup", {
      code: "ShiftLeft",
      shiftKey: false,
      bubbles: true,
    });

  it("reports press and release", () => {
    const changes: boolean[] = [];
    registry.bindHold("fo.modal.overlays.hide", (held) => changes.push(held));
    registry.pushScope("modal");

    document.dispatchEvent(shiftDown());
    document.dispatchEvent(shiftUp());
    expect(changes).toEqual([true, false]);
  });

  it("does not consume the event, so the key still modifies other input", () => {
    // Holding Shift to peek under the overlays must not stop Shift being Shift.
    const bystander = vi.fn();
    document.addEventListener("keydown", bystander);
    registry.bindHold("fo.modal.overlays.hide", () => undefined);
    registry.pushScope("modal");

    document.dispatchEvent(shiftDown());
    expect(bystander).toHaveBeenCalledTimes(1);
    document.removeEventListener("keydown", bystander);
  });

  it("does not re-fire while the key auto-repeats", () => {
    const changes: boolean[] = [];
    registry.bindHold("fo.modal.overlays.hide", (held) => changes.push(held));
    registry.pushScope("modal");

    document.dispatchEvent(shiftDown());
    document.dispatchEvent(shiftDown());
    document.dispatchEvent(shiftDown());
    expect(changes).toEqual([true]);
  });

  it("releases on window blur, so a missed keyup can't strand it", () => {
    const changes: boolean[] = [];
    registry.bindHold("fo.modal.overlays.hide", (held) => changes.push(held));
    registry.pushScope("modal");

    document.dispatchEvent(shiftDown());
    window.dispatchEvent(new Event("blur"));
    expect(changes).toEqual([true, false]);
  });

  it("releases when the binding unmounts mid-hold", () => {
    const changes: boolean[] = [];
    const unbind = registry.bindHold("fo.modal.overlays.hide", (held) =>
      changes.push(held),
    );
    registry.pushScope("modal");

    document.dispatchEvent(shiftDown());
    unbind();
    expect(changes).toEqual([true, false]);
  });

  it("stays silent when its scope isn't active", () => {
    const changes: boolean[] = [];
    registry.bindHold("fo.modal.overlays.hide", (held) => changes.push(held));

    document.dispatchEvent(shiftDown());
    expect(changes).toEqual([]);
  });
});

/**
 * The gate the design doc's §4.7 asks for: because the manifest is static, a
 * true conflict is knowable without running the app, so CI can refuse one
 * rather than leaving a user to discover that a key does nothing.
 *
 * Only same-scope collisions count. Shadowing across scopes is legal and
 * expected — it is what scoping is *for* — so gating on it would fail the build
 * for correct code and the gate would be deleted within a week.
 */
describe("manifest integrity", () => {
  const demoOnly = (id: string) => id.startsWith("demo.");

  it("ships no true conflicts outside the demo route", () => {
    const conflicts = trueConflicts(
      analyzeOverlaps(resolveKeymap(DEFAULT_PRESET, {})),
    ).filter((overlap) => !demoOnly(overlap.otherId));

    expect(conflicts).toEqual([]);
  });

  it("keeps the demo's deliberate conflict, since the pane needs one to render", () => {
    const conflicts = trueConflicts(
      analyzeOverlaps(resolveKeymap(DEFAULT_PRESET, {})),
    ).filter((overlap) => demoOnly(overlap.otherId));

    expect(conflicts.map((overlap) => overlap.otherId).sort()).toEqual([
      "demo.canvas.draw",
      "demo.canvas.duplicate",
    ]);
  });

  it("ships no conflicts under any preset either", () => {
    // A preset rebinds commands wholesale, so it is exactly the thing that can
    // introduce a collision nobody notices — the defaults stay clean while the
    // preset quietly breaks a key.
    for (const presetName of Object.keys(PRESETS)) {
      const conflicts = trueConflicts(
        analyzeOverlaps(resolveKeymap(presetName, {})),
      ).filter((overlap) => !demoOnly(overlap.otherId));

      expect({ presetName, conflicts }).toEqual({ presetName, conflicts: [] });
    }
  });

  it("gives every command a scope that exists in the tree", () => {
    const unknown = MANIFEST.filter(
      (entry) => !(entry.scope in SCOPE_PARENTS),
    ).map((entry) => entry.id);

    expect(unknown).toEqual([]);
  });

  it("parses every default key it declares", () => {
    const unparseable = MANIFEST.flatMap((entry) =>
      entry.defaultKeys
        .filter((key) => tryParseChord(key) === null)
        .map((key) => `${entry.id}:${key}`),
    );

    expect(unparseable).toEqual([]);
  });

  it("only lets a holdable command declare a bare modifier", () => {
    // A non-holdable binding on `ShiftLeft` can never fire, because exact
    // modifier matching means the chord would have to match a state it created.
    const bad = MANIFEST.filter(
      (entry) =>
        !entry.holdable &&
        entry.defaultKeys.some((key) =>
          isModifierCode(parseChord(key, { allowModifierKey: true }).code),
        ),
    ).map((entry) => entry.id);

    expect(bad).toEqual([]);
  });

  it("refuses to offer a rebind for a command another system dispatches", () => {
    // The override would be written, persisted, and then ignored by whatever is
    // actually listening — the pane's worst possible failure mode, because the
    // user's own change is what appears to be broken.
    for (const entry of notYetMigrated()) {
      expect({ id: entry.id, remappable: isRemappable(entry) }).toEqual({
        id: entry.id,
        remappable: false,
      });
    }
  });
});

describe("legacy-owned commands", () => {
  let registry: KeymapRegistry;

  beforeEach(() => {
    registry?.dispose();
    localStorage.clear();
    registry = keymap();
  });

  it("reports them as legacy-owned rather than unbound", () => {
    registry.pushScope("modal");
    const candidates = registry.explain(press("KeyF"));
    const fullscreen = candidates.find(
      (candidate) => candidate.entry.id === "fo.modal.fullscreen.toggle",
    );

    expect(fullscreen?.status).toBe("legacy-owned");
  });

  it("does not consume the event, so the owning system still sees it", () => {
    registry.pushScope("modal");
    const event = press("KeyF");
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it("still reports a plain unbound command as unbound", () => {
    registry.pushScope("modal");
    // Migrated onto the bus, so nothing else owns it — with no handler mounted
    // it is genuinely unbound.
    const candidates = registry.explain(press("ArrowRight"));
    const next = candidates.find(
      (candidate) => candidate.entry.id === "fo.modal.next.sample",
    );

    expect(next?.status).toBe("unbound");
  });
});

describe("arrow keys", () => {
  let registry: KeymapRegistry;

  beforeEach(() => {
    registry?.dispose();
    localStorage.clear();
    registry = keymap();
  });

  it("dispatches sample navigation and repeats while held", () => {
    const next = vi.fn();
    registry.bind("fo.modal.next.sample", next);
    registry.pushScope("modal");

    document.dispatchEvent(press("ArrowRight"));
    document.dispatchEvent(press("ArrowRight", {}, { repeat: true }));

    expect(next).toHaveBeenCalledTimes(2);
  });

  it("labels arrows layout-independently, so getLayoutMap can't move them", () => {
    expect(describeKeys(["ArrowLeft"])).toBe("←");
    expect(describeKeys(["ArrowUp"])).toBe("↑");
  });

  it("keeps modal arrows and operator-browser arrows apart by scope", () => {
    const sample = vi.fn();
    const operator = vi.fn();
    registry.bind("fo.modal.next.sample", sample);
    registry.bind("fo.operator-browser.next", operator);
    registry.pushScope("modal");

    document.dispatchEvent(press("ArrowRight"));
    expect(sample).toHaveBeenCalledTimes(1);
    expect(operator).not.toHaveBeenCalled();

    registry.pushScope("overlay");
    registry.pushScope("overlay.operator-browser");
    document.dispatchEvent(press("ArrowDown"));
    expect(operator).toHaveBeenCalledTimes(1);
  });

  it("survives the no-arrow-keys preset by moving, not disappearing", () => {
    const next = vi.fn();
    registry.bind("fo.modal.next.sample", next);
    registry.pushScope("modal");
    registry.setPreset("no-arrow-keys");

    document.dispatchEvent(press("ArrowRight"));
    expect(next).not.toHaveBeenCalled();

    document.dispatchEvent(press("Quote"));
    expect(next).toHaveBeenCalledTimes(1);
  });
});
