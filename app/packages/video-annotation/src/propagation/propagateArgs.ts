import type { LabelData } from "@fiftyone/utilities";

/** A track's label at a frame, read through the engine. */
export type FrameReader = (frame: number) => LabelData | undefined;

export interface PropagateArgs {
  instanceId: string;
  fromFrame: number;
  toFrame: number;
  /** The active stream's `labelsPath`; never reconstruct `frames.<field>`. */
  path: string;
  /** Reads the track's label at a frame through the engine. */
  at: FrameReader;
  /** The seed keyframe, already verified present and a keyframe. */
  leftKeyframe: LabelData;
  /** The end keyframe, if any. */
  rightKeyframe: LabelData | undefined;
  /** Gesture key to coalesce a re-lerp into; SAM2 mints its own per run. */
  undoKey?: string;
  /** Linear agent resolved from the field's label type. */
  linearAgentId?: string;
}
