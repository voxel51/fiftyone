import type { SyntheticBox } from "@fiftyone/utilities";
import { describe, expect, it, vi } from "vitest";
import type { BrowserAnnotationProvider } from "../providers";
import { SAM2PropagationBrowserAgent } from "./SAM2PropagationBrowserAgent";
import type { PropagatedDetection } from "./types";

const INSTANCE = "inst-1";

const keyframe = (
  id: string,
  overrides: Partial<SyntheticBox> = {},
): SyntheticBox => ({
  id,
  _id: id,
  label: "car",
  bounding_box: [0.1, 0.2, 0.3, 0.4],
  index: 2,
  instance: { _cls: "Instance", _id: INSTANCE },
  keyframe: true,
  ...overrides,
});

// A mask whose centroid sampling always yields ≥1 interior point, so the
// centroid-followed chain runs to the end frame rather than bailing.
const makeResult = () => ({
  mask: new Float32Array([0.1, 0.9, 0.8, 0.2]),
  maskWidth: 2,
  maskHeight: 2,
  bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
});

const makeAgent = () => {
  const provider = {
    initialize: vi.fn().mockResolvedValue(undefined),
    isInitialized: vi.fn().mockReturnValue(true),
    inferBitmap: vi.fn().mockResolvedValue(makeResult()),
    abort: vi.fn(),
    dispose: vi.fn(),
  } as unknown as BrowserAnnotationProvider;
  const agent = new SAM2PropagationBrowserAgent(() => provider);
  return { agent, provider };
};

const baseArgs = (
  emitted: Array<{ frame: number; det: PropagatedDetection }>,
) => ({
  instanceId: INSTANCE,
  seedKeyframe: keyframe("seed"),
  fromFrame: 1,
  toFrame: 3,
  videoKey: "vid",
  getFrameBitmap: async () => ({}) as ImageBitmap,
  onDetection: (frame: number, det: PropagatedDetection) =>
    emitted.push({ frame, det }),
});

describe("SAM2PropagationBrowserAgent forward run", () => {
  it("emits the horizon frame with no propagation provenance", async () => {
    const emitted: Array<{ frame: number; det: PropagatedDetection }> = [];
    const { agent } = makeAgent();

    // No endKeyframe → forward run to `toFrame` (the clip end).
    await agent.propagate(baseArgs(emitted));

    // Seed frame 1 is skipped; the horizon frame 3 IS written.
    expect(emitted.map((e) => e.frame)).toEqual([2, 3]);
    for (const { det } of emitted) {
      expect(det.keyframe).toBe(false);
      expect(det.instance?._id).toBe(INSTANCE);
      // No `propagation` blob: it would persist as a `replace` over a
      // server-absent path on the next edit (the frame-patch error).
      expect(det).not.toHaveProperty("propagation");
    }
  });
});

describe("SAM2PropagationBrowserAgent bracketed run", () => {
  it("leaves both keyframe endpoints untouched and writes no provenance", async () => {
    const emitted: Array<{ frame: number; det: PropagatedDetection }> = [];
    const { agent } = makeAgent();

    await agent.propagate({
      ...baseArgs(emitted),
      endKeyframe: keyframe("end"),
    });

    // Both endpoints (frames 1 and 3) are user keyframes → only frame 2.
    expect(emitted.map((e) => e.frame)).toEqual([2]);
    expect(emitted[0].det).not.toHaveProperty("propagation");
  });
});
