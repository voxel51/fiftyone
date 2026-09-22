import type { Stage } from "@fiftyone/utilities";
import React, { useEffect, useRef } from "react";
import { usePlaybackStream } from "@fiftyone/playback";
import { useWarmupThenSeek } from "../hooks/useWarmupThenSeek";
import {
  useDatasetName,
  useDynamicGroupValue,
  useGroupSlice,
  useModalMediaField,
  useModalSampleId,
  useView,
} from "../state/accessors";
import { DYNAMIC_GROUP_STREAM_ID } from "../utils/ids";
import type { FrameBitmapStream } from "../streams/frameBitmapStream";
import { DynamicGroupImageStream } from "../streams/DynamicGroupImageStream";
import { NativeVideoFrameStream } from "../streams/NativeVideoFrameStream";
import { usePublishDynamicGroupImageStream } from "../streams/dynamicGroupImageStreamHandle";

/**
 * The two dynamic group tile bitmap sources. Which one is chosen is decided
 * upstream by {@link useDecodeStrategy} — this registrar just constructs it.
 *
 * - `fetch` — `POST /frames` over `to_frames(sample_frames=True)` images.
 * - `extract` — on-demand WebCodecs decode of the source video (no `to_frames`).
 */
export type DynamicGroupImageSource = "fetch" | "extract";

/**
 * Construct and register the dynamic group frame stream as soon as the sample's
 * params resolve. The stream contributes `duration = frameCount/fps` back to
 * the engine, which unblocks `RegisterFrameLabels` downstream.
 *
 * Both sources feed the same tile + engine-clock lock-step (see
 * {@link FrameBitmapStream}); `extract` additionally needs a `videoSrc`.
 * `frameCount` / `frameRate` are resolved + validated upstream by
 * `useAnnotatePrerequisites`, so they arrive as positive finite numbers.
 *
 * Re-keys on any identity change (incl. `source`) so a fresh stream replaces
 * the old one via `usePlaybackStream`'s standard cleanup.
 */
export const RegisterDynamicGroupImage: React.FC<{
  source: DynamicGroupImageSource;
  frameCount: number;
  frameRate: number;
  videoSrc?: string | null;
  children: React.ReactNode;
}> = ({ source, frameCount, frameRate, videoSrc = null, children }) => {
  const dataset = useDatasetName();
  const view = useView();
  const slice = useGroupSlice();
  const sampleId = useModalSampleId();

  // Identifies which dynamic group `/frames` returns ordered samples for
  // (null outside a dynamic group).
  const dynamicGroup = useDynamicGroupValue();
  const mediaField = useModalMediaField();

  const ready = !!sampleId && !!dataset;
  if (!ready) {
    return <>{children}</>;
  }

  const key = `${source}|${sampleId}|${dataset}|${slice ?? ""}|${
    dynamicGroup ?? ""
  }|${frameRate}|${frameCount}|${mediaField}`;

  return (
    <DynamicGroupImageRegistration
      key={key}
      source={source}
      sampleId={sampleId}
      dataset={dataset}
      view={view}
      groupSlice={slice ?? null}
      dynamicGroup={dynamicGroup}
      mediaField={mediaField}
      frameCount={frameCount}
      frameRate={frameRate}
      videoSrc={videoSrc}
    >
      {children}
    </DynamicGroupImageRegistration>
  );
};

interface DynamicGroupImageRegistrationProps {
  source: DynamicGroupImageSource;
  sampleId: string;
  dataset: string;
  view: Stage[];
  groupSlice: string | null;
  dynamicGroup: string | null;
  mediaField: string;
  frameCount: number;
  frameRate: number;
  videoSrc: string | null;
  children: React.ReactNode;
}

const DynamicGroupImageRegistration: React.FC<
  DynamicGroupImageRegistrationProps
> = ({ children, ...props }) => {
  const streamRef = useRef<FrameBitmapStream | null>(null);
  if (streamRef.current === null) {
    streamRef.current =
      props.source === "extract" && props.videoSrc
        ? new NativeVideoFrameStream({
            id: DYNAMIC_GROUP_STREAM_ID,
            sampleId: props.sampleId,
            frameCount: props.frameCount,
            frameRate: props.frameRate,
            videoSrc: props.videoSrc,
          })
        : new DynamicGroupImageStream({
            id: DYNAMIC_GROUP_STREAM_ID,
            sampleId: props.sampleId,
            dataset: props.dataset,
            view: props.view,
            groupSlice: props.groupSlice,
            dynamicGroup: props.dynamicGroup,
            mediaField: props.mediaField,
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
  usePublishDynamicGroupImageStream(streamRef.current);

  // Pre-warm the first chunk and seek to t=0 so the first paint isn't a blank
  // tile waiting on the network + decode.
  useWarmupThenSeek(streamRef.current);

  return <>{children}</>;
};
