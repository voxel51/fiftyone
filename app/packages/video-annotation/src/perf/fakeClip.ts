/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * A synthetic clip served through the two `/video-labels` fetches, the only
 * contract the counts suites fake. Window requests stay open until a test
 * settles them, so a suite can observe how many are in flight and attribute
 * work to each landing.
 */

export const CHUNK_SIZE = 60;
export const FIELD = "detections";
export const PATH = `frames.${FIELD}`;

export interface ClipShape {
  /** Window chunks in the clip; frames = chunks × {@link CHUNK_SIZE}. */
  chunks: number;
  /** Detections on every frame. */
  labelsPerFrame: number;
  /** One instance per slot across the clip, or a fresh identity per box. */
  linked: boolean;
  /** Length of an inline mask string on every detection; 0 for none. */
  maskChars?: number;
}

export const framesOf = (shape: ClipShape): number => shape.chunks * CHUNK_SIZE;

const detection = (shape: ClipShape, frame: number, slot: number) => ({
  _id: `d-${frame}-${slot}`,
  _cls: "Detection",
  label: "person",
  bounding_box: [slot / 100, frame / 1e5, 0.1, 0.1],
  ...(shape.linked
    ? { instance: { _cls: "Instance", _id: `inst-${slot}` } }
    : {}),
  ...(shape.maskChars
    ? { mask: `${frame}:${slot}:`.padEnd(shape.maskChars, "A") }
    : {}),
});

/** The window payload for one frame, as `/video-labels/window` carries it. */
export const frameFields = (shape: ClipShape, frame: number) => ({
  [FIELD]: {
    _cls: "Detections",
    detections: Array.from({ length: shape.labelsPerFrame }, (_, slot) =>
      detection(shape, frame, slot),
    ),
  },
});

/** The server distribution index the timeline baselines from. */
export const indexOf = (shape: ClipShape) => {
  const frames = framesOf(shape);
  const instances = [];

  if (shape.linked) {
    for (let slot = 0; slot < shape.labelsPerFrame; slot++) {
      instances.push({
        instanceId: `inst-${slot}`,
        classLabel: "person",
        persistedIndex: null,
        instance: { _cls: "Instance" as const, _id: `inst-${slot}` },
        segments: [[1, frames]] as Array<[number, number]>,
        keyframes: [],
      });
    }
  } else {
    for (let frame = 1; frame <= frames; frame++) {
      for (let slot = 0; slot < shape.labelsPerFrame; slot++) {
        instances.push({
          instanceId: `d-${frame}-${slot}`,
          classLabel: "person",
          persistedIndex: null,
          instance: null,
          segments: [[frame, frame]] as Array<[number, number]>,
          keyframes: [],
        });
      }
    }
  }

  return { [FIELD]: { instances } };
};

interface WindowRequest {
  startFrame: number;
  endFrame: number;
}

/** Controllable `/video-labels/window` + `/video-labels/index`. */
export const createFakeClip = () => {
  let shape: ClipShape = { chunks: 1, labelsPerFrame: 1, linked: true };
  const open = new Map<number, () => void>();
  let requests = 0;
  let maxInFlight = 0;

  return {
    use(next: ClipShape) {
      shape = next;
      open.clear();
      requests = 0;
      maxInFlight = 0;
    },
    get shape() {
      return shape;
    },
    /** Window requests dispatched since {@link use}. */
    get requests() {
      return requests;
    },
    get inFlight() {
      return open.size;
    },
    get maxInFlight() {
      return maxInFlight;
    },
    window(request: WindowRequest) {
      requests++;

      return new Promise((resolve) => {
        open.set(request.startFrame, () => {
          open.delete(request.startFrame);
          const frames: Record<string, unknown> = {};

          for (let f = request.startFrame; f <= request.endFrame; f++) {
            frames[String(f)] = frameFields(shape, f);
          }

          // through JSON, as the real client decodes the response: every
          // string and array arrives as its own fresh copy
          resolve(
            JSON.parse(
              JSON.stringify({
                frames,
                range: [request.startFrame, request.endFrame],
              }),
            ),
          );
        });
        maxInFlight = Math.max(maxInFlight, open.size);
      });
    },
    index() {
      return Promise.resolve(indexOf(shape));
    },
    /** Settle the oldest open window request; false when none is open. */
    settleOldest(): boolean {
      const first = [...open.keys()].sort((a, b) => a - b)[0];

      if (first === undefined) {
        return false;
      }

      open.get(first)?.();
      return true;
    },
  };
};

export type FakeClip = ReturnType<typeof createFakeClip>;
