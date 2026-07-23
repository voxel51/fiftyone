import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import { afterEach, describe, expect, it } from "vitest";
import { SceneInventoryProvider } from "../../../../scene-inventory/react";
import {
  selectedObjectAtom,
  type SelectedObject,
} from "../../interaction/selection/selected-object";
import InspectorSidebar from "./InspectorSidebar";

const SOURCES = [
  {
    id: "12",
    label: "markers/annotations",
    sourceName: "/markers/annotations",
    type: "scene-annotation",
  },
  {
    id: "13",
    label: "cam_front/annotations",
    sourceName: "/cam_front/annotations",
    type: "image-annotation",
  },
] as const;

function renderSidebar(selected: SelectedObject | null) {
  const store = createStore();
  store.set(selectedObjectAtom, selected);
  const view = render(
    <JotaiProvider store={store}>
      <SceneInventoryProvider sources={SOURCES}>
        <InspectorSidebar />
      </SceneInventoryProvider>
    </JotaiProvider>,
  );
  return { store, view };
}

describe("InspectorSidebar", () => {
  afterEach(() => cleanup());

  it("prompts for a selection when nothing is picked", () => {
    renderSidebar(null);
    expect(screen.getByTestId("episode-inspector-empty")).toBeTruthy();
  });

  it("renders structured fields for a 3D scene object", () => {
    renderSidebar({
      entityId: "veh-12",
      frameId: "base_link",
      kind: "scene-annotation",
      label: "car",
      metadata: { category: "car", score: "0.97" },
      scope: "instance",
      stream: "12",
    });

    const body = screen.getByTestId("episode-inspector-body");
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
      stream: "13",
    });

    const body = screen.getByTestId("episode-inspector-body");
    expect(body.textContent).toContain("pedestrian");
    expect(body.textContent).toContain("circle");
    expect(body.textContent).toContain("/cam_front/annotations");
    expect(screen.queryByText("13")).toBeNull();
    expect(body.textContent).toContain('"diameter": 12');
  });

  it("clears the selection from the clear button", () => {
    const { store } = renderSidebar({
      entityId: "veh-12",
      kind: "scene-annotation",
      label: "car",
      metadata: {},
      scope: "instance",
      stream: "12",
    });

    fireEvent.click(screen.getByTestId("episode-inspector-clear"));
    expect(store.get(selectedObjectAtom)).toBeNull();
    expect(screen.getByTestId("episode-inspector-empty")).toBeTruthy();
  });
});
