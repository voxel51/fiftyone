import { describe, expect, it } from "vitest";
import { EventBus, LIGHTER_EVENTS } from "../event/EventBus";
import { SelectionManager } from "./SelectionManager";

class Selectable {
  public id = "id";
  private selected = false;
  constructor() {}
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
    const bus = new EventBus();
    const manager = new SelectionManager(bus);
    manager.addSelectable(new Selectable());
    const selectDetail = await new Promise((resolve) => {
      bus.on(LIGHTER_EVENTS.OVERLAY_SELECT, (event) => resolve(event.detail));

      manager.select("id", { ignoreSideEffects: true });
    });

    expect(selectDetail).toStrictEqual({
      id: "id",
      point: { x: 0, y: 0 },
      ignoreSideEffects: true,
      isShiftPressed: false,
      isBridgeLogicHandled: false,
    });

    const deselectDetail = await new Promise((resolve) => {
      bus.on(LIGHTER_EVENTS.OVERLAY_DESELECT, (event) => resolve(event.detail));
      manager.deselect("id", { ignoreSideEffects: true });
    });

    expect(deselectDetail).toStrictEqual({
      id: "id",
      ignoreSideEffects: true,
      isBridgeLogicHandled: false,
    });
  });
});
