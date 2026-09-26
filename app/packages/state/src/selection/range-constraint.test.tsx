import { Provider, createStore } from "jotai";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { combineSelectionCaptures } from "./client";
import {
  selectionRangeConstraintBridge as bridge,
  useSelectionRangeConstraint,
} from "./range-constraint";
import type { SelectionMember } from "./types";

vi.mock("./client", () => ({ combineSelectionCaptures: vi.fn() }));
afterEach(() => {
  cleanup();
  bridge.reset();
  vi.resetAllMocks();
});
const members: SelectionMember[] = [
  {
    episodeId: "episode",
    kind: "segment",
    range: {
      start: "1",
      end: "2",
      timebase: "timestamp-ns",
      streams: ["camera"],
      provenance: [],
    },
  },
];
const capture = {
  datasetId: "dataset",
  datasetName: "recordings",
  label: "Embeddings: motion",
  members,
};
const snapshot = (id: string) => ({
  kind: "snapshot" as const,
  snapshotId: id,
  counts: {
    episodes: 1,
    fullEpisodes: 0,
    segments: 1,
    segmentEpisodes: 1,
    unavailable: 0,
  },
});

describe("frozen range constraint", () => {
  it("receives bridge updates inside a scoped provider", () => {
    const store = createStore();
    const { result } = renderHook(
      () => useSelectionRangeConstraint("recordings"),
      {
        wrapper: ({ children }) => (
          <Provider store={store}>{children}</Provider>
        ),
      },
    );
    act(() => bridge.capture({ ...capture, error: "Unavailable source" }));
    expect(result.current?.error).toBe("Unavailable source");
    act(() => bridge.reset());
    expect(result.current).toBeUndefined();
  });

  it("uploads bounded batches then publishes only the union reference", async () => {
    vi.mocked(combineSelectionCaptures)
      .mockResolvedValueOnce(snapshot("a"))
      .mockResolvedValueOnce(snapshot("b"))
      .mockResolvedValueOnce(snapshot("union"));
    const { result } = renderHook(() =>
      useSelectionRangeConstraint("recordings"),
    );
    act(() =>
      bridge.capture({
        ...capture,
        members: Array.from({ length: 1001 }, () => members[0]),
      }),
    );
    expect(result.current?.pending).toBe(true);
    await waitFor(() =>
      expect(result.current?.provider).toEqual({
        kind: "snapshot",
        snapshotId: "union",
        label: capture.label,
      }),
    );
    const calls = vi.mocked(combineSelectionCaptures).mock.calls;
    expect(calls.map((call) => call[1].members.length)).toEqual([1000, 1, 0]);
    expect(calls[2][1].snapshotIds).toEqual(["a", "b"]);
    expect(calls.every((call) => call[1].transient)).toBe(true);
  });

  it("can recapture a successfully uploaded snapshot after it expires", async () => {
    vi.mocked(combineSelectionCaptures)
      .mockResolvedValueOnce(snapshot("expired"))
      .mockResolvedValueOnce(snapshot("fresh"));
    const { result } = renderHook(() =>
      useSelectionRangeConstraint("recordings"),
    );
    act(() => bridge.capture(capture));
    await waitFor(() =>
      expect(result.current?.provider).toMatchObject({ snapshotId: "expired" }),
    );
    act(() => result.current?.retry?.());
    expect(result.current?.pending).toBe(true);
    await waitFor(() =>
      expect(result.current?.provider).toMatchObject({ snapshotId: "fresh" }),
    );
    expect(combineSelectionCaptures).toHaveBeenCalledTimes(2);
  });

  it("ignores a late capture after reset or replacement", async () => {
    let finish: (value: ReturnType<typeof snapshot>) => void;
    vi.mocked(combineSelectionCaptures).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = renderHook(() =>
      useSelectionRangeConstraint("recordings"),
    );
    act(() => bridge.capture(capture));
    const signal = vi.mocked(combineSelectionCaptures).mock.calls[0][2];
    act(() => bridge.reset());
    expect(signal?.aborted).toBe(true);
    act(() =>
      bridge.capture({ ...capture, members: [], error: "Missing windows" }),
    );
    await act(async () => finish(snapshot("stale")));
    expect(result.current).toMatchObject({
      error: "Missing windows",
      provider: { kind: "ranges", members: [] },
    });
  });

  it("keeps upload failures empty and actionable", async () => {
    vi.mocked(combineSelectionCaptures).mockRejectedValue(
      new Error("Capture failed"),
    );
    const { result } = renderHook(() =>
      useSelectionRangeConstraint("recordings"),
    );
    act(() => bridge.capture(capture));
    await waitFor(() =>
      expect(result.current).toMatchObject({
        error: "Capture failed",
        provider: { kind: "ranges", members: [] },
      }),
    );
    expect(result.current?.pending).not.toBe(true);
    vi.mocked(combineSelectionCaptures).mockResolvedValue(snapshot("retried"));
    act(() => result.current?.retry?.());
    await waitFor(() =>
      expect(result.current?.provider).toMatchObject({
        kind: "snapshot",
        snapshotId: "retried",
      }),
    );
  });
});
