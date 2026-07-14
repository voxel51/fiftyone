import { cleanup, fireEvent, render } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import { afterEach, describe, expect, it } from "vitest";
import {
  isMcapLabelEcho,
  isMcapSceneEntitySelected,
  mcapEntityLabel,
  mcapSelectedObjectAtom,
  McapSelectionHotkeys,
  type McapSelectedObject,
} from "./mcap-selected-object";

const SCENE_SELECTION: McapSelectedObject = {
  entityId: "veh-12",
  kind: "scene-annotation",
  label: "car",
  metadata: {},
  scope: "label",
  topic: "/markers",
};

describe("mcapEntityLabel", () => {
  it("prefers common label metadata keys in order", () => {
    expect(mcapEntityLabel({ id: "e1", metadata: { category: "truck" } })).toBe(
      "truck",
    );
    expect(
      mcapEntityLabel({
        id: "e1",
        metadata: { category: "truck", label: "car" },
      }),
    ).toBe("car");
  });

  it("falls back to the entity id, then null", () => {
    expect(mcapEntityLabel({ id: "veh-12", metadata: {} })).toBe("veh-12");
    expect(mcapEntityLabel({ id: "", metadata: {} })).toBeNull();
  });
});

describe("selection predicates", () => {
  it("matches only the exact scene entity", () => {
    expect(
      isMcapSceneEntitySelected(SCENE_SELECTION, "/markers", "veh-12"),
    ).toBe(true);
    expect(
      isMcapSceneEntitySelected(SCENE_SELECTION, "/markers", "veh-13"),
    ).toBe(false);
    expect(isMcapSceneEntitySelected(SCENE_SELECTION, "/other", "veh-12")).toBe(
      false,
    );
    expect(isMcapSceneEntitySelected(null, "/markers", "veh-12")).toBe(false);
  });

  it("echoes by label only when both sides have one", () => {
    expect(isMcapLabelEcho(SCENE_SELECTION, "car")).toBe(true);
    // Plain (instance-scoped) clicks never echo — one object only;
    // label-wide highlighting is reserved for shift-click.
    expect(
      isMcapLabelEcho({ ...SCENE_SELECTION, scope: "instance" }, "car"),
    ).toBe(false);
    expect(isMcapLabelEcho(SCENE_SELECTION, "truck")).toBe(false);
    expect(isMcapLabelEcho(SCENE_SELECTION, null)).toBe(false);
    expect(isMcapLabelEcho(null, "car")).toBe(false);
    expect(isMcapLabelEcho({ ...SCENE_SELECTION, label: null }, "car")).toBe(
      false,
    );
  });
});

describe("McapSelectionHotkeys", () => {
  afterEach(() => cleanup());

  it("clears the selection on Escape and consumes the event", () => {
    const store = createStore();
    store.set(mcapSelectedObjectAtom, SCENE_SELECTION);
    render(
      <JotaiProvider store={store}>
        <McapSelectionHotkeys />
      </JotaiProvider>,
    );

    const consumed = !fireEvent.keyDown(window, { key: "Escape" });
    expect(store.get(mcapSelectedObjectAtom)).toBeNull();
    // preventDefault fired → the modal's own Escape handling stays put.
    expect(consumed).toBe(true);
  });

  it("lets Escape pass through when nothing is selected", () => {
    const store = createStore();
    render(
      <JotaiProvider store={store}>
        <McapSelectionHotkeys />
      </JotaiProvider>,
    );

    const consumed = !fireEvent.keyDown(window, { key: "Escape" });
    expect(consumed).toBe(false);
  });
});
