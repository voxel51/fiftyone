import type { TimelineWithTracksProps, Track } from "@fiftyone/playback";
import { useCallback, useMemo, useState } from "react";

/** Id namespace for the synthetic section-header rows. */
const SECTION_ID_PREFIX = "timeline-section::";
const TEMPORAL_TAGS_SECTION_ID = `${SECTION_ID_PREFIX}temporal-tags`;
const PROJECTION_EVENTS_SECTION_ID = `${SECTION_ID_PREFIX}projection-events`;

/** Neutral dot color for header rows — they carry no events of their own. */
const SECTION_HEADER_COLOR = "#8f9199";

type DecorateTrack = NonNullable<TimelineWithTracksProps["decorateTrack"]>;

export interface McapTimelineSections {
  /** Track list with section headers injected and collapsed children removed. */
  readonly tracks: Track[];
  /** Per-row decoration marking headers expandable and children as sub-rows. */
  readonly decorateTrack: DecorateTrack;
}

interface SectionSpec {
  readonly id: string;
  readonly label: string;
  readonly children: readonly Track[];
}

function headerTrack(spec: SectionSpec): Track {
  return {
    id: spec.id,
    label: spec.label,
    color: SECTION_HEADER_COLOR,
    events: [],
  };
}

/**
 * Groups the modal timeline's tracks into collapsible "Temporal tags" and
 * "Projection events" sections using the timeline's first-class row
 * primitives: a synthetic header row per section (rendered `expandable`) with
 * the real tracks decorated as indented child rows.
 *
 * When fewer than two groups are present there's nothing to disambiguate, so
 * the tracks render flat (no headers, no indentation) — preserving the
 * pre-sections behavior.
 *
 * Sections govern only the unpinned browse list: children are decorated as
 * indented sub-rows under their header, and a collapsed section marks its
 * children `hidden` (which `TimelineWithTracks` drops from the unpinned list
 * only). Pinned rows render raw in the pinned area, untouched by grouping or
 * collapse.
 */
export function useMcapTimelineSections({
  tagTracks,
  eventTracks,
}: {
  tagTracks: readonly Track[];
  eventTracks: readonly Track[];
}): McapTimelineSections {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const toggle = useCallback((sectionId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  return useMemo(() => {
    const sections: SectionSpec[] = [
      {
        id: TEMPORAL_TAGS_SECTION_ID,
        label: "Temporal tags",
        children: tagTracks,
      },
      {
        id: PROJECTION_EVENTS_SECTION_ID,
        label: "Projection events",
        children: eventTracks,
      },
    ].filter((section) => section.children.length > 0);

    if (sections.length < 2) {
      const flat = [...tagTracks, ...eventTracks];
      const noop: DecorateTrack = () => ({});
      return { tracks: flat, decorateTrack: noop };
    }

    const headerIds = new Set<string>();
    // child track id -> owning section id, so decorateTrack can consult that
    // section's collapsed state.
    const childSection = new Map<string, string>();
    const tracks: Track[] = [];
    for (const section of sections) {
      headerIds.add(section.id);
      tracks.push(headerTrack(section));
      for (const child of section.children) {
        childSection.set(child.id, section.id);
        // Keep every child in the list regardless of collapse; visibility is
        // decided per row in decorateTrack so pin state is unaffected.
        tracks.push(child);
      }
    }

    const decorateTrack: DecorateTrack = (track, pinned) => {
      if (headerIds.has(track.id)) {
        return {
          expandable: true,
          expanded: !collapsed.has(track.id),
          onToggleExpand: () => toggle(track.id),
          expansionGutter: true,
          // Headers are structural, not real tracks — never pinnable.
          hidePin: true,
        };
      }
      const sectionId = childSection.get(track.id);
      if (sectionId) {
        // Pinned rows render raw in the pinned area, away from their header and
        // never hidden by collapse. Unpinned rows indent under their header and
        // drop out when the section is collapsed. Use `depth` (not `isChild`)
        // so the row stays individually pinnable — `isChild` hides the pin. No
        // `expansionGutter`: reserving the empty chevron column ate ~24px of
        // the narrow label column and truncated labels; the `depth` indent +
        // color dot are enough of a nesting cue.
        if (pinned) {
          return {};
        }
        return {
          depth: 1,
          hidden: collapsed.has(sectionId),
        };
      }
      return {};
    };

    return { tracks, decorateTrack };
  }, [tagTracks, eventTracks, collapsed, toggle]);
}
