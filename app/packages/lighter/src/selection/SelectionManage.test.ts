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
});
