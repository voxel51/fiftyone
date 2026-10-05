/**
 * The frame store over a bounded frame source: dropping evicted server frames
 * while keeping this session's edits, answering a track's frames from the
 * index plus those edits, and loading frames before an operation reads them.
 */

import type { LabelData } from "@fiftyone/utilities";
import { LabelType } from "@fiftyone/utilities";
import { describe, expect, it, vi } from "vitest";

import type { LabelRef } from "../identity/ref";
import type { FramesData } from "./frameStore";
import { FrameStore } from "./frameStore";
import type { FrameSource, TrackFrames } from "./types";

const SAMPLE = "v";
const PATH = "frames.detections";
const VALUE = "frames.score";

const det = (docId: string, trackId: string, keyframe = false): LabelData => ({
  _id: docId,
  _cls: "Detection",
  instance: { _id: trackId, _cls: "Instance" },
  label: "x",
  bounding_box: [0, 0, 1, 1],
  keyframe,
});

const ref = (instanceId: string, frame: number): LabelRef => ({
  sample: SAMPLE,
  path: PATH,
  instanceId,
  frame,
});

const source = (
  indexed: Record<string, TrackFrames> | null,
  hold = vi.fn(async () => () => {}),
): FrameSource & { hold: typeof hold } => ({
  indexedTrack: (_path, instanceId) =>
    indexed ? (indexed[instanceId] ?? { frames: [], keyframes: [] }) : null,
  trackIndexReady: () => Promise.resolve(indexed !== null),
  hold,
});

const makeStore = (data: FramesData, frameSource?: FrameSource) =>
  new FrameStore(SAMPLE, {
    labelTypes: { [PATH]: LabelType.Detections },
    valuePaths: [VALUE],
    data,
    frameSource,
  });

describe("FrameStore.evict", () => {
  it("drops server frames nobody wrote this session", () => {
    const store = makeStore({
      1: { [PATH]: [det("d1", "A")] },
      2: { [PATH]: [det("d2", "A")] },
    });

    store.evict([1]);

    expect(store.getLabel(ref("A", 1))).toBeUndefined();
    expect(store.getLabel(ref("A", 2))).toBeDefined();
    expect(store.loadedFrames()).toEqual([2]);
  });

  it("keeps frames written this session, saved or not", () => {
    const store = makeStore({
      1: { [PATH]: [det("d1", "A")] },
      2: { [PATH]: [det("d2", "A")] },
    });

    store.updateLabel(ref("A", 1), { label: "edited" });
    store.evict([1, 2]);

    expect(store.getLabel(ref("A", 1))?.label).toBe("edited");
    expect(store.getLabel(ref("A", 2))).toBeUndefined();
    // the edit still diffs against the frame's server labels
    expect(store.getJsonPatch()).toEqual([
      {
        op: "replace",
        path: "/frames/1/detections/detections/0/label",
        value: "edited",
      },
    ]);
  });

  it("keeps frames whose primitive values were written", () => {
    const store = makeStore({ 3: { [PATH]: [det("d3", "A")] } });

    store.setFrameValue(VALUE, 3, 0.5);
    store.evict([3]);

    expect(store.getLabel(ref("A", 3))).toBeDefined();
  });
});

describe("FrameStore.trackFrames", () => {
  it("answers from the frames it holds without a frame source", () => {
    const store = makeStore({
      1: { [PATH]: [det("d1", "A", true)] },
      2: { [PATH]: [det("d2", "A")] },
      3: { [PATH]: [det("d3", "B")] },
    });

    expect(store.trackFrames(PATH, "A")).toEqual({
      frames: [1, 2],
      keyframes: [1],
    });
  });

  it("takes unwritten frames from the index and written ones from the store", () => {
    // the index knows frames 1-5 with keyframes 1 and 5; only frame 3 is held
    const store = makeStore(
      { 3: { [PATH]: [det("d3", "A")] } },
      source({ A: { frames: [1, 2, 3, 4, 5], keyframes: [1, 5] } }),
    );

    // this session: frame 3 becomes a keyframe, frame 5 loses the box, and
    // frame 6 gains one
    store.updateLabel(ref("A", 3), { keyframe: true });
    store.updateLabel(ref("A", 6), { bounding_box: [0, 0, 1, 1] });

    expect(store.trackFrames(PATH, "A")).toEqual({
      frames: [1, 2, 3, 4, 5, 6],
      keyframes: [1, 3, 5],
    });

    store.deleteLabel(ref("A", 5));

    expect(store.trackFrames(PATH, "A")).toEqual({
      frames: [1, 2, 3, 4, 6],
      keyframes: [1, 3],
    });
  });

  it("falls back to the frames it holds when the index has no field", () => {
    const store = makeStore({ 2: { [PATH]: [det("d2", "A")] } }, source(null));

    expect(store.trackFrames(PATH, "A").frames).toEqual([2]);
  });
});

describe("FrameStore.trackIndexReady", () => {
  it("answers with the frame source's index status", async () => {
    await expect(makeStore({}, source({})).trackIndexReady()).resolves.toBe(
      true,
    );
    await expect(makeStore({}, source(null)).trackIndexReady()).resolves.toBe(
      false,
    );
  });

  it("resolves true without a frame source", async () => {
    await expect(makeStore({}).trackIndexReady()).resolves.toBe(true);
  });
});

describe("FrameStore.holdFrames", () => {
  it("loads through the frame source", async () => {
    const release = vi.fn();
    const hold = vi.fn(async () => release);
    const store = makeStore({}, source({}, hold));

    const done = await store.holdFrames([4, 5]);
    done();

    expect(hold).toHaveBeenCalledWith([4, 5]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("resolves at once without a frame source", async () => {
    const store = makeStore({});

    await expect(store.holdFrames([1])).resolves.toBeTypeOf("function");
  });
});
