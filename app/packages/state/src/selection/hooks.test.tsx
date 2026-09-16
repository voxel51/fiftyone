import { act, renderHook } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import type { PropsWithChildren } from "react";
import { describe, expect, it } from "vitest";
import {
  useEpisodeSelection,
  useEpisodeSelectionActions,
  useSelectionBoundary,
} from "./hooks";

describe("dataset-isolated captures", () => {
  it("retains captures across providers and subset changes without leaking datasets", () => {
    const store = createStore();
    const wrapper = ({ children }: PropsWithChildren) => (
      <Provider store={store}>{children}</Provider>
    );
    const { result, rerender } = renderHook(
      ({ dataset }) => ({
        selected: useEpisodeSelection(dataset),
        actions: useEpisodeSelectionActions(dataset),
        boundary: useSelectionBoundary(dataset),
      }),
      { initialProps: { dataset: "a" }, wrapper },
    );
    act(() =>
      result.current.actions.capture({
        episodeId: "one",
        members: [{ episodeId: "one", kind: "episode" }],
      }),
    );
    act(() =>
      result.current.boundary[1]({
        subsetId: "different",
        provider: { kind: "temporal-tags", values: ["review"] },
      }),
    );
    expect(result.current.selected.size).toBe(1);
    rerender({ dataset: "b" });
    expect(result.current.selected.size).toBe(0);
    rerender({ dataset: "a" });
    expect(result.current.selected.size).toBe(1);
    act(() => result.current.actions.clear());
    expect(result.current.selected.size).toBe(0);
    expect(result.current.boundary[0].subsetId).toBe("different");
  });
});

describe("session persistence", () => {
  it("restores captures for a dataset from session storage and clears them on empty", () => {
    const group = {
      episodeId: "persisted",
      members: [{ episodeId: "persisted", kind: "episode" as const }],
    };
    sessionStorage.setItem(
      "fiftyone:grid-selection:seeded",
      JSON.stringify([group, { junk: true }]),
    );
    const store = createStore();
    const wrapper = ({ children }: PropsWithChildren) => (
      <Provider store={store}>{children}</Provider>
    );
    const { result } = renderHook(
      () => ({
        selected: useEpisodeSelection("seeded"),
        actions: useEpisodeSelectionActions("seeded"),
      }),
      { wrapper },
    );
    expect([...result.current.selected.keys()]).toEqual(["persisted"]);
    act(() =>
      result.current.actions.capture({
        episodeId: "second",
        members: [{ episodeId: "second", kind: "episode" }],
      }),
    );
    expect(
      JSON.parse(
        sessionStorage.getItem("fiftyone:grid-selection:seeded") ?? "[]",
      )
        .map((entry: { episodeId: string }) => entry.episodeId)
        .sort(),
    ).toEqual(["persisted", "second"]);
    act(() => result.current.actions.clear());
    expect(sessionStorage.getItem("fiftyone:grid-selection:seeded")).toBeNull();
  });
});
