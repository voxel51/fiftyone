import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawDetectionsField } from "@fiftyone/utilities";

// Test-controlled handles for the seam tests. `buildDetectionsDelta` itself is
// pure and uses the real core json utils — only the hook's external deps are
// mocked. (`@fiftyone/annotation` is type-only here at runtime except for the
// `useRegisterDeltaSupplier` seam.)
const h = vi.hoisted(() => ({
  stream: null as unknown,
  isVideo: true,
  registerSpy: vi.fn(),
}));

vi.mock("@fiftyone/annotation", () => ({
  useRegisterDeltaSupplier: (supplier: unknown) => h.registerSpy(supplier),
}));

vi.mock("@fiftyone/state", () => ({
  useIsVideo: () => h.isVideo,
}));

vi.mock("../streams/frameLabelsStream", () => ({
  useFrameLabelsStream: () => h.stream,
}));

import {
  buildDetectionsDelta,
  useRegisterVideoLabelsDeltaSupplier,
  useVideoLabelsDeltaSupplier,
} from "./useVideoLabelsDeltaSupplier";

const PREFIX = "/frames/5/gt";

const det = (id: string, extra: Record<string, unknown> = {}) => ({
  _id: id,
  label: "car",
  bounding_box: [0.1, 0.2, 0.3, 0.4] as [number, number, number, number],
  keyframe: true,
  ...extra,
});

const field = (
  ...detections: ReturnType<typeof det>[]
): RawDetectionsField => ({
  detections,
});

describe("buildDetectionsDelta", () => {
  it("emits a single add of the whole wrapper when the baseline lacks the array", () => {
    const to = field(det("a"));
    expect(buildDetectionsDelta({}, to, PREFIX)).toEqual([
      { op: "add", path: PREFIX, value: to },
    ]);
  });

  it("diffs matched ids in place at the baseline index, not by array position", () => {
    const from = field(det("a"), det("b", { keyframe: true }));
    // `b` edited; `a` untouched. Its baseline index (1) must drive the path.
    const to = field(det("a"), det("b", { keyframe: false }));

    const deltas = buildDetectionsDelta(from, to, PREFIX);
    expect(deltas).toContainEqual(
      expect.objectContaining({
        path: `${PREFIX}/detections/1/keyframe`,
        value: false,
      })
    );
    // `a` is identical on both sides — nothing emitted for it.
    expect(
      deltas.some((op) => op.path.startsWith(`${PREFIX}/detections/0`))
    ).toBe(false);
  });

  it("appends cache-only ids with `/-` carrying the full detection", () => {
    const from = field(det("a"));
    const newDet = det("b");
    const deltas = buildDetectionsDelta(from, field(det("a"), newDet), PREFIX);
    expect(deltas).toContainEqual({
      op: "add",
      path: `${PREFIX}/detections/-`,
      value: newDet,
    });
  });

  it("removes baseline-only ids in descending index order", () => {
    const from = field(det("a"), det("b"), det("c"), det("d"));
    // keep only `a`; b/c/d deleted
    const deltas = buildDetectionsDelta(from, field(det("a")), PREFIX);
    expect(deltas).toEqual([
      { op: "remove", path: `${PREFIX}/detections/3` },
      { op: "remove", path: `${PREFIX}/detections/2` },
      { op: "remove", path: `${PREFIX}/detections/1` },
    ]);
  });

  it("does not flood per-slot replaces when a list shifts (the regression this guards)", () => {
    // `b` deleted, so `c` slides from index 2 → 1. An index-aligned diff would
    // see slot 1 (b→c) and slot 2 (c→gone) both 'change'; id-alignment must
    // emit exactly one remove for `b` and nothing for the unmoved `a`/`c`.
    const from = field(det("a"), det("b"), det("c"));
    const to = field(det("a"), det("c"));

    const deltas = buildDetectionsDelta(from, to, PREFIX);
    expect(deltas).toEqual([{ op: "remove", path: `${PREFIX}/detections/1` }]);
  });
});

/** Fake stream exposing only what the supplier reads. */
function makeStream(
  snapshots: Array<{
    frameNumber: number;
    baseline: Record<string, unknown>;
    cache: Record<string, unknown>;
  }>
) {
  return {
    labelsField: "detections",
    getDirtyFrameSnapshots: vi.fn(() => snapshots),
    markCommitPending: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.stream = null;
  h.isVideo = true;
});

describe("useVideoLabelsDeltaSupplier", () => {
  it("diffs each dirty frame's labels field and prefixes the frame path", () => {
    const newDet = { _id: "b", label: "car", bounding_box: [0, 0, 1, 1] };
    const stream = makeStream([
      {
        frameNumber: 5,
        baseline: {
          detections: {
            detections: [
              { _id: "a", label: "car", bounding_box: [0, 0, 1, 1] },
            ],
          },
        },
        cache: {
          detections: {
            detections: [
              { _id: "a", label: "car", bounding_box: [0, 0, 1, 1] },
              newDet,
            ],
          },
        },
      },
    ]);
    h.stream = stream;

    const { result } = renderHook(() => useVideoLabelsDeltaSupplier());
    const { deltas, metadata } = result.current();

    expect(metadata).toBeUndefined();
    expect(deltas).toContainEqual({
      op: "add",
      path: "/frames/5/detections/detections/-",
      value: newDet,
    });
    // Cache refs handed off so the same delta doesn't re-emit next tick.
    expect(stream.markCommitPending).toHaveBeenCalledWith(
      stream.getDirtyFrameSnapshots.mock.results[0].value
    );
  });

  it("does not mark a commit pending when no deltas were produced", () => {
    const stream = makeStream([]);
    h.stream = stream;

    const { result } = renderHook(() => useVideoLabelsDeltaSupplier());
    const { deltas } = result.current();

    expect(deltas).toEqual([]);
    expect(stream.markCommitPending).not.toHaveBeenCalled();
  });

  it("is a no-op when no stream is mounted", () => {
    h.stream = null;

    const { result } = renderHook(() => useVideoLabelsDeltaSupplier());

    expect(result.current()).toEqual({ deltas: [], metadata: undefined });
  });

  it("is a no-op for non-video samples", () => {
    const stream = makeStream([
      { frameNumber: 1, baseline: {}, cache: { detections: {} } },
    ]);
    h.stream = stream;
    h.isVideo = false;

    const { result } = renderHook(() => useVideoLabelsDeltaSupplier());

    expect(result.current()).toEqual({ deltas: [], metadata: undefined });
    expect(stream.getDirtyFrameSnapshots).not.toHaveBeenCalled();
  });
});

describe("useRegisterVideoLabelsDeltaSupplier", () => {
  it("registers the video-labels supplier with annotation's aggregator", () => {
    h.stream = makeStream([]);

    renderHook(() => useRegisterVideoLabelsDeltaSupplier());

    expect(h.registerSpy).toHaveBeenCalledTimes(1);
    expect(typeof h.registerSpy.mock.calls[0][0]).toBe("function");
  });
});
