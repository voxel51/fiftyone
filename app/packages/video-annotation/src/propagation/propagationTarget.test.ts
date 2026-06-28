import { describe, expect, it } from "vitest";
import type {
  FrameLabelSnapshot,
  SyntheticBox,
} from "../streams/SyntheticLabelStream";
import type { VideoFrameLabelsStream } from "../streams/VideoFrameLabelsStream";
import { resolvePropagationTarget } from "./propagationTarget";

const FPS = 30;
const INSTANCE = "inst-1"; // engine instanceId = the track's instance._id
const OVERLAY = "obj"; // per-frame doc id (det.id)

// Frame N's start time is (N-1)/fps; mirror the stream's frame→time mapping.
const timeOfFrame = (frame: number): number => (frame - 1) / FPS;

/** Minimal tracked-detection snapshot row the resolver reads. */
const det = (
  keyframe: boolean,
): Pick<SyntheticBox, "id" | "keyframe" | "instance"> => ({
  id: OVERLAY,
  keyframe,
  instance: { _cls: "Instance", _id: INSTANCE },
});

/**
 * Stub stream over a map of frame number → the tracked object's keyframe
 * state on that frame (absent = the object isn't present). Only the surface
 * the resolver touches (`getValue` / `fps` / `totalFrames`) is implemented.
 */
const fakeStream = (
  totalFrames: number,
  keyframeByFrame: Record<number, boolean>,
): VideoFrameLabelsStream =>
  ({
    fps: FPS,
    totalFrames,
    getValue(time: number): FrameLabelSnapshot | null {
      const frame = Math.floor(time * FPS + 1e-6) + 1;
      const present = frame in keyframeByFrame;
      return {
        frameNumber: frame,
        detections: present
          ? ([det(keyframeByFrame[frame])] as SyntheticBox[])
          : [],
      };
    },
  }) as unknown as VideoFrameLabelsStream;

describe("resolvePropagationTarget", () => {
  it("brackets between two keyframes around the playhead", () => {
    const stream = fakeStream(100, { 10: true, 20: false, 40: true });
    const target = resolvePropagationTarget(
      stream,
      [INSTANCE],
      timeOfFrame(20),
    );
    expect(target).toEqual({
      ok: true,
      instanceId: INSTANCE,
      fromFrame: 10,
      toFrame: 40,
    });
  });

  it("fills forward to the end of the extended track (no downstream keyframe)", () => {
    // Seed keyframe at 10, drag-extended with non-keyframe filler through 45.
    const frames: Record<number, boolean> = { 10: true };
    for (let f = 11; f <= 45; f++) frames[f] = false;
    const stream = fakeStream(100, frames);
    const target = resolvePropagationTarget(
      stream,
      [INSTANCE],
      timeOfFrame(20),
    );
    expect(target).toEqual({
      ok: true,
      instanceId: INSTANCE,
      fromFrame: 10,
      toFrame: 45, // the track's extent, not the clip end (100)
    });
  });

  it("caps at the next keyframe (bracket) once one exists", () => {
    // Same object, but now a later keyframe is present — prefer the bracket.
    // The tracked object is present (non-kf) at the playhead frame too.
    const stream = fakeStream(100, { 10: true, 30: false, 70: true });
    const target = resolvePropagationTarget(
      stream,
      [INSTANCE],
      timeOfFrame(30),
    );
    expect(target).toMatchObject({
      ok: true,
      fromFrame: 10,
      toFrame: 70,
    });
  });

  it("won't fill an un-extended single-frame track", () => {
    // Just a seed keyframe, nothing ahead — extend the track first.
    const stream = fakeStream(100, { 10: true });
    const target = resolvePropagationTarget(
      stream,
      [INSTANCE],
      timeOfFrame(10),
    );
    expect(target).toEqual({
      ok: false,
      reason: "Extend the track past this frame to fill it.",
    });
  });

  it("needs a keyframe at or before the playhead", () => {
    // Only a keyframe after the playhead; the object is present (non-kf) now.
    const stream = fakeStream(100, { 10: false, 40: true });
    const target = resolvePropagationTarget(
      stream,
      [INSTANCE],
      timeOfFrame(10),
    );
    expect(target).toEqual({
      ok: false,
      reason: "Need a keyframe at or before this frame.",
    });
  });

  it("reports when the object has no keyframes yet", () => {
    const stream = fakeStream(100, { 10: false });
    const target = resolvePropagationTarget(
      stream,
      [INSTANCE],
      timeOfFrame(10),
    );
    expect(target).toEqual({
      ok: false,
      reason: "Mark a keyframe to seed propagation",
    });
  });

  it("matches an instance-less detection by its doc id, then asks for a tracked box", () => {
    // engine addresses an instance-less detection by its doc id (`?? d.id`), so
    // it IS found — but propagation needs a real instance to track across frames
    const stream = {
      fps: FPS,
      totalFrames: 100,
      getValue: (time: number): FrameLabelSnapshot | null => {
        const frame = Math.floor(time * FPS + 1e-6) + 1;
        return {
          frameNumber: frame,
          detections:
            frame === 10
              ? ([{ id: OVERLAY, keyframe: true }] as SyntheticBox[])
              : [],
        };
      },
    } as unknown as VideoFrameLabelsStream;

    const target = resolvePropagationTarget(stream, [OVERLAY], timeOfFrame(10));
    expect(target).toEqual({
      ok: false,
      reason:
        "Selected object has no instance id — draw it as a tracked box first.",
    });
  });

  it("requires a selection", () => {
    const stream = fakeStream(100, { 10: true });
    expect(resolvePropagationTarget(stream, [], timeOfFrame(10))).toEqual({
      ok: false,
      reason: "Select a tracked object to propagate.",
    });
  });
});
