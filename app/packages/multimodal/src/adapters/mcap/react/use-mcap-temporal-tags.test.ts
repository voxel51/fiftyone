import type { SampleRendererProps } from "@fiftyone/plugins";
import type { TemporalTagCreatePayload } from "@fiftyone/playback";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Tag, UseSampleTagsResult } from "../../../temporal-tags/types";
import { useMcapTemporalTags } from "./use-mcap-temporal-tags";

// ---------------------------------------------------------------------------
// Module mock — controls what useSampleRendererTags returns per test.
// ---------------------------------------------------------------------------

// The hook result type is intentionally readonly; tests swap out `tags`
// between cases, so the mock uses a mutable view of it.
type MutableTemporalTagsResult = {
  -readonly [K in keyof UseSampleTagsResult]: UseSampleTagsResult[K];
};

const mockResult = vi.hoisted(
  (): MutableTemporalTagsResult => ({
    status: "ready",
    error: null,
    tags: [],
    create: vi.fn(async () => []),
    delete: vi.fn(async () => 0),
    update: vi.fn(async () => makeTag({ id: "updated" })),
    clear: vi.fn(async () => 0),
    reload: vi.fn(async () => []),
  })
);

vi.mock("../../../temporal-tags", () => ({
  useSampleRendererTags: vi.fn(() => mockResult),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    id: "tag-id-1",
    sampleId: "sample-id",
    tag: "road-clear",
    start: 1_000_000_000,
    end: 3_000_000_000,
    indexType: 2,
    ...overrides,
  };
}

const ctx = {
  dataset: { datasetId: "dataset-id" },
  sample: { sample: { _id: "sample-id" } },
} as SampleRendererProps["ctx"];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
  vi.clearAllMocks();
  mockResult.tags = [];
});

describe("useMcapTemporalTags", () => {
  describe("tracks", () => {
    it("returns an empty array when there are no temporal tags", () => {
      const { result } = renderHook(() => useMcapTemporalTags(ctx));
      expect(result.current.tracks).toEqual([]);
    });

    it("creates one track per unique tag label", () => {
      mockResult.tags = [
        makeTag({ id: "a", tag: "lane-change" }),
        makeTag({ id: "b", tag: "pedestrian" }),
        makeTag({ id: "c", tag: "lane-change" }),
      ];
      const { result } = renderHook(() => useMcapTemporalTags(ctx));
      expect(result.current.tracks).toHaveLength(2);
      const labels = result.current.tracks.map((t) => t.label);
      expect(labels).toContain("lane-change");
      expect(labels).toContain("pedestrian");
    });

    it("groups all events for the same label under one track", () => {
      mockResult.tags = [
        makeTag({ id: "a", tag: "road-clear" }),
        makeTag({ id: "b", tag: "road-clear" }),
        makeTag({ id: "c", tag: "road-clear" }),
      ];
      const { result } = renderHook(() => useMcapTemporalTags(ctx));
      expect(result.current.tracks).toHaveLength(1);
      expect(result.current.tracks[0].events).toHaveLength(3);
    });

    it("converts nanosecond timestamps to seconds", () => {
      mockResult.tags = [makeTag({ start: 2_500_000_000, end: 7_000_000_000 })];
      const { result } = renderHook(() => useMcapTemporalTags(ctx));
      const [event] = result.current.tracks[0].events;
      expect(event.startSec).toBeCloseTo(2.5);
      expect(event.endSec).toBeCloseTo(7.0);
    });

    it("stores the tag backend id as event.data", () => {
      mockResult.tags = [makeTag({ id: "backend-id-42" })];
      const { result } = renderHook(() => useMcapTemporalTags(ctx));
      expect(result.current.tracks[0].events[0].data).toBe("backend-id-42");
    });

    it("uses the tag label as the track id prefix", () => {
      mockResult.tags = [makeTag({ tag: "my-label" })];
      const { result } = renderHook(() => useMcapTemporalTags(ctx));
      expect(result.current.tracks[0].id).toBe("temporal-tag::my-label");
    });

    it("assigns a deterministic color based on the label", () => {
      mockResult.tags = [makeTag({ tag: "stable-label" })];
      const { result: r1 } = renderHook(() => useMcapTemporalTags(ctx));
      const { result: r2 } = renderHook(() => useMcapTemporalTags(ctx));
      expect(r1.current.tracks[0].color).toBe(r2.current.tracks[0].color);
      expect(r1.current.tracks[0].color).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it("sorts tracks newest-first by createdAt", () => {
      mockResult.tags = [
        makeTag({ id: "old", tag: "alpha", createdAt: "2024-01-01T00:00:00Z" }),
        makeTag({ id: "new", tag: "beta", createdAt: "2024-06-01T00:00:00Z" }),
      ];
      const { result } = renderHook(() => useMcapTemporalTags(ctx));
      expect(result.current.tracks[0].label).toBe("beta");
      expect(result.current.tracks[1].label).toBe("alpha");
    });

    it("places tracks without createdAt before those with older timestamps", () => {
      mockResult.tags = [
        makeTag({
          id: "dated",
          tag: "alpha",
          createdAt: "2024-01-01T00:00:00Z",
        }),
        makeTag({ id: "undated", tag: "beta" }),
      ];
      const { result } = renderHook(() => useMcapTemporalTags(ctx));
      // undated sorts as 0 (epoch), which is less than the dated entry
      expect(result.current.tracks[0].label).toBe("alpha");
      expect(result.current.tracks[1].label).toBe("beta");
    });
  });

  describe("onTagCreate", () => {
    it("converts seconds to nanoseconds before calling create", async () => {
      const { result } = renderHook(() => useMcapTemporalTags(ctx));
      const payload: TemporalTagCreatePayload = {
        start: 1.5,
        end: 4.25,
        tag: "my-tag",
      };
      await act(async () => {
        await result.current.onTagCreate(payload);
      });
      expect(mockResult.create).toHaveBeenCalledWith([
        expect.objectContaining({
          start: 1_500_000_000,
          end: 4_250_000_000,
          tag: "my-tag",
        }),
      ]);
    });

    it("rounds nanosecond values to integers", async () => {
      const { result } = renderHook(() => useMcapTemporalTags(ctx));
      await act(async () => {
        await result.current.onTagCreate({
          start: 1.0001,
          end: 2.9999,
          tag: "t",
        });
      });
      const [created] = (mockResult.create as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(Number.isInteger(created.start)).toBe(true);
      expect(Number.isInteger(created.end)).toBe(true);
    });

    it("passes the anchor field through when provided", async () => {
      const { result } = renderHook(() => useMcapTemporalTags(ctx));
      await act(async () => {
        await result.current.onTagCreate({
          start: 1,
          end: 2,
          tag: "t",
          anchor: "camera_front",
        });
      });
      expect(mockResult.create).toHaveBeenCalledWith([
        expect.objectContaining({ anchor: "camera_front" }),
      ]);
    });
  });

  describe("onTagDelete", () => {
    it("calls deleteTags with the event data id", async () => {
      const { result } = renderHook(() => useMcapTemporalTags(ctx));
      await act(async () => {
        await result.current.onTagDelete({ data: "backend-id-99" });
      });
      expect(mockResult.delete).toHaveBeenCalledWith(["backend-id-99"]);
    });

    it("does nothing when event.data is not a string", async () => {
      const { result } = renderHook(() => useMcapTemporalTags(ctx));
      await act(async () => {
        await result.current.onTagDelete({ data: undefined });
        await result.current.onTagDelete({ data: 42 });
      });
      expect(mockResult.delete).not.toHaveBeenCalled();
    });
  });
});
