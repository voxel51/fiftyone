/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Test-controlled handles the mocked hooks read from. Set per-test before
// `renderHandlers()` so each captured command handler closes over the right
// stream/scene/deps.
const h = vi.hoisted(() => ({
  scene: null as unknown,
  stream: null as unknown,
  imageStream: null as unknown,
  // Stable references — returning fresh objects per render would churn the
  // handlers' useCallback identities (harmless here, but noisy).
  eventBus: { dispatch: vi.fn() },
  registry: { listAgents: vi.fn() },
  sampleDescriptor: { sampleId: "sample-1" },
  tombstone: vi.fn(),
  setStatusContent: vi.fn(),
  applyPropagation: vi.fn(),
  applyPropagatedDetection: vi.fn(),
  registered: new Map<unknown, (cmd: unknown) => Promise<unknown>>(),
}));

// One command sentinel per registered handler; the registration mock keys the
// handler map by these references, so tests look handlers up by class.
vi.mock("@fiftyone/annotation", () => ({
  AgentTaskType: { PROPAGATE: "PROPAGATE" },
  CreateTemporalDetectionCommand: class CreateTemporalDetectionCommand {},
  DeleteTemporalDetectionCommand: class DeleteTemporalDetectionCommand {},
  EditTemporalDetectionCommand: class EditTemporalDetectionCommand {},
  MarkKeyframeCommand: class MarkKeyframeCommand {},
  PropagateCommand: class PropagateCommand {},
  ExtendTrackCommand: class ExtendTrackCommand {},
  ShiftTrackCommand: class ShiftTrackCommand {},
  TrimTrackCommand: class TrimTrackCommand {},
  UpdateTrackAttributesCommand: class UpdateTrackAttributesCommand {},
  DeleteTrackCommand: class DeleteTrackCommand {},
  useAgentRegistry: () => h.registry,
  useAnnotationEventBus: () => h.eventBus,
  useSampleDescriptor: () => h.sampleDescriptor,
  useTombstoneTemporalDetection: () => h.tombstone,
}));

vi.mock("@fiftyone/command-bus", () => ({
  useRegisterCommandHandler: (
    type: unknown,
    handler: (cmd: unknown) => Promise<unknown>
  ) => {
    h.registered.set(type, handler);
  },
}));

vi.mock("@fiftyone/lighter", () => ({
  TemporalOverlay: class TemporalOverlay {
    label: unknown;
    frame?: number;
    constructor(public opts: { id: string; field: string; label: unknown }) {
      this.label = opts.label;
    }
    setCurrentFrame(f: number) {
      this.frame = f;
    }
  },
  useLighter: () => ({ scene: h.scene }),
}));

// frame ↔ time convention mirrored by the fake stream below.
vi.mock("@fiftyone/playback", () => ({
  frameAt: (time: number, fps: number) => Math.round(time * fps) + 1,
}));

vi.mock("@fiftyone/utilities", () => ({
  objectId: () => "new-id",
}));

vi.mock("../components/PropagationStatusItem", () => ({
  PropagationStatusItem: () => null,
}));

vi.mock("../propagation/useApplyPropagationResult", () => ({
  useApplyPropagationResult: () => h.applyPropagation,
  useApplyPropagatedDetection: () => h.applyPropagatedDetection,
}));

vi.mock("../state/videoAnnotationStatus", () => ({
  useVideoAnnotationStatus: () => ({ setContent: h.setStatusContent }),
}));

vi.mock("../streams/frameLabelsStream", () => ({
  useFrameLabelsStream: () => h.stream,
}));

vi.mock("../streams/imaVidImageStreamHandle", () => ({
  useImaVidImageStream: () => h.imageStream,
}));

import {
  CreateTemporalDetectionCommand,
  DeleteTemporalDetectionCommand,
  DeleteTrackCommand,
  EditTemporalDetectionCommand,
  ExtendTrackCommand,
  MarkKeyframeCommand,
  PropagateCommand,
  ShiftTrackCommand,
  TrimTrackCommand,
  UpdateTrackAttributesCommand,
} from "@fiftyone/annotation";
import { TemporalOverlay } from "@fiftyone/lighter";
import { useRegisterVideoAnnotationCommandHandlers } from "./useRegisterVideoAnnotationCommandHandlers";

