import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  execute: vi.fn(),
  onRun: vi.fn(),
}));

vi.mock("@fiftyone/operators", () => ({
  executeOperator: env.execute,
  useOperatorAvailability: () => true,
  useOperatorRegistryState: () => "loaded",
}));
vi.mock("@fiftyone/state", () => ({
  useSetViewChangePending: () => vi.fn(),
  useNotification: () => vi.fn(),
}));
vi.mock("@fiftyone/utilities", () => ({
  buildSimilarityRunName: () => "run name",
}));

import type { PromptableSimilarityIndex } from "@fiftyone/state";

import type { SerializedStage } from "./state";
import { useOperatorSearch } from "./useOperatorSearch";

const INDEX: PromptableSimilarityIndex = {
  key: "clip_sim",
  patchesField: null,
};

const operatorSearch = (
  view: readonly SerializedStage[],
  index: PromptableSimilarityIndex = INDEX,
) =>
  useOperatorSearch({
    currentView: view,
    onRun: env.onRun,
    promptKeys: [index],
    selectedIndex: index,
    sortStageOffered: true,
  });
const RESULT_VIEW: SerializedStage[] = [
  { _cls: "fiftyone.core.stages.SortBySimilarity", kwargs: [["k", 25]] },
];

const searchAndLand = (
  result: { current: ReturnType<typeof useOperatorSearch> },
  runId: string,
) => {
  act(() => result.current.run(INDEX, "an animal", 25, null));
  const [, , { callback }] = env.execute.mock.lastCall;
  act(() => callback({ result: { run_id: runId } }));
  return result.current.claimView(RESULT_VIEW);
};

describe("useOperatorSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("replaces a search typed over its unchanged result view", () => {
    const { result, rerender } = renderHook(
      ({ view }) => operatorSearch(view),
      { initialProps: { view: [] as SerializedStage[] } },
    );

    expect(searchAndLand(result, "run-1")).toBe(true);
    rerender({ view: RESULT_VIEW });
    act(() => result.current.run(INDEX, "a car", 25, null));

    expect(env.execute.mock.lastCall[1].replace_run_id).toBe("run-1");
    expect(env.onRun).toHaveBeenCalledTimes(2);
  });

  it("stops replacing a search once another change supersedes its result", () => {
    const { result, rerender } = renderHook(
      ({ view }) => operatorSearch(view),
      { initialProps: { view: [] as SerializedStage[] } },
    );

    searchAndLand(result, "run-1");
    const edited: SerializedStage[] = [
      ...RESULT_VIEW,
      { _cls: "fiftyone.core.stages.Limit", kwargs: [["limit", 5]] },
    ];
    expect(result.current.claimView(edited)).toBe(false);
    result.current.claimView(RESULT_VIEW);
    rerender({ view: RESULT_VIEW });
    act(() => result.current.run(INDEX, "a car", 25, null));

    expect(env.execute.mock.lastCall[1]).not.toHaveProperty("replace_run_id");
  });

  it("sends the slices only when the pick narrows the search", () => {
    const { result } = renderHook(() => operatorSearch([]));

    act(() => result.current.run(INDEX, "a car", 25, ["left"]));
    expect(env.execute.mock.lastCall[1].slices).toStrictEqual(["left"]);

    act(() => result.current.run(INDEX, "a car", 25, null));
    expect(env.execute.mock.lastCall[1]).not.toHaveProperty("slices");
  });

  it("offers the slices the selected index recorded as its sources", () => {
    const { result } = renderHook(() =>
      operatorSearch([], { ...INDEX, groupSlices: ["left", "right"] }),
    );

    expect(result.current.sources).toStrictEqual({
      label: "Slices",
      values: ["left", "right"],
    });
    expect(result.current.indexSlices).toStrictEqual(
      new Map([["clip_sim", ["left", "right"]]]),
    );
  });

  it("offers no sources for an index that recorded no slices", () => {
    const { result } = renderHook(() =>
      operatorSearch([], { ...INDEX, groupSlices: [] }),
    );

    expect(result.current.sources).toBeNull();
    expect(result.current.indexSlices).toStrictEqual(new Map());
  });
});
