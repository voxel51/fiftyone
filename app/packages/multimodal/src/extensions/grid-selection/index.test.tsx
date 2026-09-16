import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  gridActionDisabledReason,
  registerGridSelectionAction,
  registerGridSegmentProvider,
  useGridSelectionActions,
  useGridSegmentProviders,
  type GridSelectionAction,
  type GridSelectionActionContext,
} from "./index";

const context: GridSelectionActionContext = {
  datasetId: "dataset",
  mediaType: "video",
  source: "results",
  loading: false,
  error: null,
  boundary: {},
  unit: { one: "episode", many: "episodes", temporal: true },
  conversion: null,
  view: [],
  groups: [
    { episodeId: "one", members: [{ episodeId: "one", kind: "episode" }] },
  ],
  counts: {
    episodes: 1,
    fullEpisodes: 1,
    segments: 0,
    segmentEpisodes: 0,
    unavailable: 0,
  },
  resolve: async () => [{ episodeId: "one", kind: "episode" }],
};
const action: GridSelectionAction = {
  id: "test:action",
  order: 10,
  label: "Test",
  placement: "primary",
  scope: "explicit",
  supports: (media) => media === "video",
  memberKinds: ["episode"],
  Component: () => null,
};

describe("grid action and provider contributions", () => {
  it("handles no providers and registers/disposes primary and overflow actions reactively", () => {
    const { result } = renderHook(useGridSelectionActions);
    expect(result.current).toEqual([]);
    let dispose: () => void = () => undefined;
    let disposeMore: () => void = () => undefined;
    act(() => {
      dispose = registerGridSelectionAction(action);
      disposeMore = registerGridSelectionAction({
        ...action,
        id: "test:overflow",
        order: 5,
        placement: "more",
      });
    });
    expect(result.current.map((entry) => entry.placement)).toEqual([
      "more",
      "primary",
    ]);
    act(() => {
      dispose();
      disposeMore();
    });
    expect(result.current).toEqual([]);
  });

  it("requires each action to honor its complete declared scope", () => {
    expect(gridActionDisabledReason(action, context)).toBe(
      "Select episodes or segments first",
    );
    expect(
      gridActionDisabledReason(action, { ...context, source: "explicit" }),
    ).toBe(null);
    expect(
      gridActionDisabledReason(
        { ...action, scope: "explicit-or-results", memberKinds: ["segment"] },
        context,
      ),
    ).toContain("every selected member");
    expect(action.supports("multimodal")).toBe(false);
  });

  it("allows a media-specific source to supply all ranges and then disappear", () => {
    const { result } = renderHook(useGridSegmentProviders);
    expect(result.current).toEqual([]);
    let dispose: () => void = () => undefined;
    act(() => {
      dispose = registerGridSegmentProvider({
        id: "test:events",
        order: 0,
        label: "Events",
        supports: (type) => type === "multimodal",
        resolve: async () => [],
      });
    });
    expect(result.current[0].supports("multimodal")).toBe(true);
    act(dispose);
    expect(result.current).toEqual([]);
  });
});
