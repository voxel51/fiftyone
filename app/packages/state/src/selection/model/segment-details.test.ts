import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveSelectionDetails,
  type SelectionRequest,
  type SelectionResult,
} from "../client";
import { createSegmentDetailsLoader } from "./segment-details";

vi.mock("../client", () => ({ resolveSelectionDetails: vi.fn() }));
const request: SelectionRequest = {
  view: [],
  filters: {},
  extendedStages: {},
  boundary: { subsetId: "subset", subsetScope: "segments" },
};
const result = (id: string): Pick<SelectionResult, "groups"> => ({
  groups: [
    {
      episodeId: id,
      members: [
        {
          episodeId: id,
          kind: "segment",
          range: {
            start: "10",
            end: "20",
            timebase: "duration-ns",
            streams: [],
            provenance: [],
          },
        },
      ],
    },
  ],
});
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("visible segment details", () => {
  it("batches tiles, shares grid/modal reads, and retains only mounted samples", async () => {
    vi.useFakeTimers();
    vi.mocked(resolveSelectionDetails).mockResolvedValue(result("a"));
    const loader = createSegmentDetailsLoader("dataset", request);
    const offA = loader.subscribe("a", vi.fn());
    const offModal = loader.subscribe("a", vi.fn());
    const offB = loader.subscribe("b", vi.fn());
    await vi.runAllTimersAsync();
    expect(resolveSelectionDetails).toHaveBeenCalledTimes(1);
    expect(resolveSelectionDetails).toHaveBeenCalledWith(
      "dataset",
      expect.objectContaining({
        episodeIds: ["a", "b"],
        boundary: request.boundary,
      }),
      expect.any(AbortSignal),
    );
    expect(loader.get("a").members).toHaveLength(1);
    expect(loader.get("b")).toMatchObject({ members: [], loading: false });
    offA();
    expect(loader.get("a").members).toHaveLength(1);
    offModal();
    offB();
    expect(loader.get("a").loading).toBe(true);
  });
  it("does not let a response for an unmounted tile overwrite a new subscription", async () => {
    vi.useFakeTimers();
    let finish!: (value: Pick<SelectionResult, "groups">) => void;
    vi.mocked(resolveSelectionDetails).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const loader = createSegmentDetailsLoader("dataset", request);
    const off = loader.subscribe("a", vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    const signal = vi.mocked(resolveSelectionDetails).mock.calls[0][2]!;
    off();
    expect(signal.aborted).toBe(true);
    vi.mocked(resolveSelectionDetails).mockResolvedValue({ groups: [] });
    const next = loader.subscribe("a", vi.fn());
    finish(result("a"));
    await vi.runAllTimersAsync();
    expect(loader.get("a").members).toEqual([]);
    next();
  });
  it("isolates filtered scopes and exposes read failures without broadening membership", async () => {
    vi.useFakeTimers();
    vi.mocked(resolveSelectionDetails).mockRejectedValue(
      new Error("unavailable"),
    );
    const loader = createSegmentDetailsLoader("dataset", {
      ...request,
      boundary: {
        ...request.boundary,
        provider: { kind: "temporal-tags", values: ["turn"] },
      },
    });
    const off = loader.subscribe("a", vi.fn());
    await vi.runAllTimersAsync();
    expect(loader.get("a")).toMatchObject({
      members: [],
      loading: false,
      error: "Error: unavailable",
    });
    expect(
      vi.mocked(resolveSelectionDetails).mock.calls[0][1].boundary.provider,
    ).toEqual({ kind: "temporal-tags", values: ["turn"] });
    off();
  });
});
