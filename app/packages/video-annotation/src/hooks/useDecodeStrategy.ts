/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useEffect, useState } from "react";
import { useDatasetName, useModalSampleId } from "../state/accessors";
import { probeNativeDecode } from "../streams/probeNativeDecode";
import {
  type DecodeStrategy,
  resolveDecodeStrategy,
} from "../utils/decodeStrategy";
import { nativeDecodeCache } from "../utils/nativeDecodeCache";
import {
  looksDemuxable,
  webCodecsAvailable,
} from "../utils/nativeDecodeSupport";
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
    reason:
      strategy === "extract"
        ? undefined
        : [
            native.reason,
            strategy === "html" ? "no extracted frame images" : undefined,
          ]
            .filter(Boolean)
            .join("; "),
  };
}

interface NativeDecodableState {
  checking: boolean;
  decodable: boolean;
  /** Audio-track presence from the probe; undefined = unknown. */
  hasAudio?: boolean;
  /** Why the source isn't decodable, when it isn't. */
  reason?: string;
}

interface NativeDecodableInput {
  videoSrc: string | null;
  dataset: string | null;
  sampleId: string | null;
  enabled: boolean;
}

/**
 * Whether the source video is decodable via WebCodecs. Cheap sync gates first
 * (WebCodecs present, ISO-BMFF-looking container); then a cached per-sample
 * verdict; only on a cache miss do we run the (moov-only) worker probe and
 * memoize its result. A verdict is cached only when the probe demuxed a codec,
 * so a transient fetch failure isn't remembered as "not decodable".
 */
function useNativeDecodable(input: NativeDecodableInput): NativeDecodableState {
  const { videoSrc, dataset, sampleId, enabled } = input;
  const [state, setState] = useState<NativeDecodableState>({
    checking: false,
    decodable: false,
  });

  useEffect(() => {
    const skipped = !videoSrc
      ? "no video URL"
      : !webCodecsAvailable()
        ? "this browser has no WebCodecs"
        : !looksDemuxable(videoSrc)
          ? "the video container isn't MP4"
          : null;

    if (!enabled || !videoSrc || !dataset || !sampleId || skipped) {
      setState({
        checking: false,
        decodable: false,
        reason: skipped ?? undefined,
      });
      return undefined;
    }

    const cached = nativeDecodeCache.getSampleVerdict(dataset, sampleId);
    if (cached) {
      setState({
        checking: false,
        decodable: cached.decodable,
        hasAudio: cached.hasAudio,
        reason: cached.decodable
          ? undefined
          : `this browser can't decode ${cached.codec} (remembered)`,
      });
      return undefined;
    }

    let cancelled = false;
    const controller = new AbortController();
    setState({ checking: true, decodable: false });

    // No custom headers: the probe fetches `videoSrc` with `<video src>`
    // semantics (cors, default credentials), matching how the decode worker and
    // `framesWorker` fetch media — so probe reachability tracks the real fetch.
    probeNativeDecode(videoSrc, { signal: controller.signal }).then(
      (result) => {
        if (cancelled) {
          return;
        }

        if (result.codec) {
          nativeDecodeCache.setSampleVerdict(dataset, sampleId, {
            codec: result.codec,
            decodable: result.decodable,
            hasAudio: result.hasAudio,
          });
        }

        setState({
          checking: false,
          decodable: result.decodable,
          hasAudio: result.hasAudio,
          reason: result.decodable
            ? undefined
            : (result.reason ?? "the decode check failed"),
        });
      },
    );

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, videoSrc, dataset, sampleId]);

  return state;
}
