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
      ignoreSideEffects: false,
    });

    expect(selectionChangedDetail).toStrictEqual({
      selectedIds: [],
      deselectedIds: ["id"],
    });

    expect(manager.getSelectedIds()).not.toContain("id");
    expect(manager.isSelected("id")).toBe(false);
    expect(manager.getSelectionCount()).toBe(0);
  });
});
