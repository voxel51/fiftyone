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
import { AdjacentSamplePrewarm } from "../playback/AdjacentSamplePrewarm";
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
  const { byteSource: source, episodeSource } = useStableEpisodeSource(ctx);
  const sampleDescriptor = sampleDescriptorFromContext(ctx);
  const sessionState = useEpisodeSession(sampleDescriptor, episodeSource);
  const timeRange = useTimeRange(sessionState.session);
  const fileName = sourceDisplayName(ctx.media.path) ?? "recording";
  const datasetId = ctx.dataset.datasetId;
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
            fileName={fileName}
            layoutScopeKey={datasetId}
            cameraPreferenceField={ctx.media.field}
            onTagCreate={onTagCreate}
            onTagUpdate={onTagUpdate}
            onTagDelete={
              onTagDelete
                ? (event) => {
                    void onTagDelete(event);
                  }
                : undefined
            }
            onTimelineDrawerOpenChange={onDrawerOpenChange}
            timelineDrawerMaxSize={preferences.drawerMaxSize}
            navigationPending={ctx.transitioning === true}
            session={sessionState.session}
            sessionError={sessionState.error}
            source={source}
            tracks={tracks}
          >
            <AdjacentSamplePrewarm ctx={ctx} />
            {runtime}
          </SourcePlayback>
        )}
      </TimelineExtensionHost>
    </AnnotationStreamsProvider>
  );
};

export default ModalRenderer;
