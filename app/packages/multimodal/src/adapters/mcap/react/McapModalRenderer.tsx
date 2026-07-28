import type { SampleRendererProps } from "@fiftyone/plugins";
import React, { useMemo } from "react";
import {
  McapAnnotationTopicsProvider,
  McapTimelineExtensionHost,
  type McapTimelineSection,
} from "../../../extensions/mcap";
import { McapAdjacentSamplePrewarm } from "./McapAdjacentSamplePrewarm";
import { McapSourcePlayback } from "./McapSourcePlayback";
import { mcapSourceDisplayName } from "./mcap-source-display-name";
import { useMcapResourceClient } from "./use-mcap-resource-client";
import {
  useFilteredTemporalTagPinnedIds,
  useMcapTemporalTags,
} from "./use-mcap-temporal-tags";
import { useStableMcapSource } from "./use-stable-mcap-source";

/**
 * SampleRenderer wrapper for `.mcap` files. It translates the sample renderer
 * context into a byte source, then delegates the actual playback shell to the
 * source-oriented host shared with the ad hoc MCAP panel.
 */
const McapModalRenderer: React.FC<SampleRendererProps> = ({ ctx }) => {
  const client = useMcapResourceClient({ worker: true });
  const source = useStableMcapSource(ctx);
  const fileName = mcapSourceDisplayName(ctx.media.path) ?? "recording.mcap";
  const datasetId = ctx.dataset.datasetId;
  const {
    tracks: tagTracks,
    onTagCreate,
    onTagUpdate,
    onTagDelete,
  } = useMcapTemporalTags(ctx);
  // Auto-pin the timeline tracks for the temporal tags the grid was filtered
  // by, so opening a filtered sample surfaces the relevant tags immediately.
  const defaultPinnedTrackIds = useFilteredTemporalTagPinnedIds();
  const builtInSections = useMemo<readonly McapTimelineSection[]>(
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
    <McapAnnotationTopicsProvider>
      <McapTimelineExtensionHost
        builtInSections={builtInSections}
        client={client}
        ctx={ctx}
        layoutScopeKey={datasetId}
        navigationPending={ctx.transitioning === true}
        source={source}
      >
        {({
          decorateTrack,
          onDrawerOpenChange,
          preferences,
          runtime,
          tracks,
        }) => (
          <McapSourcePlayback
            client={client}
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
            source={source}
            tracks={tracks}
          >
            <McapAdjacentSamplePrewarm ctx={ctx} />
            {runtime}
          </McapSourcePlayback>
        )}
      </McapTimelineExtensionHost>
    </McapAnnotationTopicsProvider>
  );
};

export default McapModalRenderer;
