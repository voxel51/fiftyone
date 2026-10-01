/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useDatasetName, useModalSampleId } from "../state/accessors";
import {
  type DecodeStrategy,
  resolveDecodeStrategy,
} from "../utils/decodeStrategy";
import {
  type NativeDecodableState,
  useNativeDecodable,
} from "./useNativeDecodable";
import { useSampledFramesProbe } from "./useSampledFramesProbe";

/**
 * Resolution of the decode strategy. `resolving` while an async capability
 * (frames probe / native decode probe) is still in flight — the surface shows
 * its checking state and mounts nothing yet, so the media scaffolding mounts
 * exactly once, on the settled `strategy`.
 */
export interface DecodeResolution {
  status: "resolving" | "resolved";
  strategy?: DecodeStrategy;
  /** Audio-track presence from the probe; undefined = unknown. */
  hasAudio?: boolean;
  /** Why the strategy isn't `extract`, when it isn't (diagnostics). */
  reason?: string;
  /** Whether extracted frame images exist; undefined when not checked. */
  hasFrames?: boolean;
}

export interface DecodeStrategyInput {
  /** Resolved source video URL, or null when the sample has no media URL. */
  videoSrc: string | null;
  /** Clip frame count; gates the frames probe. */
  frameCount: number | undefined;
  /** Metadata is resolved — safe to probe. */
  enabled: boolean;
  /** Caller-resolved strategy that skips both probes. */
  force?: DecodeStrategy;
}

/**
 * Decide how the surface sources its frames — `extract` (WebCodecs), `fetch`
 * (`to_frames` images), or `html` (`<video>`) — by probing native decodability
 * and frame availability in parallel and feeding {@link resolveDecodeStrategy}.
 * `force` short-circuits both probes; otherwise `resolving` until both settle.
 */
export function useDecodeStrategy(
  input: DecodeStrategyInput,
): DecodeResolution {
  const { videoSrc, frameCount, enabled, force: forced } = input;
  const dataset = useDatasetName();
  const sampleId = useModalSampleId();

  const active = enabled && !forced;

  const framesState = useSampledFramesProbe(frameCount, active);
  const native = useNativeDecodable({
    videoSrc,
    dataset,
    sampleId,
    enabled: active,
  });

  // A manual override wins outright — don't wait on probes.
  if (forced) {
    return { status: "resolved", strategy: forced };
  }

  if (!enabled || native.checking || framesState === "checking") {
    return { status: "resolving" };
  }

  const strategy = resolveDecodeStrategy({
    hasVideoSrc: Boolean(videoSrc),
    nativeDecodable: native.decodable,
    hasFrames: framesState === "sampled",
  });

  return {
    status: "resolved",
    strategy,
    hasAudio: native.hasAudio,
    hasFrames: framesState === "sampled",
    reason:
      strategy === "extract" ? undefined : fallbackReason(native, strategy),
  };
}

/** Why `extract`, and for `html` also `fetch`, didn't win. */
const fallbackReason = (
  native: NativeDecodableState,
  strategy: DecodeStrategy,
): string =>
  [native.reason, strategy === "html" && "no extracted frame images"]
    .filter(Boolean)
    .join("; ");
