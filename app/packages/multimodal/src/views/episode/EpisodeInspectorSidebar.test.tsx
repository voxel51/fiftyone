import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import { afterEach, describe, expect, it } from "vitest";
import {
  episodeSelectedObjectAtom,
  type EpisodeSelectedObject,
} from "./episode-selected-object";
import EpisodeInspectorSidebar from "./EpisodeInspectorSidebar";

function renderSidebar(selected: EpisodeSelectedObject | null) {
  const store = createStore();
  store.set(episodeSelectedObjectAtom, selected);
  const view = render(
    <JotaiProvider store={store}>
      <EpisodeInspectorSidebar />
    </JotaiProvider>,
  );
  return { store, view };
}

describe("EpisodeInspectorSidebar", () => {
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
      stream: "/markers/annotations",
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
      stream: "/cam_front/annotations",
    });

    const body = screen.getByTestId("episode-inspector-body");
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
      stream: "/markers",
    });

    fireEvent.click(screen.getByTestId("episode-inspector-clear"));
    expect(store.get(episodeSelectedObjectAtom)).toBeNull();
    expect(screen.getByTestId("episode-inspector-empty")).toBeTruthy();
  });
});
