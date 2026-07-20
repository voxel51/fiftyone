import type { Track } from "@fiftyone/playback";
import clsx from "clsx";
import { useCallback, useMemo, useState } from "react";
import type { TimelineSection, TimelineTrackDecorator } from "./types";
import styles from "./sections.module.css";

const SECTION_HEADER_ID_PREFIX = "timeline-section::";
const SECTION_HEADER_COLOR = "#8f9199";

function sectionHeader(section: TimelineSection): Track {
  return {
    id: `${SECTION_HEADER_ID_PREFIX}${section.id}`,
    label: section.label,
    color: SECTION_HEADER_COLOR,
    events: [],
  };
}

/**
 * Validates and adapts explicitly ordered sections for the current playback
 * package. Section metadata remains first-class at the extension boundary.
 * Until playback has a section-row primitive, two or more non-empty sections
 * receive non-pinnable synthetic header tracks that provide grouping and
 * collapse behavior.
 */
export function useTimelineSections(sections: readonly TimelineSection[]): {
  readonly decorateTrack: TimelineTrackDecorator;
  readonly tracks: Track[];
} {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const toggle = useCallback((sectionId: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }, []);

  return useMemo(() => {
    const ordered = [...sections].sort(
      (left, right) =>
        left.order - right.order || left.id.localeCompare(right.id),
    );
    const ids = new Set<string>();
    const sourceByTrackId = new Map<string, TimelineSection>();
    for (const section of ordered) {
      if (!section.id.includes(":")) {
        throw new Error(
          `Timeline section ids must be namespaced: ${section.id}`,
        );
      }
      if (ids.has(section.id)) {
        throw new Error(`Duplicate Timeline section id: ${section.id}`);
      }
      ids.add(section.id);
      for (const track of section.tracks) {
        const existing = sourceByTrackId.get(track.id);
        if (existing) {
          throw new Error(
            `Duplicate Timeline track id ${track.id} in ${existing.id} and ${section.id}`,
          );
        }
        sourceByTrackId.set(track.id, section);
      }
    }
    const nonEmpty = ordered.filter((section) => section.tracks.length > 0);
    const decorateSourceTrack: TimelineTrackDecorator = (track, pinned) =>
      sourceByTrackId.get(track.id)?.decorateTrack?.(track, pinned) ?? {};

    if (nonEmpty.length < 2) {
      return {
        tracks: nonEmpty.flatMap((section) => section.tracks),
        decorateTrack: decorateSourceTrack,
      };
    }

    const headerIds = new Set<string>();
    const sectionByChildId = new Map<string, string>();
    const tracks: Track[] = [];
    for (const section of nonEmpty) {
      const header = sectionHeader(section);
      if (sourceByTrackId.has(header.id)) {
        throw new Error(
          `Timeline section header id collides with a track: ${header.id}`,
        );
      }
      headerIds.add(header.id);
      tracks.push(header);
      for (const track of section.tracks) {
        sectionByChildId.set(track.id, header.id);
        tracks.push(track);
      }
    }

    return {
      tracks,
      decorateTrack: (track, pinned) => {
        if (headerIds.has(track.id)) {
          return {
            expandable: true,
            expanded: !collapsed.has(track.id),
            expansionGutter: true,
            onPinClick: undefined,
            onToggleExpand: () => toggle(track.id),
          };
        }

        const headerId = sectionByChildId.get(track.id);
        const sourceDecoration = decorateSourceTrack(track, pinned);
        if (!pinned && headerId) {
          return {
            ...sourceDecoration,
            depth: sourceDecoration.depth ?? 1,
            expansionGutter: true,
            className: clsx(
              sourceDecoration.className,
              collapsed.has(headerId) && styles.hiddenTrack,
            ),
          };
        }
        return sourceDecoration;
      },
    };
  }, [collapsed, sections, toggle]);
}
