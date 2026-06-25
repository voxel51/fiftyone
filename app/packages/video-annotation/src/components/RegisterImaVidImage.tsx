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
import { ImaVidImageStream } from "../streams/ImaVidImageStream";
import { usePublishImaVidImageStream } from "../streams/imaVidImageStreamHandle";

/**
 * Construct and register `ImaVidImageStream` as soon as the sample's
 * params resolve. The image stream contributes `duration = frameCount/fps`
 * back to the engine, which is what unblocks `RegisterFrameLabels`
 * downstream — in the native-video tile the `<video>` element plays
 * this role via `useVideoStream`.
 *
 * `frameCount` and `frameRate` are resolved + validated upstream by
 * `useAnnotatePrerequisites` (which gates this component behind a
 * "compute metadata" prompt when they're absent), so they arrive as
 * positive finite numbers — no resolution or throwing here.
 *
 * Re-keys on any identity change so a fresh stream replaces the old
 * one via `usePlaybackStream`'s standard cleanup.
 */
export const RegisterImaVidImage: React.FC<{
  frameCount: number;
  frameRate: number;
  children: React.ReactNode;
}> = ({ frameCount, frameRate, children }) => {
  const dataset = useDatasetName();
  const view = useView();
  const slice = useGroupSlice();
  const sampleId = useModalSampleId();

  const ready = !!sampleId && !!dataset;
  if (!ready) {
    return <>{children}</>;
  }

  const key = `${sampleId}|${dataset}|${
    slice ?? ""
  }|${frameRate}|${frameCount}`;

  return (
    <ImaVidImageRegistration
      key={key}
      sampleId={sampleId}
      dataset={dataset}
      view={view}
      groupSlice={slice ?? null}
      frameCount={frameCount}
      frameRate={frameRate}
    >
      {children}
    </ImaVidImageRegistration>
  );
};

interface ImaVidImageRegistrationProps {
  sampleId: string;
  dataset: string;
  view: Stage[];
  groupSlice: string | null;
  frameCount: number;
  frameRate: number;
  children: React.ReactNode;
}

const ImaVidImageRegistration: React.FC<ImaVidImageRegistrationProps> = ({
  children,
  ...props
}) => {
  const streamRef = useRef<ImaVidImageStream | null>(null);
  if (streamRef.current === null) {
    streamRef.current = new ImaVidImageStream({
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
  // registration's cleanup (LIFO order): the engine unregisters the
  // stream first, then we terminate the worker.
  useEffect(() => {
    const stream = streamRef.current;

    return () => {
      stream?.destroy();
    };
  }, []);

  usePlaybackStream(streamRef.current);

  // Publish the stream instance so off-tile consumers
  // can pull arbitrary frame bitmaps by index via warmup/getValue.
  usePublishImaVidImageStream(streamRef.current);

  // Pre-warm the first chunk and seek to t=0 so the first paint isn't
  // a blank tile waiting on the network + decode.
  useWarmupThenSeek(streamRef.current);

  return <>{children}</>;
};
