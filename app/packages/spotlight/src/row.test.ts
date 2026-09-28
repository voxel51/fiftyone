import { describe, expect, it, vi } from "vitest";
import { DIRECTION, TOP } from "./constants";
import Spotlight from "./index";
import Iter from "./iter";
import Row from "./row";
import Section from "./section";
import type { SpotlightConfig } from "./types";

describe("tile selection gestures", () => {
  it("forwards Shift-click and bucket modifiers without forwarding modified context menus", () => {
    const onItemClick = vi.fn();
    const showItem = vi.fn<SpotlightConfig<number, null>["showItem"]>(
      async () => 0,
    );
    const config: SpotlightConfig<number, null> = {
      key: 0,
      spacing: 0,
      detachItem: vi.fn(),
      get: vi.fn(),
      hideItem: vi.fn(),
      onItemClick,
      rowAspectRatioThreshold: () => 1,
      showItem,
    };
    const section = new Section({
      config,
      direction: DIRECTION.FORWARD,
      edge: { key: null },
      width: 100,
    });
    const focus = vi.fn();
    const item = {
      id: { description: "tile" },
      aspectRatio: 1,
      key: 0,
      data: null,
    };
    const row = new Row({
      config,
      dangle: false,
      from: 0,
      focus,
      items: [item],
      iter: new Iter(focus, vi.fn(), vi.fn(), section, () => section),
      width: 100,
    });
    row.show({
      attr: TOP,
      element: document.createElement("div"),
      spotlight: new Spotlight(config),
      zooming: false,
    });
    const element = showItem.mock.calls[0][0].element;
    for (const modifiers of [
      { shiftKey: true },
      { shiftKey: true, metaKey: true },
      { shiftKey: true, ctrlKey: true },
      { shiftKey: true, altKey: true },
    ]) {
      const event = new MouseEvent("click", { ...modifiers, cancelable: true });
      element.dispatchEvent(event);
      expect(onItemClick).toHaveBeenLastCalledWith(
        expect.objectContaining({ event, item }),
      );
      expect(event.defaultPrevented).toBe(true);
      element.dispatchEvent(new MouseEvent("contextmenu", modifiers));
    }
    expect(onItemClick).toHaveBeenCalledTimes(4);
    row.destroy();
  });
});
