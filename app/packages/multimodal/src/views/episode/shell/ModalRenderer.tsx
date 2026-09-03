import type { SampleRendererProps } from "@fiftyone/plugins";
import React, { useEffect, useMemo } from "react";
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
import {
  EpisodeIntervalSources,
  intervalPinnedTrackIds,
  intervalTimelineSections,
  type ResolvedEpisodeIntervals,
} from "../../../extensions/episode-intervals";
import { publishEpisodeTimeRange } from "../../../runtime";
import { SourcePlayback } from "./SourcePlayback";
import { sourceDisplayName } from "./source-display-name";
import {
  useFilteredTemporalTagPinnedIds,
  useTemporalTags,
} from "../playback/use-temporal-tags";
import { useTimeRange } from "../playback/use-time-range";

/**
 * SampleRenderer wrapper for episode media. Registered episode-interval
 * sources are mounted first, so their sections and pin ids are available to
 * the shell below; temporal tags are deliberately not among them, since they
 * already have their own section carrying the create / update / delete
 * behavior the read-only interval shape has no room for.
 */
const ModalRenderer: React.FC<SampleRendererProps> = ({ ctx }) => (
  <EpisodeIntervalSources ctx={ctx}>
    {(intervalSources) => (
      <EpisodeModal ctx={ctx} intervalSources={intervalSources} />
    )}
  </EpisodeIntervalSources>
);

const EpisodeModal: React.FC<
  SampleRendererProps & {
    readonly intervalSources: readonly ResolvedEpisodeIntervals[];
  }
> = ({ ctx, intervalSources }) => {
  // Translates the sample renderer context into a byte source, then delegates
  // the playback shell to the source-oriented host shared with the ad hoc
  // episode panel.
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
  // The modal resolves the episode's axis from its own session rather than
  // from a grid preview read, so it has to publish it: a modal opened
  // directly — deep link, or a tile whose preview never ran — would otherwise
  // leave every interval source without an origin to rebase onto.
  useEffect(() => {
    if (!timeRange) return;
    publishEpisodeTimeRange(sampleId, timeRange);
  }, [sampleId, timeRange]);
  const {
    tracks: tagTracks,
    existingTags,
    onTagCreate,
    onTagUpdate,
    onTagDelete,
  } = useTemporalTags(ctx);
  // Auto-pin the timeline tracks for whatever the grid was filtered by — the
  // temporal tags, and every event name a registered interval source reports —
  // so opening a filtered sample surfaces the matching rows immediately.
  const tagPinnedTrackIds = useFilteredTemporalTagPinnedIds();
  const defaultPinnedTrackIds = useMemo(
    () => [...tagPinnedTrackIds, ...intervalPinnedTrackIds(intervalSources)],
    [intervalSources, tagPinnedTrackIds],
  );
  const builtInSections = useMemo<readonly TimelineSection[]>(
    () => [
      {
        id: "fiftyone:temporal-tags",
        label: "Temporal tags",
        order: 200,
        tracks: tagTracks,
      },
      ...intervalTimelineSections(intervalSources),
    ],
    [intervalSources, tagTracks],
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
            existingTags={existingTags}
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
