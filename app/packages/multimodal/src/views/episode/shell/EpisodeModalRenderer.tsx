import type { SampleRendererProps } from "@fiftyone/plugins";
import React, { useMemo } from "react";
import { sampleDescriptorFromContext } from "../../session/episode-source";
import { useEpisodeSession } from "../../session/use-episode-session";
import { useStableEpisodeSource } from "../../session/use-stable-episode-source";
import {
  AnnotationStreamsProvider,
  TimelineExtensionHost,
  type TimelineSection,
} from "../../../extensions/timeline";
import { EpisodeAdjacentSamplePrewarm } from "../playback/EpisodeAdjacentSamplePrewarm";
import { EpisodeSourcePlayback } from "./EpisodeSourcePlayback";
import { episodeSourceDisplayName } from "./episode-source-display-name";
import {
  useFilteredTemporalTagPinnedIds,
  useEpisodeTemporalTags,
} from "../playback/use-episode-temporal-tags";
import { useEpisodeTimeRange } from "../playback/use-episode-time-range";

/**
 * SampleRenderer wrapper for episode media. It translates the sample renderer
 * context into a byte source, then delegates the actual playback shell to the
 * source-oriented host shared with the ad hoc episode panel.
 */
const EpisodeModalRenderer: React.FC<SampleRendererProps> = ({ ctx }) => {
  const { byteSource: source, episodeSource } = useStableEpisodeSource(ctx);
  const sampleDescriptor = sampleDescriptorFromContext(ctx);
  const sessionState = useEpisodeSession(sampleDescriptor, episodeSource);
  const timeRange = useEpisodeTimeRange(sessionState.session);
  const fileName = episodeSourceDisplayName(ctx.media.path) ?? "recording";
  const datasetId = ctx.dataset.datasetId;
  const {
    tracks: tagTracks,
    onTagCreate,
    onTagUpdate,
    onTagDelete,
  } = useEpisodeTemporalTags(ctx);
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

  return (
    <AnnotationStreamsProvider>
      <TimelineExtensionHost
        builtInSections={builtInSections}
        ctx={ctx}
        layoutScopeKey={datasetId}
        navigationPending={ctx.transitioning === true}
        timeRange={timeRange}
      >
        {({
          decorateTrack,
          onDrawerOpenChange,
          preferences,
          runtime,
          tracks,
        }) => (
          <EpisodeSourcePlayback
            defaultPinnedTrackIds={defaultPinnedTrackIds}
            decorateTrack={decorateTrack}
            fileName={fileName}
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
            tracks={tracks}
          >
            <EpisodeAdjacentSamplePrewarm ctx={ctx} />
            {runtime}
          </EpisodeSourcePlayback>
        )}
      </TimelineExtensionHost>
    </AnnotationStreamsProvider>
  );
};

export default EpisodeModalRenderer;
