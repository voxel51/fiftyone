import { cleanup, fireEvent, render } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import { afterEach, describe, expect, it } from "vitest";
import {
  isEpisodeLabelEcho,
  isEpisodeSceneEntitySelected,
  episodeEntityLabel,
  episodeSelectedObjectAtom,
  EpisodeSelectionHotkeys,
  type EpisodeSelectedObject,
} from "./selected-object";

const SCENE_SELECTION: EpisodeSelectedObject = {
  entityId: "veh-12",
  kind: "scene-annotation",
  label: "car",
  metadata: {},
  scope: "label",
  stream: "/markers",
};

describe("episodeEntityLabel", () => {
  it("prefers common label metadata keys in order", () => {
    expect(
      episodeEntityLabel({ id: "e1", metadata: { category: "truck" } }),
    ).toBe("truck");
    expect(
      episodeEntityLabel({
        id: "e1",
        metadata: { category: "truck", label: "car" },
      }),
    ).toBe("car");
  });

  it("falls back to the entity id, then null", () => {
    expect(episodeEntityLabel({ id: "veh-12", metadata: {} })).toBe("veh-12");
    expect(episodeEntityLabel({ id: "", metadata: {} })).toBeNull();
  });
});

describe("selection predicates", () => {
  it("matches only the exact scene entity", () => {
    expect(
      isEpisodeSceneEntitySelected(SCENE_SELECTION, "/markers", "veh-12"),
    ).toBe(true);
    expect(
      isEpisodeSceneEntitySelected(SCENE_SELECTION, "/markers", "veh-13"),
    ).toBe(false);
    expect(
      isEpisodeSceneEntitySelected(SCENE_SELECTION, "/other", "veh-12"),
    ).toBe(false);
    expect(isEpisodeSceneEntitySelected(null, "/markers", "veh-12")).toBe(
      false,
    );
  });

  it("echoes by label only when both sides have one", () => {
    expect(isEpisodeLabelEcho(SCENE_SELECTION, "car")).toBe(true);
    // Plain (instance-scoped) clicks never echo — one object only;
    // label-wide highlighting is reserved for shift-click.
    expect(
      isEpisodeLabelEcho({ ...SCENE_SELECTION, scope: "instance" }, "car"),
    ).toBe(false);
    expect(isEpisodeLabelEcho(SCENE_SELECTION, "truck")).toBe(false);
    expect(isEpisodeLabelEcho(SCENE_SELECTION, null)).toBe(false);
    expect(isEpisodeLabelEcho(null, "car")).toBe(false);
    expect(isEpisodeLabelEcho({ ...SCENE_SELECTION, label: null }, "car")).toBe(
      false,
    );
  });
});

describe("EpisodeSelectionHotkeys", () => {
  afterEach(() => cleanup());

  it("clears the selection on Escape and consumes the event", () => {
    const store = createStore();
    store.set(episodeSelectedObjectAtom, SCENE_SELECTION);
    render(
      <JotaiProvider store={store}>
        <EpisodeSelectionHotkeys />
      </JotaiProvider>,
    );

    const consumed = !fireEvent.keyDown(window, { key: "Escape" });
    expect(store.get(episodeSelectedObjectAtom)).toBeNull();
    // preventDefault fired → the modal's own Escape handling stays put.
    expect(consumed).toBe(true);
  });

  it("lets Escape pass through when nothing is selected", () => {
    const store = createStore();
    render(
      <JotaiProvider store={store}>
        <EpisodeSelectionHotkeys />
      </JotaiProvider>,
    );

    const consumed = !fireEvent.keyDown(window, { key: "Escape" });
    expect(consumed).toBe(false);
  });
});
