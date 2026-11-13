import { describe, expect, it, vi } from "vitest";
import {
  FO_LABEL_HOVERED_EVENT,
  FO_LABEL_TOGGLED_EVENT,
  FO_LABEL_UNHOVERED_EVENT,
  LabelHoveredEvent,
  SelectiveRenderingEventBus,
  type EventCallback,
} from "./selective-rendering-events";

const HOVERED = {
  sampleId: "s",
  field: "ground_truth",
  instanceId: "i",
  labelId: "l",
};
const TOGGLED = {
  sourceInstanceId: "i",
  sourceSampleId: "s",
  sourceLabelId: "l",
};

describe("SelectiveRenderingEventBus", () => {
  it("sends each event to its own listeners as { type, detail }", () => {
    const bus = new SelectiveRenderingEventBus();
    const hovered = vi.fn();
    const unhovered = vi.fn();
    bus.on(FO_LABEL_HOVERED_EVENT, hovered);
    bus.on(FO_LABEL_UNHOVERED_EVENT, unhovered);

    bus.dispatch(FO_LABEL_HOVERED_EVENT, HOVERED);

    expect(unhovered).not.toHaveBeenCalled();
    expect(hovered).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        type: FO_LABEL_HOVERED_EVENT,
        detail: HOVERED,
      }),
    );
  });

  it("keeps an event from later listeners once one stops it", () => {
    const bus = new SelectiveRenderingEventBus();
    const order: string[] = [];
    const stopping: EventCallback = (event) => {
      order.push("first");
      event.stopImmediatePropagation();
    };
    bus.on(FO_LABEL_TOGGLED_EVENT, stopping);
    bus.on(FO_LABEL_TOGGLED_EVENT, () => order.push("second"));

    bus.dispatch(FO_LABEL_TOGGLED_EVENT, TOGGLED);
    bus.dispatch(FO_LABEL_TOGGLED_EVENT, TOGGLED);

    expect(order).toEqual(["first", "first"]);
  });

  it("removes a listener by its unsubscribe, its signal, or removeAllListeners", () => {
    const bus = new SelectiveRenderingEventBus();
    const unsubscribed = vi.fn();
    const aborted = vi.fn();
    const cleared = vi.fn();
    const controller = new AbortController();
    bus.on(FO_LABEL_HOVERED_EVENT, unsubscribed)();
    bus.on(FO_LABEL_HOVERED_EVENT, aborted, controller.signal);
    controller.abort();
    bus.dispatch(FO_LABEL_HOVERED_EVENT, HOVERED);

    bus.on(FO_LABEL_HOVERED_EVENT, cleared);
    bus.removeAllListeners();
    bus.dispatch(FO_LABEL_HOVERED_EVENT, HOVERED);

    expect(unsubscribed).not.toHaveBeenCalled();
    expect(aborted).not.toHaveBeenCalled();
    expect(cleared).not.toHaveBeenCalled();
  });

  it("still sends a label event built by its class", () => {
    const bus = new SelectiveRenderingEventBus();
    const hovered = vi.fn();
    bus.on(FO_LABEL_HOVERED_EVENT, hovered);

    bus.emit(new LabelHoveredEvent(HOVERED));

    expect(hovered).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        type: FO_LABEL_HOVERED_EVENT,
        detail: HOVERED,
      }),
    );
  });
});
