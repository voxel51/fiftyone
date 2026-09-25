import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { EpisodeSelection } from "./types";

const mocks = vi.hoisted(() => ({
  view: [
    {
      _cls: "fiftyone.core.stages.GroupBy",
      kwargs: [["field_or_expr", "scene"]],
    },
  ] as readonly unknown[],
  combine: vi.fn(),
  count: vi.fn(),
  details: vi.fn(),
}));
vi.mock("../accessors/dataset", () => ({
  useCurrentDatasetId: () => "group-hooks",
  useDatasetMediaType: () => "image",
  useGridGroupSlice: () => null,
  useGridViewScope: () => ({
    view: mocks.view,
    filters: {},
    extendedStages: {},
    refresh: 0,
  }),
}));
vi.mock("./client", () => ({
  combineSelectionCaptures: mocks.combine,
  countSelectionCaptures: mocks.count,
  resolveSelectionDetails: mocks.details,
  getSelectionAvailability: vi.fn(async () => ({})),
  resolveSelection: vi.fn(async () => ({
    groups: [],
    counts: {
      episodes: 10,
      fullEpisodes: 10,
      segments: 0,
      segmentEpisodes: 0,
      unavailable: 0,
      groups: 2,
    },
  })),
  createSelectionSnapshot: vi.fn(),
}));
import { useGridSelection, useLoadGridSelection } from "./grid-hooks";
import {
  useInvalidateSelectionScope,
  useSelectionBucketCommands,
} from "./hooks";

const counts = {
  episodes: 3,
  fullEpisodes: 3,
  segments: 0,
  segmentEpisodes: 0,
  unavailable: 0,
  groups: 1,
};
const card: EpisodeSelection = {
  episodeId: "representative",
  members: [],
  group: { label: "scene", size: 3, snapshotId: "group-snapshot", counts },
};
const scope = { kind: "snapshot", snapshotId: "union", counts };
beforeEach(() => {
  sessionStorage.clear();
  mocks.combine.mockReset().mockResolvedValue(scope);
  mocks.count.mockReset().mockResolvedValue(counts);
  mocks.details.mockReset().mockResolvedValue({ groups: [card] });
});
afterEach(cleanup);

function mount() {
  const store = createStore();
  const wrapper = ({ children }: PropsWithChildren) => (
    <Provider store={store}>{children}</Provider>
  );
  return renderHook(
    () => {
      useLoadGridSelection();
      return {
        ...useGridSelection(),
        invalidate: useInvalidateSelectionScope("group-hooks"),
        commands: useSelectionBucketCommands("group-hooks"),
      };
    },
    { wrapper },
  );
}

it("captures group tokens and preserves their union when browsing changes", async () => {
  const { result, rerender } = mount();
  await act(async () => result.current.select([card.episodeId]));
  await waitFor(() => expect(result.current.selectedCounts).toEqual(counts));
  expect(mocks.details).toHaveBeenCalledWith(
    "group-hooks",
    expect.objectContaining({ capture: true, episodeIds: [card.episodeId] }),
  );
  expect(result.current.selected.get(card.episodeId)?.members).toEqual([]);
  expect(mocks.combine).not.toHaveBeenCalled();
  expect(await result.current.resolveCaptured()).toEqual(scope);
  expect(mocks.combine).toHaveBeenCalledTimes(1);
  mocks.view = [
    ...mocks.view,
    { _cls: "fiftyone.core.stages.Limit", kwargs: [["limit", 1]] },
  ];
  rerender();
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(mocks.combine).toHaveBeenCalledTimes(1);
  expect(await result.current.resolveCaptured()).toEqual(scope);
});

it("uses server union counts when a sample overlaps a group capture", async () => {
  const { result } = mount();
  await act(async () => result.current.select([card.episodeId]));
  await waitFor(() => expect(result.current.selectedCounts).toEqual(counts));
  act(() =>
    result.current.capture({
      episodeId: "member",
      members: [{ episodeId: "member", kind: "episode" }],
    }),
  );
  await waitFor(() => expect(mocks.count).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(result.current.selectedCounts?.fullEpisodes).toBe(3),
  );
  expect(mocks.combine).not.toHaveBeenCalled();
  expect(mocks.count).toHaveBeenLastCalledWith(
    "group-hooks",
    expect.objectContaining({
      snapshotIds: ["group-snapshot"],
      members: [{ episodeId: "member", kind: "episode" }],
    }),
    expect.any(AbortSignal),
  );
});

it("retries failed union resolution and keeps successful captures cached", async () => {
  mocks.count.mockRejectedValueOnce(new Error("capture unavailable"));
  const { result } = mount();
  await act(async () => result.current.select([card.episodeId]));
  await waitFor(() =>
    expect(result.current.capturedError).toContain("capture unavailable"),
  );
  expect(result.current.selectedCounts).toBeNull();
  act(() => result.current.invalidate());
  await waitFor(() => expect(result.current.selectedCounts).toEqual(counts));
  expect(result.current.capturedError).toBeNull();
  act(() => result.current.invalidate());
  expect(mocks.count).toHaveBeenCalledTimes(2);
});

it("removal clears only the original snapshot, preserving a recaptured group", async () => {
  const { result } = mount();
  await act(async () => result.current.select([card.episodeId]));
  await waitFor(() => expect(result.current.selectedCounts).toEqual(counts));
  act(() =>
    result.current.capture({
      ...card,
      group: { ...card.group!, snapshotId: "later" },
    }),
  );
  act(() =>
    result.current.commands.removeSnapshotsEverywhere(["group-snapshot"]),
  );
  expect(result.current.selected.get(card.episodeId)?.group?.snapshotId).toBe(
    "later",
  );
  act(() => result.current.commands.removeSnapshotsEverywhere(["later"]));
  expect(result.current.selected.size).toBe(0);
});
