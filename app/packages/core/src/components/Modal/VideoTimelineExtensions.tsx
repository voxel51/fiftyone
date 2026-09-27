/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  TimelineExtensionHost,
  useSampleRendererFirstMatch,
  type TimelineComposition,
  type TimelineSection,
} from "@fiftyone/multimodal/extensions/timeline";
import { type Track, useDuration, usePlayback } from "@fiftyone/playback";
import { createSampleRendererRenderContext } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import { FrameLabelsTracks } from "@fiftyone/video-annotation";
import React, { useEffect, useMemo, useRef } from "react";

const NO_SECTIONS: readonly TimelineSection[] = [];

const NO_EXTENSIONS: TimelineComposition = {
  decorateTrack: () => ({}),
  preferences: {},
  runtime: null,
  tracks: [],
};

const NO_TRACKS: readonly Track[] = [];

type TracksProps = Omit<
  React.ComponentProps<typeof FrameLabelsTracks>,
  "decorateAdditionalTrack" | "rulerOverlay" | "runtime"
>;

/** The timeline, with the extensions' rows after the host's own. */
const ExtendedTracks: React.FC<
  TracksProps & { composition: TimelineComposition }
> = ({ composition, additionalTracks = NO_TRACKS, ...props }) => {
  const tracks = useMemo(
    () => [...additionalTracks, ...composition.tracks],
    [additionalTracks, composition.tracks],
  );
  return (
    <FrameLabelsTracks
      {...props}
      additionalTracks={tracks}
      decorateAdditionalTrack={composition.decorateTrack}
      rulerOverlay={composition.rulerOverlay}
      runtime={composition.runtime}
    />
  );
};

/**
 * The video modal's read-only timeline, running the registered timeline
 * extensions over it, a video being an episode with one stream, and opening
 * it at its first matched window. Must render inside the surface's
 * `PlaybackProvider`.
 */
export const VideoTimelineExtensions: React.FC<
  TracksProps & { sample: fos.ModalSample }
> = (props) => {
  const { sample } = props;
  const dataset = fos.useCurrentDataset();
  const schema = fos.useModalSampleSchema();
  const mediaField = fos.useSelectedMediaFieldModal();
  const durationSec = useDuration();

  const sampleId = sample.sample._id;
  const identity = useMemo(
    () => ({ sample: { sample: { _id: sampleId } } }),
    [sampleId],
  );
  const firstMatch = useSampleRendererFirstMatch(identity);
  const { seek } = usePlayback();
  const seeked = useRef<string | null>(null);
  useEffect(() => {
    // A seek before the duration is known clamps to the start
    if (!firstMatch || durationSec <= 0 || seeked.current === sampleId) return;
    seeked.current = sampleId;
    seek(Number(firstMatch.startNs) / 1e9);
  }, [seek, durationSec, firstMatch, sampleId]);

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

  const renderTracks = (composition: TimelineComposition) => (
    <ExtendedTracks {...props} composition={composition} />
  );
  if (!ctx) return renderTracks(NO_EXTENSIONS);
  return (
    <TimelineExtensionHost
      builtInSections={NO_SECTIONS}
      ctx={ctx}
      layoutScopeKey={ctx.dataset.datasetId}
      navigationPending={false}
      session={null}
      timeRange={timeRange}
    >
      {renderTracks}
    </TimelineExtensionHost>
  );
};
