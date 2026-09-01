import {
  useActiveTemporalTagFilterValues,
  useTemporalTagColor,
  useTemporalTagsFieldActive,
} from "@fiftyone/state";
import React, { useMemo } from "react";
import type {
  EpisodeInterval,
  EpisodeIntervalContribution,
  EpisodeIntervalSource,
  EpisodeIntervalSourceProps,
} from "../extensions/episode-intervals";
import type { TemporalTag } from "../temporal-tags";
import { useSampleRendererTemporalTags } from "../temporal-tags";

const SOURCE_ID = "fiftyone:temporal-tags";
const INACTIVE: EpisodeIntervalContribution = { intervals: [] };

/**
 * The one open-source episode-interval source. Enabling the temporal-tags
 * pseudo-field contributes every interval on the sample, matching the
 * sample-tags parent checkbox; selecting child filter values narrows it to
 * those values. Contributes nothing, and fetches nothing, when neither is
 * active — this outer gate is what keeps an unfiltered grid from issuing a tag
 * request per tile.
 */
const TemporalTagIntervalSourceComponent: React.FC<
  EpisodeIntervalSourceProps
> = ({ ctx, children }) => {
  const activeValues = useActiveTemporalTagFilterValues();
  const fieldActive = useTemporalTagsFieldActive();
  if (!fieldActive && activeValues.length === 0) {
    return <>{children(INACTIVE)}</>;
  }
  return (
    <TemporalTagIntervals
      activeValues={activeValues}
      ctx={ctx}
      showAll={fieldActive}
    >
      {children}
    </TemporalTagIntervals>
  );
};

const TemporalTagIntervals: React.FC<
  EpisodeIntervalSourceProps & {
    readonly activeValues: readonly string[];
    readonly showAll: boolean;
  }
> = ({ activeValues, children, ctx, showAll }) => {
  const { temporalTags } = useSampleRendererTemporalTags(ctx);
  const colorForTag = useTemporalTagColor();

  const contribution = useMemo<EpisodeIntervalContribution>(() => {
    // The whole sample's extent, including tags the filter excluded, so
    // narrowing a filter doesn't rescale the tile's time axis.
    let domainEndNs = 0;
    const byTag = new Map<string, TemporalTag[]>();
    for (const tag of temporalTags) {
      if (tag.end > domainEndNs) domainEndNs = tag.end;
      const group = byTag.get(tag.tag) ?? [];
      group.push(tag);
      byTag.set(tag.tag, group);
    }

    const displayed = showAll ? [...byTag.keys()] : activeValues;
    const intervals: EpisodeInterval[] = [];
    for (const eventName of displayed) {
      const group = byTag.get(eventName);
      if (!group) continue;
      const color = colorForTag(eventName);
      for (const tag of group) {
        intervals.push({
          sourceId: SOURCE_ID,
          eventName,
          color,
          startNs: tag.start,
          endNs: tag.end,
        });
      }
    }

    return {
      intervals,
      // Only an explicit filter selection pins; merely enabling the field
      // shows the lane without pinning every tag in the modal.
      pinnedEventNames: activeValues,
      domainEndNs,
    };
  }, [activeValues, colorForTag, showAll, temporalTags]);

  return <>{children(contribution)}</>;
};

/** Registered by the consumers as a built-in, not through the registry. */
export const temporalTagIntervalSource: EpisodeIntervalSource = {
  id: SOURCE_ID,
  label: "Temporal tags",
  order: 200,
  Component: TemporalTagIntervalSourceComponent,
};
