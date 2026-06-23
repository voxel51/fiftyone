/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  type ScopedRef,
  useAnnotationEngine,
  useInteraction,
  useSurfaceActions,
} from "@fiftyone/annotation";
import { useCallback, useEffect, useRef } from "react";
import { useFrameLabelsStream } from "../streams/frameLabelsStream";
import { useCurrentFrame, useCurrentFrameGetter } from "./useCurrentFrame";

const SURFACE = "video-timeline";

/** Membership equality so a selector only re-renders on an id set change. */
const sameIds = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean => {
  if (a.size !== b.size) {
    return false;
  }

  for (const id of a) {
    if (!b.has(id)) {
      return false;
    }
  }

  return true;
};

/**
 * The timeline's seam onto engine interaction. A timeline row is a whole
 * track, so it links on the engine's `instanceId` (the linkage key spanning a
 * track's per-frame occurrences) — a track lights up when ANY of its
 * occurrences is active / hovered. Writes address the occurrence at the current
 * playhead frame, since interaction state is keyed on the full ref.
 *
 * The video canvas Lighter bridge reads the same engine interaction state, so
 * select / hover from a row reflects on the canvas with no extra wiring.
 */
export interface VideoInteraction {
  /** Track ids (= engine instanceIds) currently selected. */
  selectedTrackIds: ReadonlySet<string>;
  /** Track ids (= engine instanceIds) currently hovered. */
  hoveredTrackIds: ReadonlySet<string>;
  /** Replace the selection with this track's current-frame occurrence. */
  selectTrack: (instanceId: string) => void;
  /** Set hover on this track's current-frame occurrence. */
  hoverTrack: (instanceId: string, on: boolean) => void;
  /**
   * Select / hover a label by its exact engine ref. Used for sample-level
   * labels (temporal detections: addressed by `instanceId`, no frame) whose
   * path differs from the frame-detection field, so they can't go through the
   * `instanceId`-only track seam above.
   */
  selectLabel: (ref: ScopedRef) => void;
  hoverLabel: (ref: ScopedRef, on: boolean) => void;
}

/** Read selected track ids (engine instanceIds) from interaction state. */
export const useSelectedTrackIds = (): ReadonlySet<string> => {
  const engine = useAnnotationEngine();
  return useInteraction(
    engine,
    (i) => new Set(i.getActive().map((ref) => ref.instanceId)),
    sameIds
  );
};

/** Read hovered track ids (engine instanceIds) from interaction state. */
export const useHoveredTrackIds = (): ReadonlySet<string> => {
  const engine = useAnnotationEngine();
  return useInteraction(
    engine,
    (i) => new Set(i.getHovered().map((ref) => ref.instanceId)),
    sameIds
  );
};

/** The full select / hover seam for timeline rows. */
export const useVideoInteraction = (): VideoInteraction => {
  const engine = useAnnotationEngine();
  const actions = useSurfaceActions(engine, SURFACE);
  const stream = useFrameLabelsStream();
  const getFrame = useCurrentFrameGetter();

  const selectedTrackIds = useSelectedTrackIds();
  const hoveredTrackIds = useHoveredTrackIds();

  const path = stream ? `frames.${stream.labelsField}` : null;

  const selectTrack = useCallback(
    (instanceId: string) => {
      if (!path) {
        return;
      }

      actions.setActive([{ path, instanceId, frame: getFrame() }]);
    },
    [actions, path, getFrame]
  );

  const hoverTrack = useCallback(
    (instanceId: string, on: boolean) => {
      if (!path) {
        return;
      }

      actions.setHovered({ path, instanceId, frame: getFrame() }, on);
    },
    [actions, path, getFrame]
  );

  const selectLabel = useCallback(
    (ref: ScopedRef) => actions.setActive([ref]),
    [actions]
  );

  const hoverLabel = useCallback(
    (ref: ScopedRef, on: boolean) => actions.setHovered(ref, on),
    [actions]
  );

  return {
    selectedTrackIds,
    hoveredTrackIds,
    selectTrack,
    hoverTrack,
    selectLabel,
    hoverLabel,
  };
};

/**
 * Keep the editing anchor on the playhead. While a video frame label is the
 * anchor (the form follows it), advancing the playhead re-stamps the anchor to
 * the SAME track (`instanceId`) at the new frame, so the form and canvas
 * selection track the instance across frames. Only re-stamps when that track
 * has an occurrence on the new frame — a gap leaves the anchor on its current
 * occurrence rather than blanking the form. Sample-level anchors (no `frame`,
 * e.g. a temporal detection) are left alone.
 */
export const useFollowAnchorFrame = (): void => {
  const engine = useAnnotationEngine();
  const frame = useCurrentFrame();

  useEffect(() => {
    const anchor = engine.interaction.getAnchor();

    if (!anchor || anchor.frame == null || anchor.frame === frame) {
      return;
    }

    const next = { ...anchor, frame };

    // track absent on this frame — keep editing the current occurrence
    if (!engine.getLabel(next)) {
      return;
    }

    engine.interaction.setActive([next]);
  }, [engine, frame]);
};

/**
 * Bring the anchored (lead) track's row into view when selection moves — the
 * engine-native replacement for the scene-event scroll. Relies on
 * `data-track-id={id}` rendered by `TimelineTrack` (row id == instanceId for
 * object tracks). `scrollIntoView` with `block: "nearest"` no-ops when the row
 * is already visible, so pinned / on-screen rows generate no scroll.
 */
export const useScrollTrackToAnchor = (): void => {
  const engine = useAnnotationEngine();
  const anchorId = useInteraction(
    engine,
    (i) => i.getAnchor()?.instanceId ?? null
  );
  const previous = useRef<string | null>(null);

  useEffect(() => {
    if (!anchorId || anchorId === previous.current) {
      previous.current = anchorId;
      return;
    }

    previous.current = anchorId;

    // Defer to the next frame so any layout shift from the selection settles
    // before scrolling.
    requestAnimationFrame(() => {
      const row = document.querySelector(
        `[data-track-id="${CSS.escape(anchorId)}"]`
      );

      row?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    });
  }, [anchorId]);
};
