import type { Stage } from "@fiftyone/utilities";
import React, { useEffect, useRef } from "react";
import { usePlaybackStream } from "@fiftyone/playback";
import { useWarmupThenSeek } from "../hooks/useWarmupThenSeek";
import {
  useDatasetName,
  useGroupSlice,
  useModalSampleId,
  useView,
} from "../state/accessors";
import { IMAVID_STREAM_ID } from "../utils/ids";
import type { FrameBitmapStream } from "../streams/frameBitmapStream";
import { ImaVidImageStream } from "../streams/ImaVidImageStream";
import { NativeVideoFrameStream } from "../streams/NativeVideoFrameStream";
import { usePublishImaVidImageStream } from "../streams/imaVidImageStreamHandle";

/** How the per-frame bitmaps are sourced for the ImaVid tile. */
export type DecodeMode = "frames" | "native";

/**
 * Construct and register the ImaVid-tile frame stream as soon as the sample's
 * params resolve. The stream contributes `duration = frameCount/fps` back to
 * the engine, which unblocks `RegisterFrameLabels` downstream.
 *
 * Two bitmap sources, same tile + engine-clock lock-step (see
 * {@link FrameBitmapStream}):
 * - `frames` (default): `POST /frames` over `to_frames(sample_frames=True)`.
 * - `native`: on-demand WebCodecs decode of the source video (no `to_frames`),
 *   used when `?decode=native` AND the browser has `VideoDecoder` AND a video
 *   URL resolved; otherwise falls back to `frames`.
 *
 * `frameCount` / `frameRate` are resolved + validated upstream by
 * `useAnnotatePrerequisites`, so they arrive as positive finite numbers.
 *
 * Re-keys on any identity change (incl. decode mode) so a fresh stream replaces
 * the old one via `usePlaybackStream`'s standard cleanup.
 */
export const RegisterImaVidImage: React.FC<{
  frameCount: number;
  frameRate: number;
  decodeMode?: DecodeMode;
  videoSrc?: string | null;
  children: React.ReactNode;
}> = ({
  frameCount,
  frameRate,
  decodeMode = "frames",
  videoSrc = null,
  children,
}) => {
  const dataset = useDatasetName();
  const view = useView();
  const slice = useGroupSlice();
  const sampleId = useModalSampleId();

  const ready = !!sampleId && !!dataset;
  if (!ready) {
    return <>{children}</>;
  }

  const useNative =
    decodeMode === "native" && !!videoSrc && nativeDecodeSupported();
  const source: DecodeMode = useNative ? "native" : "frames";

  const key = `${source}|${sampleId}|${dataset}|${
    slice ?? ""
  }|${frameRate}|${frameCount}`;

  return (
    <ImaVidImageRegistration
      key={key}
      source={source}
      sampleId={sampleId}
      dataset={dataset}
      view={view}
      groupSlice={slice ?? null}
      frameCount={frameCount}
      frameRate={frameRate}
      videoSrc={videoSrc}
    >
      {children}
    </ImaVidImageRegistration>
  );
};

interface ImaVidImageRegistrationProps {
  source: DecodeMode;
  sampleId: string;
  dataset: string;
  view: Stage[];
  groupSlice: string | null;
  frameCount: number;
  frameRate: number;
  videoSrc: string | null;
  children: React.ReactNode;
}

const ImaVidImageRegistration: React.FC<ImaVidImageRegistrationProps> = ({
  children,
  ...props
}) => {
  const streamRef = useRef<FrameBitmapStream | null>(null);
  if (streamRef.current === null) {
    streamRef.current =
      props.source === "native" && props.videoSrc
        ? new NativeVideoFrameStream({
            id: IMAVID_STREAM_ID,
            sampleId: props.sampleId,
            frameCount: props.frameCount,
            frameRate: props.frameRate,
            videoSrc: props.videoSrc,
          })
        : new ImaVidImageStream({
            id: IMAVID_STREAM_ID,
            sampleId: props.sampleId,
            dataset: props.dataset,
            view: props.view,
            groupSlice: props.groupSlice,
            frameCount: props.frameCount,
            frameRate: props.frameRate,
          });
  }

  // Tear down the worker on unmount. The effect is declared BEFORE
  // `usePlaybackStream` so React runs its cleanup AFTER the playback
  // registration's cleanup (LIFO): the engine unregisters the stream first,
  // then we terminate the worker.
  useEffect(() => {
    const stream = streamRef.current;

    return () => {
      stream?.destroy();
    };
  }, []);

  usePlaybackStream(streamRef.current);

  // Publish the stream instance so off-tile consumers can pull arbitrary frame
  // bitmaps by index via warmup/getValue.
  usePublishImaVidImageStream(streamRef.current);

  // Pre-warm the first chunk and seek to t=0 so the first paint isn't a blank
  // tile waiting on the network + decode.
  useWarmupThenSeek(streamRef.current);

  return <>{children}</>;
};

/** WebCodecs presence gate. Codec support is confirmed later, worker-side. */
function nativeDecodeSupported(): boolean {
  return typeof window !== "undefined" && "VideoDecoder" in window;
}
