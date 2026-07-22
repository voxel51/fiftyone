import { cleanup, fireEvent, render } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import { afterEach, describe, expect, it } from "vitest";
import {
  isLabelEcho,
  isSceneEntitySelected,
  entityLabel,
  selectedObjectAtom,
  SelectionHotkeys,
  type SelectedObject,
} from "./selected-object";

const SCENE_SELECTION: SelectedObject = {
  entityId: "veh-12",
  kind: "scene-annotation",
  label: "car",
  metadata: {},
  scope: "label",
  stream: "/markers",
};

describe("entityLabel", () => {
  it("prefers common label metadata keys in order", () => {
    expect(entityLabel({ id: "e1", metadata: { category: "truck" } })).toBe(
      "truck",
    );
    expect(
      entityLabel({
        id: "e1",
        metadata: { category: "truck", label: "car" },
      }),
    ).toBe("car");
  });

  it("falls back to the entity id, then null", () => {
    expect(entityLabel({ id: "veh-12", metadata: {} })).toBe("veh-12");
    expect(entityLabel({ id: "", metadata: {} })).toBeNull();
  });
});

describe("selection predicates", () => {
  it("matches only the exact scene entity", () => {
    expect(isSceneEntitySelected(SCENE_SELECTION, "/markers", "veh-12")).toBe(
      true,
    );
    expect(isSceneEntitySelected(SCENE_SELECTION, "/markers", "veh-13")).toBe(
      false,
    );
    expect(isSceneEntitySelected(SCENE_SELECTION, "/other", "veh-12")).toBe(
      false,
    );
    expect(isSceneEntitySelected(null, "/markers", "veh-12")).toBe(false);
  });

  it("echoes by label only when both sides have one", () => {
    expect(isLabelEcho(SCENE_SELECTION, "car")).toBe(true);
    // Plain (instance-scoped) clicks never echo — one object only;
    // label-wide highlighting is reserved for shift-click.
    expect(isLabelEcho({ ...SCENE_SELECTION, scope: "instance" }, "car")).toBe(
      false,
    );
    expect(isLabelEcho(SCENE_SELECTION, "truck")).toBe(false);
    expect(isLabelEcho(SCENE_SELECTION, null)).toBe(false);
    expect(isLabelEcho(null, "car")).toBe(false);
    expect(isLabelEcho({ ...SCENE_SELECTION, label: null }, "car")).toBe(false);
  });
});

describe("SelectionHotkeys", () => {
  afterEach(() => cleanup());

  it("clears the selection on Escape and consumes the event", () => {
    const store = createStore();
    store.set(selectedObjectAtom, SCENE_SELECTION);
    render(
      <JotaiProvider store={store}>
        <SelectionHotkeys />
      </JotaiProvider>,
    );

    const consumed = !fireEvent.keyDown(window, { key: "Escape" });
    expect(store.get(selectedObjectAtom)).toBeNull();
    // preventDefault fired → the modal's own Escape handling stays put.
    expect(consumed).toBe(true);
  });

  it("lets Escape pass through when nothing is selected", () => {
    const store = createStore();
    render(
      <JotaiProvider store={store}>
        <SelectionHotkeys />
      </JotaiProvider>,
    );

    const consumed = !fireEvent.keyDown(window, { key: "Escape" });
    expect(consumed).toBe(false);
  });
});
