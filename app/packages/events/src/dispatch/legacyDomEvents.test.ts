import { describe, expect, test, vi } from "vitest";
import { EventDispatcher } from "./dispatcher";
import { forwardingLegacyDomEvent, isLegacyDomMirror } from "./legacyDomEvents";

const bus = new EventDispatcher<Record<string, unknown>>();

/** The DOM events `type` on `target` receives while `run` runs */
const heard = (target: EventTarget, type: string, run: () => void) => {
  const events: CustomEvent[] = [];
  const listener = (e: Event) => events.push(e as CustomEvent);
  target.addEventListener(type, listener);
  run();
  target.removeEventListener(type, listener);
  return events;
};

describe("legacy DOM events", () => {
  test.each([
    ["timeline:play", { timelineName: "t" }, "play", { timelineName: "t" }],
    ["timeline:pause", { timelineName: "t" }, "pause", { timelineName: "t" }],
    [
      "timeline:seek",
      { timelineName: "t", start: true },
      "seek",
      { timelineName: "t", start: true },
    ],
    [
      "timeline:set-frame-number",
      { timelineName: "t", frameNumber: 4 },
      "set-frame-number-t",
      { frameNumber: 4 },
    ],
    ["imavid:fetched", { id: "frames" }, "fetchMore", { id: "frames" }],
    ["fo-hide-label-change", undefined, "fo-hide-label-change", null],
    ["frames-loaded", { localId: "a1" }, "frames-loaded", { localId: "a1" }],
    ["fo-action-set-top-view", undefined, "fo-action-set-top-view", null],
    ["fo-action-set-ego-view", undefined, "fo-action-set-ego-view", null],
    [
      "fo-action-zoom-to-selected",
      undefined,
      "fo-action-zoom-to-selected",
      null,
    ],
  ])(
    "%s is mirrored to window listeners",
    (busEvent, payload, name, detail) => {
      const events = heard(window, name, () => bus.dispatch(busEvent, payload));

      expect(events).toHaveLength(1);
      expect(events[0].detail).toEqual(detail);
      expect(isLegacyDomMirror(events[0])).toBe(true);
    },
  );

  test.each([
    ["grid-mount", { id: "g", width: 10 }, { id: "g", width: 10 }],
    ["looker3d-camera-look-at-settled", undefined, null],
  ])("%s reaches document listeners", (busEvent, payload, detail) => {
    const events = heard(document, busEvent, () =>
      bus.dispatch(busEvent, payload),
    );

    expect(events).toHaveLength(1);
    expect(events[0].detail).toEqual(detail);
  });

  test("animation-onRest bubbles from its sidebar container", () => {
    const container = document.createElement("div");
    document.body.append(container);

    const events = heard(document.body, "animation-onRest", () =>
      bus.dispatch("animation-onRest", { container }),
    );

    expect(events).toHaveLength(1);
    expect(events[0].target).toBe(container);
    container.remove();
  });

  test("a plugin's own DOM event forwarded to the bus is not mirrored back", () => {
    const handler = vi.fn();
    const off = bus.on("frames-loaded", handler);

    const events = heard(window, "frames-loaded", () =>
      forwardingLegacyDomEvent(() =>
        bus.dispatch("frames-loaded", { localId: "a1" }),
      ),
    );
    off();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(0);
  });

  test("a plugin's DOM command is not mistaken for a mirror", () => {
    expect(isLegacyDomMirror(new CustomEvent("play"))).toBe(false);
  });

  test("other bus events are never sent to the DOM", () => {
    const events = heard(window, "timeline:play", () =>
      bus.dispatch("timeline:play", { timelineName: "t" }),
    );

    expect(events).toHaveLength(0);
  });
});