const FPS = 10;

interface Det {
  id: string;
  _id?: string;
  keyframe: boolean;
  bounding_box: [number, number, number, number];
  instance?: { _cls: "Instance"; _id?: string };
  propagation?: unknown;
  label?: string;
  index?: number;
}

const det = (overrides: Partial<Det> & Pick<Det, "id">): Det => ({
  keyframe: false,
  bounding_box: [0.1, 0.2, 0.3, 0.4],
  ...overrides,
});

/**
 * Fake VideoFrameLabelsStream — `getValue(time)` maps time→frame the same way
 * the handlers do (`frameAt`), backed by a per-frame-number detection map.
 * Records every `updateLabel` / `deleteLabel` for assertions.
 */
function makeStream({
  totalFrames = 100,
  frames = new Map<number, Det[]>(),
}: { totalFrames?: number; frames?: Map<number, Det[]> } = {}) {
  return {
    fps: FPS,
    totalFrames,
    labelsField: "frames",
    getValue: (time: number) =>
      frames.has(Math.round(time * FPS) + 1)
        ? { detections: frames.get(Math.round(time * FPS) + 1)! }
        : null,
    updateLabel: vi.fn(),
    deleteLabel: vi.fn(),
  };
}

// Shape of the mocked TemporalOverlay (above). The imported `TemporalOverlay`
// carries lighter's real type at check-time, so build/inspect through this.
type MockOverlay = {
  opts: { id: string; field: string; label: unknown };
  label: unknown;
  frame?: number;
};
const makeOverlay = (opts: {
  id: string;
  field: string;
  label: unknown;
}): MockOverlay => new TemporalOverlay(opts as never) as unknown as MockOverlay;

function makeScene() {
  const overlays = new Map<string, unknown>();
  return {
    overlays,
    getOverlay: vi.fn((id: string) => overlays.get(id)),
    addOverlay: vi.fn((o: { opts: { id: string } }) =>
      overlays.set(o.opts.id, o)
    ),
    removeOverlay: vi.fn((id: string) => overlays.delete(id)),
    selectOverlay: vi.fn(),
  };
}

const renderHandlers = () => {
  renderHook(() => useRegisterVideoAnnotationCommandHandlers());
  return <C>(command: C) =>
    h.registered.get(command) as (cmd: unknown) => Promise<unknown>;
};

beforeEach(() => {
  vi.clearAllMocks();
  h.registered.clear();
  h.scene = null;
  h.stream = null;
  h.imageStream = null;
});

