import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import { afterEach, describe, expect, it } from "vitest";
import {
  mcapSelectedObjectAtom,
  type McapSelectedObject,
} from "./mcap-selected-object";
import McapInspectorSidebar from "./McapInspectorSidebar";

function renderSidebar(selected: McapSelectedObject | null) {
  const store = createStore();
  store.set(mcapSelectedObjectAtom, selected);
  const view = render(
    <JotaiProvider store={store}>
      <McapInspectorSidebar />
    </JotaiProvider>,
  );
  return { store, view };
}

describe("McapInspectorSidebar", () => {
  afterEach(() => cleanup());

  it("prompts for a selection when nothing is picked", () => {
    renderSidebar(null);
    expect(screen.getByTestId("mcap-inspector-empty")).toBeTruthy();
  });

  it("renders structured fields for a 3D scene object", () => {
    renderSidebar({
      entityId: "veh-12",
      frameId: "base_link",
      kind: "scene-annotation",
      label: "car",
      metadata: { category: "car", score: "0.97" },
      scope: "instance",
      topic: "/markers/annotations",
    });

    const body = screen.getByTestId("mcap-inspector-body");
    expect(body.textContent).toContain("car");
    expect(body.textContent).toContain("veh-12");
    expect(body.textContent).toContain("/markers/annotations");
    expect(body.textContent).toContain("base_link");
    expect(body.textContent).toContain("score: 0.97");
  });

  it("renders fields and geometry for a 2D image object", () => {
    renderSidebar({
      data: { diameter: 12, position: [4, 5] },
      key: "c-0-0",
      kind: "image-annotation",
      label: "pedestrian",
      primitiveIndex: 0,
      primitiveKind: "circle",
      scope: "instance",
      topic: "/cam_front/annotations",
    });

    const body = screen.getByTestId("mcap-inspector-body");
    expect(body.textContent).toContain("pedestrian");
    expect(body.textContent).toContain("circle");
    expect(body.textContent).toContain("/cam_front/annotations");
    expect(body.textContent).toContain('"diameter": 12');
  });

  it("clears the selection from the clear button", () => {
    const { store } = renderSidebar({
      entityId: "veh-12",
      kind: "scene-annotation",
      label: "car",
      metadata: {},
      scope: "instance",
      topic: "/markers",
    });

    fireEvent.click(screen.getByTestId("mcap-inspector-clear"));
    expect(store.get(mcapSelectedObjectAtom)).toBeNull();
    expect(screen.getByTestId("mcap-inspector-empty")).toBeTruthy();
  });
});
