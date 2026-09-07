import { describe, expect, it } from "vitest";
import { getEventBus } from "@fiftyone/events";
import type { LighterEventGroup } from "../events";
import { SelectionManager } from "./SelectionManager";

class Selectable {
  public id = "id";
  private selected = false;

  getSelectionPriority = () => 0;
  isSelected = () => {
    return this.selected;
  };
  setSelected = (selected: boolean) => {
    this.selected = selected;
  };
  toggleSelected = () => {
    this.selected = !this.selected;
    return this.selected;
  };
}

describe("SelectionManager", () => {
  it("emits correct select and deselect events", async () => {
    const bus = getEventBus<LighterEventGroup>();
    const manager = new SelectionManager();
    manager.addSelectable(new Selectable());
    const selectDetail = await new Promise((resolve) => {
      bus.on("lighter:overlay-select", (payload) => resolve(payload));

      manager.select("id", { ignoreSideEffects: true });
    });

    expect(selectDetail).toStrictEqual({
      id: "id",
      point: { x: 0, y: 0 },
      ignoreSideEffects: true,
      isShiftPressed: false,
    });

    const deselectDetail = await new Promise((resolve) => {
      bus.on("lighter:overlay-deselect", (payload) => resolve(payload));
      manager.deselect("id", { ignoreSideEffects: true });
    });

    expect(deselectDetail).toStrictEqual({
      id: "id",
      ignoreSideEffects: true,
    });
  });

  it("removes selected overlay and emits deselect events", async () => {
    const bus = getEventBus<LighterEventGroup>();
    const manager = new SelectionManager();
    const selectable = new Selectable();
    manager.addSelectable(selectable);

    manager.select("id", { ignoreSideEffects: true });
    expect(manager.getSelectedIds()).toContain("id");
    expect(manager.isSelected("id")).toBe(true);

    const deselectPromise = new Promise((resolve) => {
      bus.on("lighter:overlay-deselect", (payload) => resolve(payload));
    });

    const selectionChangedPromise = new Promise((resolve) => {
      bus.on("lighter:selection-changed", (payload) => resolve(payload));
    });

    manager.removeSelectable("id");

    const deselectDetail = await deselectPromise;
    const selectionChangedDetail = await selectionChangedPromise;

    expect(deselectDetail).toStrictEqual({
      id: "id",
      ignoreSideEffects: true,
    });

    expect(selectionChangedDetail).toStrictEqual({
      selectedIds: [],
      deselectedIds: ["id"],
      ignoreSideEffects: true,
    });

    expect(manager.getSelectedIds()).not.toContain("id");
    expect(manager.isSelected("id")).toBe(false);
    expect(manager.getSelectionCount()).toBe(0);
  });
});

/** A selectable with a caller-chosen id, so a set can hold more than one. */
class Overlay {
  private selected = false;

  constructor(public id: string) {}

  getSelectionPriority = () => 0;
  isSelected = () => this.selected;
  setSelected = (selected: boolean) => {
    this.selected = selected;
  };
  toggleSelected = () => {
    this.selected = !this.selected;
    return this.selected;
  };
}

describe("SelectionManager — multiple selection", () => {
  /** Own channel per manager so one test's events can't reach another's bus. */
  let channel = 0;
  const make = (multiple: boolean) => {
    const manager = new SelectionManager(`sel-${channel++}`);
    const a = new Overlay("a");
    const b = new Overlay("b");
    manager.addSelectable(a);
    manager.addSelectable(b);
    manager.setMultipleSelection(multiple);
    return { manager, a, b };
  };

  it("defaults to single selection, so a second select replaces the first", () => {
    const { manager, a, b } = make(false);

    manager.select("a");
    manager.select("b");

    expect(manager.getSelectedIds()).toEqual(["b"]);
    // the overlay's own flag tracks the manager — this is what the canvas draws
    expect(a.isSelected()).toBe(false);
    expect(b.isSelected()).toBe(true);
  });

  it("keeps both when multiple selection is on", () => {
    const { manager, a, b } = make(true);

    manager.select("a");
    manager.select("b");

    expect(manager.getSelectedIds()).toEqual(["a", "b"]);
    expect(a.isSelected()).toBe(true);
    expect(b.isSelected()).toBe(true);
  });

  it("toggles one out of a multi-selection and leaves the rest", () => {
    const { manager, a, b } = make(true);
    manager.select("a");
    manager.select("b");

    expect(manager.toggle("a")).toBe(false);

    expect(manager.getSelectedIds()).toEqual(["b"]);
    expect(a.isSelected()).toBe(false);
    expect(b.isSelected()).toBe(true);
  });

  it("collapses a standing multi-selection to nothing when switched off", () => {
    const { manager, a, b } = make(true);
    manager.select("a");
    manager.select("b");

    manager.setMultipleSelection(false);

    // dropping to one arbitrary survivor would leave the manager's set and the
    // overlays' own flags disagreeing about which one that was
    expect(manager.getSelectedIds()).toEqual([]);
    expect(a.isSelected()).toBe(false);
    expect(b.isSelected()).toBe(false);
  });

  it("leaves a single standing selection alone when switched off", () => {
    const { manager, a } = make(true);
    manager.select("a");

    manager.setMultipleSelection(false);

    expect(manager.getSelectedIds()).toEqual(["a"]);
    expect(a.isSelected()).toBe(true);
  });
});

describe("SelectionManager — selection-changed side-effect flag", () => {
  /**
   * A listener mirroring this event into other state has to tell a user
   * gesture from a programmatic echo — a menu applying a selection it has
   * already recorded elsewhere. `deselect` always carried the flag; `select`
   * dropped it, so a flagged select arrived looking like a click.
   */
  it("carries ignoreSideEffects on a programmatic select", async () => {
    const bus = getEventBus<LighterEventGroup>("sel-flag");
    const manager = new SelectionManager("sel-flag");
    manager.addSelectable(new Overlay("a"));

    const payload = await new Promise((resolve) => {
      bus.on("lighter:selection-changed", resolve);
      manager.select("a", { ignoreSideEffects: true });
    });

    expect(payload).toStrictEqual({
      selectedIds: ["a"],
      deselectedIds: [],
      ignoreSideEffects: true,
    });
  });

  it("reports a user select as a user select", async () => {
    const bus = getEventBus<LighterEventGroup>("sel-user");
    const manager = new SelectionManager("sel-user");
    manager.addSelectable(new Overlay("a"));

    const payload = await new Promise((resolve) => {
      bus.on("lighter:selection-changed", resolve);
      manager.select("a");
    });

    expect(payload).toStrictEqual({
      selectedIds: ["a"],
      deselectedIds: [],
      ignoreSideEffects: false,
    });
  });
});
