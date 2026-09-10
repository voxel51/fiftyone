import type { LabelData } from "@fiftyone/utilities";
import { vi } from "vitest";
import type { SurfaceOpsDeps } from "./frameReader";

export const SAMPLE = "v";
export const PATH = "frames.detections";

/** Mutable engine truth the ops read back through `engine.getLabel`. */
export const harness = {
  frameData: {} as Record<number, Record<string, LabelData>>,
  activeRefs: [] as { instanceId: string; path: string }[],
};

export const mockEngine = {
  getLabel: ({ instanceId, frame }: { instanceId: string; frame?: number }) =>
    frame != null ? harness.frameData[frame]?.[instanceId] : undefined,
  mintInstanceId: vi.fn(() => "NEW"),
  mintGestureId: vi.fn(() => "gesture:1"),
  interaction: { getActive: () => harness.activeRefs },
};

export const mockActions = {
  transaction: vi.fn((fn: () => unknown) => fn()),
  updateLabel: vi.fn(),
  deleteLabel: vi.fn(),
  createLabel: vi.fn(() => ({
    sample: SAMPLE,
    path: "events",
    instanceId: "new-td",
  })),
  setActive: vi.fn(),
};

export const mockBus = { dispatch: vi.fn() };

export const deps = (): SurfaceOpsDeps =>
  ({
    ctx: { sample: SAMPLE, path: PATH, fps: 10, totalFrames: 5 },
    actions: mockActions,
    eventBus: mockBus,
    engine: mockEngine,
  }) as unknown as SurfaceOpsDeps;

export const resetHarness = (): void => {
  harness.frameData = {};
  harness.activeRefs = [];
  vi.clearAllMocks();
};

export const det = (
  id: string,
  instanceId: string,
  over: Partial<LabelData> = {},
): LabelData => ({
  _id: id,
  _cls: "Detection",
  instance: { _id: instanceId, _cls: "Instance" },
  label: "x",
  bounding_box: [0, 0, 1, 1],
  ...over,
});
