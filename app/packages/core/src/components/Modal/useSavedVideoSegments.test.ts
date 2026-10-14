import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SelectionMember } from "@fiftyone/state/src/selection/types";
import { useSavedVideoSegments } from "./useSavedVideoSegments";

const scope = vi.hoisted(() => ({
  active: true,
  scopeId: "subset-a",
  loading: true,
  error: null,
  members: [] as SelectionMember[],
}));
vi.mock("@fiftyone/state/src/selection", async () => ({
  ...(await import("@fiftyone/state/src/selection/segment-time")),
  useScopedSegments: () => scope,
}));
afterEach(cleanup);
beforeEach(() =>
  Object.assign(scope, {
    active: true,
    scopeId: "subset-a",
    loading: true,
    error: null,
    members: [],
  }),
);
const segment = (start: number): SelectionMember => ({
  episodeId: "a",
  kind: "segment",
  range: {
    start: String(start),
    end: String(start + 30),
    timebase: "sequence",
    streams: [],
    provenance: [],
  },
});

describe("saved video segments", () => {
  it("groups by captured source, pins those rows and opens at the earliest across sources", () => {
    scope.loading = false;
    scope.members = [
      {
        ...segment(90),
        kind: "segment",
        range: {
          start: "90",
          end: "120",
          timebase: "sequence",
          streams: ["filepath"],
          provenance: [
            { provider: "events", source: "events", label: "braking" },
          ],
        },
      },
      {
        ...segment(30),
        kind: "segment",
        range: {
          start: "30",
          end: "60",
          timebase: "sequence",
          streams: ["filepath"],
          provenance: [{ provider: "temporal-tags", source: "near miss" }],
        },
      },
    ];
    const { result } = renderHook(() => useSavedVideoSegments("a", 30));
    expect(result.current.tracks.map((track) => track.label)).toEqual([
      "Event: braking",
      "Temporal tag: near miss",
    ]);
    expect(result.current.initialPinnedIds).toEqual(
      result.current.tracks.map((track) => track.id),
    );
    expect(result.current.initialTime).toBe(1);
  });
  it("opens at zero when frame metadata is missing and does not later move the viewer", () => {
    scope.loading = false;
    scope.members = [segment(30)];
    const { result, rerender } = renderHook(
      ({ fps }) => useSavedVideoSegments("a", fps),
      { initialProps: { fps: undefined as number | undefined } },
    );
    expect(result.current.initialTime).toBe(0);
    expect(result.current.tracks).toEqual([]);
    rerender({ fps: 30 });
    expect(result.current.initialTime).toBe(0);
    expect(result.current.tracks[0].events[0].startSec).toBe(1);
  });
  it("opens at the earliest saved frame but does not reseek when filters change", () => {
    const { result, rerender } = renderHook(
      ({ id }) => useSavedVideoSegments(id, 30),
      { initialProps: { id: "a" } },
    );
    expect(result.current.initialTime).toBeNull();
    scope.loading = false;
    scope.members = [segment(90), segment(30)];
    rerender({ id: "a" });
    expect(result.current.initialTime).toBe(1);
    expect(
      result.current.tracks[0].events.map((event) => event.startSec),
    ).toEqual([1, 3]);
    scope.members = [segment(90)];
    rerender({ id: "a" });
    expect(result.current.initialTime).toBe(1);
    expect(result.current.tracks[0].events).toHaveLength(1);
    rerender({ id: "b" });
    expect(result.current.initialTime).toBe(3);
    scope.scopeId = "subset-b";
    scope.members = [segment(30)];
    rerender({ id: "b" });
    expect(result.current.initialTime).toBe(1);
  });
});