describe("useRegisterVideoAnnotationCommandHandlers", () => {
  it("registers a handler for each video command", () => {
    h.stream = makeStream();
    h.scene = makeScene();
    renderHandlers();

    for (const cmd of [
      MarkKeyframeCommand,
      PropagateCommand,
      ExtendTrackCommand,
      TrimTrackCommand,
      DeleteTrackCommand,
      UpdateTrackAttributesCommand,
      ShiftTrackCommand,
      EditTemporalDetectionCommand,
      DeleteTemporalDetectionCommand,
      CreateTemporalDetectionCommand,
    ]) {
      expect(h.registered.has(cmd)).toBe(true);
    }
  });

  describe("MarkKeyframeCommand", () => {
    it("toggles a non-keyframe on and dispatches keyframeChanged", async () => {
      const frames = new Map([
        [
          6,
          [
            det({
              id: "track-1",
              _id: "d6",
              keyframe: false,
              instance: { _cls: "Instance", _id: "inst-1" },
            }),
          ],
        ],
      ]);
      const stream = makeStream({ frames });
      h.stream = stream;
      const get = renderHandlers();

      const result = await get(MarkKeyframeCommand)({
        time: 0.5, // → frame 6
        detectionIds: ["track-1"],
      });

      expect(result).toBe(true);
      expect(stream.updateLabel).toHaveBeenCalledWith(6, {
        _cls: "Detection",
        _id: "d6",
        bounding_box: [0.1, 0.2, 0.3, 0.4],
        keyframe: true,
      });
      expect(h.eventBus.dispatch).toHaveBeenCalledWith(
        "annotation:keyframeChanged",
        { trackId: "track-1", instanceId: "inst-1", frame: 6, kind: "set" }
      );
    });

    it("toggles a keyframe off (kind 'removed')", async () => {
      const frames = new Map([
        [6, [det({ id: "track-1", _id: "d6", keyframe: true })]],
      ]);
      h.stream = makeStream({ frames });
      const get = renderHandlers();

      await get(MarkKeyframeCommand)({ time: 0.5, detectionIds: ["track-1"] });

      expect(h.eventBus.dispatch).toHaveBeenCalledWith(
        "annotation:keyframeChanged",
        expect.objectContaining({ kind: "removed" })
      );
    });

    it("clears propagation when promoting to a keyframe", async () => {
      const frames = new Map([
        [
          6,
          [
            det({
              id: "track-1",
              _id: "d6",
              keyframe: false,
              propagation: { method: "linear" },
            }),
          ],
        ],
      ]);
      const stream = makeStream({ frames });
      h.stream = stream;
      const get = renderHandlers();

      await get(MarkKeyframeCommand)({ time: 0.5, detectionIds: ["track-1"] });

      expect(stream.updateLabel).toHaveBeenCalledWith(
        6,
        expect.objectContaining({ keyframe: true, propagation: null })
      );
    });

    it("returns false when no stream is mounted", async () => {
      h.stream = null;
      const get = renderHandlers();

      expect(
        await get(MarkKeyframeCommand)({ time: 0, detectionIds: ["x"] })
      ).toBe(false);
    });

    it("returns false when the detection id list is empty", async () => {
      h.stream = makeStream();
      const get = renderHandlers();

      expect(
        await get(MarkKeyframeCommand)({ time: 0, detectionIds: [] })
      ).toBe(false);
    });
  });

  describe("ExtendTrackCommand", () => {
    it("writes a non-keyframe filler copy at each in-range target frame", async () => {
      const source = det({
        id: "track-1",
        _id: "src",
        keyframe: true,
        label: "car",
        instance: { _cls: "Instance", _id: "inst-1" },
      });
      const stream = makeStream({
        totalFrames: 10,
        frames: new Map([[3, [source]]]),
      });
      h.stream = stream;
      const get = renderHandlers();

      const result = await get(ExtendTrackCommand)({
        sourceFrame: 3,
        targetFrames: [4, 5],
        trackId: "track-1",
      });

      expect(result).toBe(true);
      expect(stream.updateLabel).toHaveBeenCalledTimes(2);
      expect(stream.updateLabel).toHaveBeenCalledWith(
        4,
        expect.objectContaining({ keyframe: false, label: "car" })
      );
      expect(stream.updateLabel).toHaveBeenCalledWith(
        5,
        expect.objectContaining({ keyframe: false })
      );
    });

    it("skips out-of-range target frames", async () => {
      const source = det({ id: "track-1", _id: "src", keyframe: true });
      const stream = makeStream({
        totalFrames: 5,
        frames: new Map([[3, [source]]]),
      });
      h.stream = stream;
      const get = renderHandlers();

      await get(ExtendTrackCommand)({
        sourceFrame: 3,
        targetFrames: [0, 6, 4],
        trackId: "track-1",
      });

      expect(stream.updateLabel).toHaveBeenCalledTimes(1);
      expect(stream.updateLabel).toHaveBeenCalledWith(4, expect.anything());
    });

    it("returns false when the source frame has no such track", async () => {
      const stream = makeStream({ frames: new Map([[3, []]]) });
      h.stream = stream;
      const get = renderHandlers();

      expect(
        await get(ExtendTrackCommand)({
          sourceFrame: 3,
          targetFrames: [4],
          trackId: "missing",
        })
      ).toBe(false);
      expect(stream.updateLabel).not.toHaveBeenCalled();
    });
  });

  describe("TrimTrackCommand", () => {
    it("deletes the track's detection on each listed frame", async () => {
      const stream = makeStream({
        frames: new Map([
          [2, [det({ id: "track-1", _id: "d2" })]],
          [3, [det({ id: "track-1", _id: "d3" })]],
        ]),
      });
      h.stream = stream;
      const get = renderHandlers();

      const result = await get(TrimTrackCommand)({
        frames: [2, 3],
        trackId: "track-1",
      });

      expect(result).toBe(true);
      expect(stream.deleteLabel).toHaveBeenCalledWith(2, "d2");
      expect(stream.deleteLabel).toHaveBeenCalledWith(3, "d3");
    });
  });

  describe("DeleteTrackCommand", () => {
    it("deletes the track across all frames and dispatches trackDeleted", async () => {
      const stream = makeStream({
        totalFrames: 3,
        frames: new Map([
          [1, [det({ id: "track-1", _id: "d1" })]],
          [3, [det({ id: "track-1", _id: "d3" })]],
        ]),
      });
      h.stream = stream;
      const get = renderHandlers();

      const result = await get(DeleteTrackCommand)({ trackId: "track-1" });

      expect(result).toBe(true);
      expect(stream.deleteLabel).toHaveBeenCalledWith(1, "d1");
      expect(stream.deleteLabel).toHaveBeenCalledWith(3, "d3");
      expect(stream.deleteLabel).toHaveBeenCalledTimes(2);
      expect(h.eventBus.dispatch).toHaveBeenCalledWith(
        "annotation:trackDeleted",
        { trackId: "track-1" }
      );
    });

    it("does not dispatch trackDeleted when nothing was removed", async () => {
      h.stream = makeStream({ totalFrames: 3 });
      const get = renderHandlers();

      expect(await get(DeleteTrackCommand)({ trackId: "track-1" })).toBe(false);
      expect(h.eventBus.dispatch).not.toHaveBeenCalled();
    });
  });

  describe("UpdateTrackAttributesCommand", () => {
    it("merges attributes onto the track's detection on every frame", async () => {
      const stream = makeStream({
        totalFrames: 2,
        frames: new Map([
          [1, [det({ id: "track-1", _id: "d1" })]],
          [2, [det({ id: "track-1", _id: "d2" })]],
        ]),
      });
      h.stream = stream;
      const get = renderHandlers();

      const result = await get(UpdateTrackAttributesCommand)({
        trackId: "track-1",
        attributes: { label: "truck", index: 7 },
      });

      expect(result).toBe(true);
      expect(stream.updateLabel).toHaveBeenCalledWith(1, {
        _cls: "Detection",
        _id: "d1",
        label: "truck",
        index: 7,
      });
      expect(stream.updateLabel).toHaveBeenCalledWith(2, {
        _cls: "Detection",
        _id: "d2",
        label: "truck",
        index: 7,
      });
    });

    it("returns false when no attributes are supplied", async () => {
      h.stream = makeStream({
        frames: new Map([[1, [det({ id: "track-1", _id: "d1" })]]]),
      });
      const get = renderHandlers();

      expect(
        await get(UpdateTrackAttributesCommand)({
          trackId: "track-1",
          attributes: {},
        })
      ).toBe(false);
    });
  });

  describe("ShiftTrackCommand", () => {
    it("clears originals then re-lays the boxes at frame + delta", async () => {
      const stream = makeStream({
        totalFrames: 10,
        frames: new Map([
          [2, [det({ id: "track-1", _id: "d2", keyframe: true })]],
          [3, [det({ id: "track-1", _id: "d3", keyframe: false })]],
        ]),
      });
      h.stream = stream;
      const get = renderHandlers();

      const result = await get(ShiftTrackCommand)({
        trackId: "track-1",
        delta: 2,
        frames: [2, 3],
      });

      expect(result).toBe(true);
      // Originals cleared.
      expect(stream.deleteLabel).toHaveBeenCalledWith(2, "d2");
      expect(stream.deleteLabel).toHaveBeenCalledWith(3, "d3");
      // Re-laid at +2, keyframe flag preserved.
      expect(stream.updateLabel).toHaveBeenCalledWith(
        4,
        expect.objectContaining({ keyframe: true })
      );
      expect(stream.updateLabel).toHaveBeenCalledWith(
        5,
        expect.objectContaining({ keyframe: false })
      );
    });

    it("is a no-op for a zero delta", async () => {
      const stream = makeStream({
        frames: new Map([[2, [det({ id: "track-1", _id: "d2" })]]]),
      });
      h.stream = stream;
      const get = renderHandlers();

      expect(
        await get(ShiftTrackCommand)({
          trackId: "track-1",
          delta: 0,
          frames: [2],
        })
      ).toBe(false);
      expect(stream.deleteLabel).not.toHaveBeenCalled();
    });
  });

  describe("EditTemporalDetectionCommand", () => {
    it("merges the update onto the overlay label and dispatches labelEdit", async () => {
      const scene = makeScene();
      const overlay = makeOverlay({
        id: "td-events-a",
        field: "events",
        label: { _cls: "TemporalDetection", _id: "a", support: [1, 10] },
      });
      scene.overlays.set("td-events-a", overlay);
      h.scene = scene;
      const get = renderHandlers();

      const result = await get(EditTemporalDetectionCommand)({
        fieldPath: "events",
        detectionId: "a",
        update: { label: "running" },
      });

      expect(result).toBe(true);
      expect(overlay.label).toMatchObject({
        _cls: "TemporalDetection",
        _id: "a",
        support: [1, 10],
        label: "running",
      });
      expect(h.eventBus.dispatch).toHaveBeenCalledWith("annotation:labelEdit", {
        label: overlay.label,
      });
    });

    it("returns false when the overlay isn't a TemporalOverlay", async () => {
      const scene = makeScene();
      scene.overlays.set("td-events-a", { not: "a temporal overlay" });
      h.scene = scene;
      const get = renderHandlers();

      expect(
        await get(EditTemporalDetectionCommand)({
          fieldPath: "events",
          detectionId: "a",
          update: {},
        })
      ).toBe(false);
    });
  });

  describe("DeleteTemporalDetectionCommand", () => {
    it("tombstones the detection and removes its overlay", async () => {
      const scene = makeScene();
      const overlay = makeOverlay({
        id: "td-events-a",
        field: "events",
        label: { _cls: "TemporalDetection", _id: "a" },
      });
      scene.overlays.set("td-events-a", overlay);
      h.scene = scene;
      const get = renderHandlers();

      const result = await get(DeleteTemporalDetectionCommand)({
        fieldPath: "events",
        detectionId: "a",
      });

      expect(result).toBe(true);
      expect(h.tombstone).toHaveBeenCalledWith("events", "a");
      expect(scene.removeOverlay).toHaveBeenCalledWith("td-events-a");
    });
  });

  describe("CreateTemporalDetectionCommand", () => {
    it("adds and selects a new TD overlay and returns its id", async () => {
      const scene = makeScene();
      h.scene = scene;
      const get = renderHandlers();

      const result = await get(CreateTemporalDetectionCommand)({
        fieldPath: "events",
        support: [5, 12],
        label: "running",
      });

      expect(result).toBe("new-id");
      expect(scene.addOverlay).toHaveBeenCalledTimes(1);
      const overlay = scene.addOverlay.mock
        .calls[0][0] as unknown as MockOverlay;
      expect(overlay.opts.id).toBe("td-events-new-id");
      expect(overlay.label).toMatchObject({
        _cls: "TemporalDetection",
        _id: "new-id",
        support: [5, 12],
        tags: [],
        label: "running",
      });
      // Time gate seeded to the creation frame (support start).
      expect(overlay.frame).toBe(5);
      expect(scene.selectOverlay).toHaveBeenCalledWith("td-events-new-id");
    });

    it("returns null when the scene is unavailable", async () => {
      h.scene = null;
      const get = renderHandlers();

      expect(
        await get(CreateTemporalDetectionCommand)({
          fieldPath: "events",
          support: [1, 2],
        })
      ).toBe(null);
    });
  });

  describe("PropagateCommand", () => {
    const instanceId = "inst-1";

    /** A stream whose from/to frames each carry a matching keyframe. */
    const propagationStream = () =>
      makeStream({
        totalFrames: 100,
        frames: new Map([
          [
            2,
            [
              det({
                id: "track-1",
                _id: "kf-from",
                keyframe: true,
                instance: { _cls: "Instance", _id: instanceId },
              }),
            ],
          ],
          [
            8,
            [
              det({
                id: "track-1",
                _id: "kf-to",
                keyframe: true,
                instance: { _cls: "Instance", _id: instanceId },
              }),
            ],
          ],
        ]),
      });

    it("runs a linear interpolation agent and applies the result", async () => {
      h.stream = propagationStream();
      const inferResult = { type: "sync", response: { perFrame: [] } };
      const infer = vi.fn().mockResolvedValue(inferResult);
      h.registry.listAgents.mockResolvedValue([
        { id: "propagate-linear", agent: { infer } },
      ]);
      const get = renderHandlers();

      const result = await get(PropagateCommand)({
        instanceId,
        fromFrame: 2,
        toFrame: 8,
        method: "linear",
      });

      expect(result).toBe(true);
      expect(infer).toHaveBeenCalledTimes(1);
      const ctx = infer.mock.calls[0][0];
      expect(ctx).toMatchObject({ instanceId, fromFrame: 2, toFrame: 8 });
      expect(ctx.parentKeyframes).toHaveLength(2);
      expect(h.applyPropagation).toHaveBeenCalledWith(inferResult);
    });

    it("returns false for an inverted frame range", async () => {
      h.stream = propagationStream();
      const get = renderHandlers();

      expect(
        await get(PropagateCommand)({
          instanceId,
          fromFrame: 8,
          toFrame: 2,
          method: "linear",
        })
      ).toBe(false);
    });

    it("returns false when the from-frame has no matching keyframe", async () => {
      h.stream = makeStream({
        frames: new Map([
          [2, [det({ id: "track-1", _id: "x", keyframe: false })]],
        ]),
      });
      const get = renderHandlers();

      expect(
        await get(PropagateCommand)({
          instanceId,
          fromFrame: 2,
          toFrame: 8,
          method: "linear",
        })
      ).toBe(false);
    });

    it("returns false for linear with no right keyframe", async () => {
      h.stream = makeStream({
        frames: new Map([
          [
            2,
            [
              det({
                id: "track-1",
                _id: "kf-from",
                keyframe: true,
                instance: { _cls: "Instance", _id: instanceId },
              }),
            ],
          ],
        ]),
      });
      const get = renderHandlers();

      expect(
        await get(PropagateCommand)({
          instanceId,
          fromFrame: 2,
          toFrame: 8,
          method: "linear",
        })
      ).toBe(false);
    });

    it("drives the SAM2 agent over the image stream and clears status when done", async () => {
      h.stream = propagationStream();
      const warmup = vi.fn().mockResolvedValue(undefined);
      h.imageStream = {
        fps: FPS,
        warmup,
        getValue: () => ({ bitmap: {} as ImageBitmap }),
      };
      const propagate = vi.fn().mockResolvedValue(undefined);
      h.registry.listAgents.mockResolvedValue([
        { id: "propagate-sam2", agent: { propagate } },
      ]);
      const get = renderHandlers();

      let result: unknown;
      await act(async () => {
        result = await get(PropagateCommand)({
          instanceId,
          fromFrame: 2,
          toFrame: 8,
          method: "sam2",
        });
      });

      expect(result).toBe(true);
      expect(propagate).toHaveBeenCalledTimes(1);
      expect(propagate.mock.calls[0][0]).toMatchObject({
        instanceId,
        fromFrame: 2,
        toFrame: 8,
        videoKey: "sample-1",
      });
      // Status slot shown then cleared.
      expect(h.setStatusContent).toHaveBeenLastCalledWith(null);
    });

    it("returns false for SAM2 when there is no image stream (e.g. native video)", async () => {
      h.stream = propagationStream();
      h.imageStream = null;
      const get = renderHandlers();

      expect(
        await get(PropagateCommand)({
          instanceId,
          fromFrame: 2,
          toFrame: 8,
          method: "sam2",
        })
      ).toBe(false);
    });
  });
});
