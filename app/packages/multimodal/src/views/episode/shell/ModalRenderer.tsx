import type { SampleRendererProps } from "@fiftyone/plugins";
import React, { useMemo } from "react";
import { sampleDescriptorFromContext } from "../../session/episode-source";
import { useEpisodeSession } from "../../session/use-episode-session";
import { useStableEpisodeSource } from "../../session/use-stable-episode-source";
import { episodeDisplayName } from "../../session/episode-label";
import {
  AnnotationStreamsProvider,
  TimelineExtensionHost,
  useSampleRendererFirstMatch,
  type TimelineSection,
} from "../../../extensions/timeline";
import { SourcePlayback } from "./SourcePlayback";
import { sourceDisplayName } from "./source-display-name";
import {
  useFilteredTemporalTagPinnedIds,
  useTemporalTags,
} from "../playback/use-temporal-tags";
import { useTimeRange } from "../playback/use-time-range";

/**
 * SampleRenderer wrapper for episode media. It translates the sample renderer
 * context into a byte source, then delegates the actual playback shell to the
 * source-oriented host shared with the ad hoc episode panel.
 */
const ModalRenderer: React.FC<SampleRendererProps> = ({ ctx }) => {
  const {
    byteSource: source,
    episodeSource,
    sourceFactsScope,
  } = useStableEpisodeSource(ctx);
  const sampleDescriptor = sampleDescriptorFromContext(ctx);
  const sessionState = useEpisodeSession(sampleDescriptor, episodeSource);
  const timeRange = useTimeRange(sessionState.session);
  const fileName =
    episodeDisplayName(ctx.sample.sample) ??
    sourceDisplayName(ctx.media.path) ??
    "recording";
  const datasetId = ctx.dataset.datasetId;
  const sampleId = ctx.sample.sample._id;
  const {
    tracks: tagTracks,
    onTagCreate,
    onTagUpdate,
    onTagDelete,
  } = useTemporalTags(ctx);
  // Auto-pin the timeline tracks for the temporal tags the grid was filtered
  // by, so opening a filtered sample surfaces the relevant tags immediately.
  const defaultPinnedTrackIds = useFilteredTemporalTagPinnedIds();
  const builtInSections = useMemo<readonly TimelineSection[]>(
    () => [
      {
        id: "fiftyone:temporal-tags",
        label: "Temporal tags",
        order: 200,
        tracks: tagTracks,
      },
    ],
    [tagTracks],
  );

  // Opening a tile the embeddings panel matched lands the playhead on the same
  // window the tile postered at, rather than the recording start.
  const firstMatch = useSampleRendererFirstMatch(ctx);

  return (
    <AnnotationStreamsProvider>
      <TimelineExtensionHost
        builtInSections={builtInSections}
        ctx={ctx}
        layoutScopeKey={datasetId}
        navigationPending={ctx.transitioning === true}
        session={sessionState.session}
        timeRange={timeRange}
      >
        {({
          decorateTrack,
          onDrawerOpenChange,
          preferences,
          runtime,
          tracks,
        }) => (
          <SourcePlayback
            defaultPinnedTrackIds={defaultPinnedTrackIds}
            decorateTrack={decorateTrack}
            episodeContext={{ datasetId, sampleId }}
            fileName={fileName}
            initialSeekTimeNs={firstMatch?.startNs ?? null}
            layoutScopeKey={datasetId}
            cameraPreferenceField={ctx.media.field}
            onTagCreate={onTagCreate}
            onTagUpdate={onTagUpdate}
            onTagDelete={onTagDelete}
            onTimelineDrawerOpenChange={onDrawerOpenChange}
            timelineDrawerMaxSize={preferences.drawerMaxSize}
            navigationPending={ctx.transitioning === true}
            session={sessionState.session}
            sessionError={sessionState.error}
            source={source}
            sourceFactsScope={sourceFactsScope}
            tracks={tracks}
          >
            {runtime}
          </SourcePlayback>
        )}
      </TimelineExtensionHost>
    </AnnotationStreamsProvider>
  );
};

export default ModalRenderer;
