/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useEffect, useState } from "react";
import { useDatasetName, useModalSampleId } from "../state/accessors";
import { probeNativeDecode } from "../streams/probeNativeDecode";
import {
  type DecodeStrategy,
  parseForcedStrategy,
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
}

export interface DecodeStrategyInput {
  /** Resolved source video URL, or null when the sample has no media URL. */
  videoSrc: string | null;
  /** Clip frame count (gates the frames probe); from `useAnnotatePrerequisites`. */
  frameCount: number | undefined;
  /** Metadata is resolved — safe to probe. */
  enabled: boolean;
  /**
   * Caller-known strategy that skips both probes (a URL override still wins).
   * The dynamic-group ImaVid path forces `fetch`: its frames are the group's
   * ordered samples — there is no source video to extract or play.
   */
  force?: DecodeStrategy;
}

/**
 * Decide how the surface sources its frames: `extract` (WebCodecs on demand),
 * `fetch` (`to_frames` images), or `html` (`<video>` element). Gathers the
 * capability flags — a forced URL override, whether the source is natively
 * decodable, and whether `to_frames` frames exist — and feeds the pure
 * {@link resolveDecodeStrategy} policy.
 *
 * A forced override short-circuits both probes. Otherwise the frames probe and
 * the native-decode probe run in parallel; resolution reports `resolving` until
 * both settle, then applies the policy once.
 */
export function useDecodeStrategy(
  input: DecodeStrategyInput,
): DecodeResolution {
  const { videoSrc, frameCount, enabled } = input;
  const dataset = useDatasetName();
  const sampleId = useModalSampleId();

  const forced = useForcedStrategy() ?? input.force;
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

  return {
    status: "resolved",
    strategy: resolveDecodeStrategy({
      hasVideoSrc: Boolean(videoSrc),
      nativeDecodable: native.decodable,
      hasFrames: framesState === "sampled",
    }),
  };
}

interface NativeDecodableState {
  checking: boolean;
  decodable: boolean;
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
    if (
      !enabled ||
      !videoSrc ||
      !dataset ||
      !sampleId ||
      !webCodecsAvailable() ||
      !looksDemuxable(videoSrc)
    ) {
      setState({ checking: false, decodable: false });
      return undefined;
    }

    const cached = nativeDecodeCache.getSampleVerdict(dataset, sampleId);
    if (cached) {
      setState({ checking: false, decodable: cached.decodable });
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
          });
        }

        setState({ checking: false, decodable: result.decodable });
      },
    );

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, videoSrc, dataset, sampleId]);

  return state;
}

/** Read a forced-strategy URL override once at mount (see `parseForcedStrategy`). */
function useForcedStrategy(): DecodeStrategy | undefined {
  const [forced] = useState<DecodeStrategy | undefined>(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    return parseForcedStrategy(window.location.search);
  });

  return forced;
}
