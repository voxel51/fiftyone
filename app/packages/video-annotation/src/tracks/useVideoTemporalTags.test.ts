import { temporalTagTrackId } from "@fiftyone/playback";
import type { TemporalTag, UseSampleTemporalTagsResult } from "@fiftyone/state";
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useVideoTemporalTags } from "./useVideoTemporalTags";

// The hook result type is readonly; the tests swap `temporalTags` per case.
type MutableTemporalTagsResult = {
  -readonly [K in keyof UseSampleTemporalTagsResult]: UseSampleTemporalTagsResult[K];
};

const mockResult = vi.hoisted(
  (): MutableTemporalTagsResult => ({
    status: "ready",
    error: null,
    temporalTags: [],
    create: vi.fn(async () => []),
    delete: vi.fn(async () => 0),
    update: vi.fn(async () => makeTag()),
    clear: vi.fn(async () => 0),
    reload: vi.fn(async () => []),
  }),
);
const filterValues = vi.hoisted(() => ({ current: [] as string[] }));
const requestedScope = vi.hoisted(
  () => ({ current: undefined }) as { current?: Record<string, unknown> },
);

vi.mock("@fiftyone/state", () => ({
  useActiveTemporalTagFilterValues: () => filterValues.current,
  useSampleTemporalTags: (options: Record<string, unknown>) => {
    requestedScope.current = options;
    return mockResult;
  },
  useSyncTemporalTagResults: () => undefined,
  useTemporalTagColor: () => () => "#123456",
  useTemporalTagValues: () => ["review"],
}));

vi.mock("../state/accessors", () => ({
  useDatasetId: () => "dataset-id",
}));

function makeTag(overrides: Partial<TemporalTag> = {}): TemporalTag {
  return {
    id: "tag-id-1",
    sampleId: "sample-id",
    tag: "review",
    start: 1_000_000_000,
    end: 3_000_000_000,
    indexType: 2,
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  mockResult.temporalTags = [];
  filterValues.current = [];
  requestedScope.current = undefined;
});

describe("useVideoTemporalTags", () => {
  it("scopes the tags to the sample on screen, not the one the grid opened", () => {
    // On a grouped dataset these differ: the modal can be switched to the
    // video slice while the grid stays on another.
    renderHook(() => useVideoTemporalTags("video-slice-sample"));

    expect(requestedScope.current).toEqual({
      datasetId: "dataset-id",
      sampleId: "video-slice-sample",
    });
  });

  it("stays unscoped until a sample is on screen", () => {
    renderHook(() => useVideoTemporalTags(undefined));

    expect(requestedScope.current).toEqual({
      datasetId: "dataset-id",
      sampleId: undefined,
    });
  });

  it("writes a created tag in the nanoseconds the routes store", async () => {
    const { result } = renderHook(() => useVideoTemporalTags("sample-id"));

    await result.current.onTagCreate({ start: 1.5, end: 2.25, tag: "review" });

    expect(mockResult.create).toHaveBeenCalledWith([
      { start: 1_500_000_000, end: 2_250_000_000, tag: "review" },
    ]);
  });

  it("writes an edited tag in the same units", async () => {
    const { result } = renderHook(() => useVideoTemporalTags("sample-id"));

    await result.current.onTagUpdate({
      id: "tag-id-1",
      start: 4,
      end: 5.5,
      tag: "blurry",
    });

    expect(mockResult.update).toHaveBeenCalledWith("tag-id-1", {
      start: 4_000_000_000,
      end: 5_500_000_000,
      tag: "blurry",
    });
  });

  it("deletes the tag the right-clicked event carries", async () => {
    const { result } = renderHook(() => useVideoTemporalTags("sample-id"));
    const [deleteItem] = result.current.tagEventMenuItems;

    await deleteItem.onSelect(
      { startSec: 1, endSec: 2, data: "tag-id-1" },
      undefined,
    );

    expect(mockResult.delete).toHaveBeenCalledWith(["tag-id-1"]);
  });

  it("pins a row for each value the grid is filtering for", () => {
    filterValues.current = ["review", "blurry"];

    const { result } = renderHook(() => useVideoTemporalTags("sample-id"));

    expect(result.current.pinnedTrackIds).toEqual([
      temporalTagTrackId("review"),
      temporalTagTrackId("blurry"),
    ]);
  });

  it("rows the sample's tags by value", () => {
    mockResult.temporalTags = [
      makeTag({ id: "a", tag: "review" }),
      makeTag({ id: "b", tag: "blurry" }),
      makeTag({ id: "c", tag: "review" }),
    ];

    const { result } = renderHook(() => useVideoTemporalTags("sample-id"));

    expect(result.current.tracks).toHaveLength(2);
    expect(
      result.current.tracks.find((t) => t.label === "review")?.events,
    ).toHaveLength(2);
  });
});
