/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  TimelineExtensionHost,
  useSampleRendererFirstMatch,
  type TimelineComposition,
  type TimelineSection,
} from "@fiftyone/multimodal/extensions/timeline";
import { useDuration, usePlayback } from "@fiftyone/playback";
import { createSampleRendererRenderContext } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import React, { useEffect, useMemo, useRef } from "react";

const NO_SECTIONS: readonly TimelineSection[] = [];

const NO_EXTENSIONS: TimelineComposition = {
  decorateTrack: () => ({}),
  preferences: {},
  runtime: null,
  tracks: [],
};

/**
 * Opens a video the embeddings panel matched at its first matched window, as
 * the episode modal does, once per sample and only after the clip's duration
 * is known, since a seek before then clamps to the start.
 */
function useSeekToFirstMatchOnOpen(sampleId: string, durationSec: number) {
  const identity = useMemo(
    () => ({ sample: { sample: { _id: sampleId } } }),
    [sampleId],
  );
  const firstMatch = useSampleRendererFirstMatch(identity);
  const { seek } = usePlayback();
  const seeked = useRef<string | null>(null);
  useEffect(() => {
    if (!firstMatch || durationSec <= 0 || seeked.current === sampleId) return;
    seeked.current = sampleId;
    seek(Number(firstMatch.startNs) / 1e9);
  }, [seek, durationSec, firstMatch, sampleId]);
}

/**
 * Runs the registered timeline extensions for the video modal, as the
 * multimodal episode timeline does, so a video's timeline gets the same rows
 * and ruler overlays (a video is an episode with one stream). The video's own
 * rows stay `FrameLabelsTracks`'; the extensions' arrive through `children`.
 *
 * Must render inside the surface's `PlaybackProvider`: the time range is the
 * playback's duration, starting at 0.
 */
export const VideoTimelineExtensions: React.FC<{
  sample: fos.ModalSample;
  children: (composition: TimelineComposition) => React.ReactNode;
}> = ({ sample, children }) => {
  const dataset = fos.useCurrentDataset();
  const schema = fos.useModalSampleSchema();
  const mediaField = fos.useSelectedMediaFieldModal();
  const durationSec = useDuration();
  useSeekToFirstMatchOnOpen(sample.sample._id, durationSec);

  const ctx = useMemo(
    () =>
      dataset
        ? createSampleRendererRenderContext(
            sample,
            mediaField,
            dataset,
            schema,
            "modal",
          )
        : null,
    [sample, mediaField, dataset, schema],
  );
  const timeRange = useMemo(
    () => ({
      startNs: 0n,
      endNs: BigInt(Math.round(Math.max(durationSec, 0) * 1e9)),
    }),
    [durationSec],
  );

  if (!ctx) return <>{children(NO_EXTENSIONS)}</>;
  return (
    <TimelineExtensionHost
      builtInSections={NO_SECTIONS}
      ctx={ctx}
      layoutScopeKey={ctx.dataset.datasetId}
      navigationPending={false}
      session={null}
      timeRange={timeRange}
    >
      {children}
    </TimelineExtensionHost>
  );
};
