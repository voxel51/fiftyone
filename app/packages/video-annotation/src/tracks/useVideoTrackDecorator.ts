/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Track } from "@fiftyone/playback";
import clsx from "clsx";
import { useCallback, useMemo } from "react";
import { useVideoInteraction } from "../state/useVideoInteraction";
import { objectTrackPathOf } from "./frameTracks";
import { temporalDetectionRefOf } from "./temporalDetectionTracks";
import styles from "../components/VideoAnnotationSurface.module.css";

type TrackDecoration = Partial<{
  className: string;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onTrackClick: () => void;
}>;

/**
 * Decorate timeline rows from engine interaction so a row lights up
 * (`linkHovered` / `linkSelected`) when its label is hovered / selected on any
 * surface, and the row's own hover / click writes that interaction back through
 * the engine — which the canvas Lighter bridge applies to the overlay. The
 * row's visual hover is plain CSS `:hover`; only the cross-component direction
 * needs the engine.
 *
 * Two row kinds, both engine-addressed:
 *  - an OBJECT track's row id IS its `instanceId` (a frame-detection track), so
 *    it links on `track.id` at the current playhead frame;
 *  - a TEMPORAL-DETECTION row is sample-level — identified by its structured
 *    event payload (not the row-id shape) — so it links on the TD's `_id`
 *    (`instanceId`) at its own field path, frame-less.
 *
 * Both read the same engine interaction sets (keyed by `instanceId`), so the TD
 * `_id` matches the canvas overlay and sidebar row.
 */
export const useVideoTrackDecorator = (): ((
  track: Track,
) => TrackDecoration) => {
  const {
    selectedTrackIds,
    hoveredTrackIds,
    selectTrack,
    hoverTrack,
    selectLabel,
    hoverLabel,
  } = useVideoInteraction();

  /**
   * Decoration cache, discarded whenever a write handler changes identity.
   *
   * A decoration is a pure function of `(link id, field path, hovered,
   * selected)` — nothing else on the track reaches it — so that tuple is the
   * whole key. Keying on a string rather than the `Track` object is deliberate:
   * a sub-track row decorates through a *synthesized* stand-in for its parent
   * (`{ ...track, id: parentId }`), which is a fresh object on every call and
   * would never hit an object-keyed cache.
   *
   * The point is reference stability across hover. This hook closes over the
   * hovered / selected id sets, so it necessarily changes identity whenever
   * either moves — and hovering the tracks list is the hottest path there is.
   * Handing back the *same* decoration object for every row whose own state
   * didn't change is what lets the memoized rows skip re-rendering, leaving
   * just the one or two rows that actually lit up.
   */
  const cache = useMemo(
    () =>
      new Map<
        string,
        { hovered: boolean; selected: boolean; decoration: TrackDecoration }
      >(),
    [hoverTrack, selectTrack, hoverLabel, selectLabel],
  );

  return useCallback(
    (track: Track) => {
      const tdRef = temporalDetectionRefOf(track);
      // An object row addresses `(path, instanceId)` — the path is the field
      // the track lives on (detections / polylines), carried on its events.
      const path = tdRef ? tdRef.path : objectTrackPathOf(track);
      const linkId = tdRef ? tdRef.instanceId : track.id;

      const hovered = hoveredTrackIds.has(linkId);
      const selected = selectedTrackIds.has(linkId);

      const key = `${tdRef ? "td" : "obj"}\u0000${linkId}\u0000${path ?? ""}`;
      const cached = cache.get(key);
      if (
        cached &&
        cached.hovered === hovered &&
        cached.selected === selected
      ) {
        return cached.decoration;
      }

      const className = clsx({
        [styles.linkHovered]: hovered,
        [styles.linkSelected]: selected,
      });

      const decoration: TrackDecoration = tdRef
        ? {
            className,
            onMouseEnter: () => hoverLabel(tdRef, true),
            onMouseLeave: () => hoverLabel(tdRef, false),
            onTrackClick: () => selectLabel(tdRef),
          }
        : {
            className,
            onMouseEnter: () => path && hoverTrack(track.id, path, true),
            onMouseLeave: () => path && hoverTrack(track.id, path, false),
            onTrackClick: () => path && selectTrack(track.id, path),
          };

      cache.set(key, { hovered, selected, decoration });
      return decoration;
    },
    [
      cache,
      hoveredTrackIds,
      selectedTrackIds,
      hoverTrack,
      selectTrack,
      hoverLabel,
      selectLabel,
    ],
  );
};
