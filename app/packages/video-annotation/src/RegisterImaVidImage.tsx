import type { ModalSample } from "@fiftyone/state";
import {
  datasetName,
  groupSlice,
  modalSampleId,
  view as viewAtom,
} from "@fiftyone/state";
import type { Stage } from "@fiftyone/utilities";
import React, { useEffect, useRef } from "react";
import { useRecoilValue } from "recoil";
import { usePlayback } from "../../playback/src/lib/playback/PlaybackProvider";
import { usePlaybackStream } from "../../playback/src/lib/playback/use-playback-stream";
import { IMAVID_STREAM_ID } from "./ids";
import { ImaVidImageStream } from "./ImaVidImageStream";

/**
 * Construct and register `ImaVidImageStream` as soon as the sample's
 * params resolve. The image stream contributes `duration = frameCount/fps`
 * back to the engine, which is what unblocks `RegisterFrameLabels`
 * downstream — in the native-video tile the `<video>` element plays
 * this role via `useVideoStream`.
 *
 * fps comes from `sample.frameRate` (GraphQL-hoisted from
 * `VideoMetadata.frame_rate`); frameCount comes from
 * `sample.sample.metadata.total_frame_count` and falls back to
 * `metadata.duration * frameRate`. Both fps and frameCount throw if
 * absent — the plan explicitly forbids silent defaults because the
 * failure mode (misaligned frames or a stuck timeline) is hard to
 * debug after the fact.
 *
 * Re-keys on any identity change so a fresh stream replaces the old
 * one via `usePlaybackStream`'s standard cleanup.
 */
export const RegisterImaVidImage: React.FC<{
  sample: ModalSample;
  children: React.ReactNode;
}> = ({ sample, children }) => {
  const dataset = useRecoilValue(datasetName);
  const view = useRecoilValue(viewAtom);
  const slice = useRecoilValue(groupSlice);
  const sampleId = useRecoilValue(modalSampleId);

  const frameRate = sample.frameRate;
  if (frameRate === undefined || frameRate === null) {
    throw new Error(
      "ImaVid playback requires VideoMetadata.frame_rate to be set on the sample"
    );
  }
  if (!Number.isFinite(frameRate) || frameRate <= 0) {
    throw new Error(
      `ImaVid playback requires a positive, finite fps (got ${frameRate})`
    );
  }

  const frameCount = resolveFrameCount(sample, frameRate);

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
      view={view ?? []}
      groupSlice={slice ?? null}
      frameCount={frameCount}
      frameRate={frameRate}
    >
      {children}
    </ImaVidImageRegistration>
  );
};

/**
 * Read total frame count from sample.metadata. The `Sample` TS type
 * only declares `width / height / mime_type`, but VideoMetadata
 * persists `total_frame_count` and `duration` at runtime — we
 * loose-cast through.
 */
function resolveFrameCount(sample: ModalSample, frameRate: number): number {
  const metadata = (sample.sample as { metadata?: Record<string, unknown> })
    ?.metadata;

  const total = metadata?.total_frame_count;
  if (typeof total === "number" && Number.isFinite(total) && total > 0) {
    return Math.round(total);
  }

  const duration = metadata?.duration;
  if (
    typeof duration === "number" &&
    Number.isFinite(duration) &&
    duration > 0
  ) {
    return Math.max(1, Math.round(duration * frameRate));
  }

  throw new Error(
    "ImaVid playback requires VideoMetadata.total_frame_count (or .duration) on the sample"
  );
}

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

  usePlaybackStream(streamRef.current);

  // Pre-warm the first chunk and seek to t=0 so the first paint isn't
  // a blank tile waiting on the network + decode.
  const { seek } = usePlayback();

  useEffect(() => {
    let cancelled = false;
    void streamRef.current!.warmup(0).then(() => {
      if (!cancelled) seek(0);
    });

    return () => {
      cancelled = true;
    };
  }, [seek]);

  return <>{children}</>;
};
