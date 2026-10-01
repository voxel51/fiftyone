/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useEffect, useState } from "react";
import { probeNativeDecode } from "../streams/probeNativeDecode";
import { nativeDecodeCache } from "../utils/nativeDecodeCache";
import {
  looksDemuxable,
  webCodecsAvailable,
} from "../utils/nativeDecodeSupport";

export interface NativeDecodableState {
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
export function useNativeDecodable(
  input: NativeDecodableInput,
): NativeDecodableState {
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
