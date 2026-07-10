import type { SampleRendererProps } from "@fiftyone/plugins";
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ProjectionEvent,
  UseEpisodeProjectionEventsResult,
} from "../../../projection-events";
import { useMcapProjectionEvents } from "./use-mcap-projection-events";

// ---------------------------------------------------------------------------
// Module mock — controls what useSampleRendererProjectionEvents returns.
// ---------------------------------------------------------------------------

type MutableResult = {
  -readonly [K in keyof UseEpisodeProjectionEventsResult]: UseEpisodeProjectionEventsResult[K];
};

const mockResult = vi.hoisted(
  (): MutableResult => ({
    status: "ready",
    error: null,
    events: [],
    reload: vi.fn(async () => []),
  }),
);

vi.mock("../../../projection-events", () => ({
  useSampleRendererProjectionEvents: vi.fn(() => mockResult),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<ProjectionEvent> = {}): ProjectionEvent {
  return {
    id: "pedestrian_fast",
    name: "Fast pedestrian encounter",
    startTimestampNs: 1_000_000_000n,
    endTimestampNs: 2_000_000_000n,
    episodeId: "episode-id",
    ...overrides,
  };
}

const ctx = {
  dataset: { datasetId: "dataset-id" },
  sample: { sample: { _id: "sample-id" } },
} as SampleRendererProps["ctx"];

afterEach(() => {
  vi.clearAllMocks();
  mockResult.events = [];
});

describe("useMcapProjectionEvents", () => {
  it("returns an empty array when there are no events", () => {
    const { result } = renderHook(() => useMcapProjectionEvents(ctx));
    expect(result.current).toEqual([]);
  });

  it("creates one track per unique event id", () => {
    mockResult.events = [
      makeEvent({ id: "pedestrian_fast", name: "Fast pedestrian encounter" }),
      makeEvent({ id: "high_steering", name: "High steering" }),
      makeEvent({ id: "pedestrian_fast", name: "Fast pedestrian encounter" }),
    ];
    const { result } = renderHook(() => useMcapProjectionEvents(ctx));
    expect(result.current).toHaveLength(2);
    expect(result.current.map((t) => t.id)).toEqual([
      "projection-event::pedestrian_fast",
      "projection-event::high_steering",
    ]);
  });

  it("groups all occurrences for the same id under one track", () => {
    mockResult.events = [
      makeEvent({ startTimestampNs: 1n, endTimestampNs: 2n }),
      makeEvent({ startTimestampNs: 3n, endTimestampNs: 4n }),
      makeEvent({ startTimestampNs: 5n, endTimestampNs: 6n }),
    ];
    const { result } = renderHook(() => useMcapProjectionEvents(ctx));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].events).toHaveLength(3);
  });

  it("uses the event name as the track label", () => {
    mockResult.events = [
      makeEvent({ id: "high_steering", name: "High steering" }),
    ];
    const { result } = renderHook(() => useMcapProjectionEvents(ctx));
    expect(result.current[0].label).toBe("High steering");
  });

  it("falls back to the id when name is empty", () => {
    mockResult.events = [makeEvent({ id: "high_steering", name: "" })];
    const { result } = renderHook(() => useMcapProjectionEvents(ctx));
    expect(result.current[0].label).toBe("high_steering");
  });

  it("converts nanosecond timestamps to seconds (origin 0)", () => {
    mockResult.events = [
      makeEvent({
        startTimestampNs: 2_500_000_000n,
        endTimestampNs: 7_000_000_000n,
      }),
    ];
    const { result } = renderHook(() => useMcapProjectionEvents(ctx));
    const [event] = result.current[0].events;
    expect(event.startSec).toBeCloseTo(2.5);
    expect(event.endSec).toBeCloseTo(7.0);
  });

  it("rebases absolute ns against originNs", () => {
    const originNs = 1_531_281_439_000_000_000n;
    mockResult.events = [
      makeEvent({
        startTimestampNs: originNs + 2_500_000_000n,
        endTimestampNs: originNs + 7_000_000_000n,
      }),
    ];
    const { result } = renderHook(() => useMcapProjectionEvents(ctx, originNs));
    const [event] = result.current[0].events;
    expect(event.startSec).toBeCloseTo(2.5);
    expect(event.endSec).toBeCloseTo(7.0);
  });

  it("keeps sub-second precision when the delta exceeds 2^53", () => {
    // A delta of ~1.5e18 ns overflows Number; the whole/remainder split
    // must still land the fractional part correctly.
    const originNs = 1_000_000_000_000_000_000n;
    mockResult.events = [
      makeEvent({
        startTimestampNs: originNs + 1_500_000_000_000_000_000n + 250_000_000n,
        endTimestampNs: originNs + 1_500_000_000_000_000_000n + 750_000_000n,
      }),
    ];
    const { result } = renderHook(() => useMcapProjectionEvents(ctx, originNs));
    const [event] = result.current[0].events;
    expect(event.startSec - 1_500_000_000).toBeCloseTo(0.25, 3);
    expect((event.endSec ?? 0) - 1_500_000_000).toBeCloseTo(0.75, 3);
  });

  it("namespaces the track id and assigns a deterministic hex color", () => {
    mockResult.events = [makeEvent({ id: "stable-id" })];
    const { result: r1 } = renderHook(() => useMcapProjectionEvents(ctx));
    const { result: r2 } = renderHook(() => useMcapProjectionEvents(ctx));
    expect(r1.current[0].id).toBe("projection-event::stable-id");
    expect(r1.current[0].color).toBe(r2.current[0].color);
    expect(r1.current[0].color).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
