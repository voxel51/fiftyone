import {
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventBus,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import clsx from "clsx";
import { useAtomValue } from "jotai";
import React, { useCallback, useRef } from "react";
import { type Track } from "../../playback/src/lib/tracks/TrackProvider";
import {
  hoveredOverlayIds,
  selectedOverlayIds,
  useLinkedOverlayState,
  useScrollTrackOnSelect,
} from "./useLinkedOverlayState";
import styles from "./VideoAnnotationSurface.module.css";

/**
 * Side-effect component that runs {@link useLinkedOverlayState} so the
 * `hoveredOverlayIds` / `selectedOverlayIds` atoms reflect the current
 * Lighter scene. Rendered as a null component just to host the hook
 * inside the surface tree.
 */
export const LinkedOverlayStateBridge: React.FC = () => {
  useLinkedOverlayState();
  useScrollTrackOnSelect();
  return null;
};

/**
 * Builds a `decorateTrack` for `TimelineWithTracks` that wires each row
 * to its matching overlay (track.id == overlay.id for our datasets):
 *
 *  - row gets the `linkHovered` class when the overlay is hovered
 *  - row gets the `linkSelected` class when the overlay is selected
 *  - hovering the row itself fires `lighter:do-overlay-hover` on the
 *    scene bus, so the overlay's hover state matches in real time. The
 *    row's own visual hover is handled by ordinary CSS `:hover` — only
 *    the cross-component direction needs an atom.
 */
export function useLinkedTrackDecorator(): (track: Track) => Partial<{
  className: string;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onTrackClick: () => void;
}> {
  const hovered = useAtomValue(hoveredOverlayIds);
  const selected = useAtomValue(selectedOverlayIds);
  const { scene } = useLighter();
  const eventBus = useLighterEventBus(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );

  // "Pending select" — the id the user just clicked whose overlay
  // wasn't in the scene yet. Clicking an interval bar seeks to that
  // frame; the matching overlay enters the scene a moment later when
  // `useFrameOverlaySync` lands it. We watch `lighter:overlay-added`
  // for that id and call `selectOverlay` then.
  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );
  const pendingSelectRef = useRef<string | null>(null);

  useEventHandler(
    "lighter:overlay-added",
    useCallback(
      (payload) => {
        if (!scene || pendingSelectRef.current !== payload.id) {
          return;
        }

        scene.selectOverlay(payload.id);
        pendingSelectRef.current = null;
      },
      [scene]
    )
  );

  // Any select clears the pending intent — the user (or our own
  // synchronous select below) picked something, so stale pendings
  // shouldn't override a later choice if the original instance re-
  // enters frame.
  useEventHandler(
    "lighter:overlay-select",
    useCallback(() => {
      pendingSelectRef.current = null;
    }, [])
  );

  return useCallback(
    (track: Track) => ({
      className: clsx({
        [styles.linkHovered]: hovered.has(track.id),
        [styles.linkSelected]: selected.has(track.id),
      }),
      onMouseEnter: () => {
        if (!scene) {
          return;
        }

        eventBus.dispatch("lighter:do-overlay-hover", {
          id: track.id,
          tooltip: false,
        });
      },
      onMouseLeave: () => {
        if (!scene) {
          return;
        }

        eventBus.dispatch("lighter:do-overlay-unhover", { id: track.id });
      },
      onTrackClick: () => {
        // Record the intent first, then try a synchronous select. If
        // the overlay is already in the scene, `selectOverlay` fires
        // `:overlay-select` which clears `pendingSelectRef` via the
        // listener above. If the label isn't in the current frame —
        // typical when clicking an interval bar that the playhead is
        // about to seek into — the synchronous call no-ops, the seek
        // (already in flight from the bar's own click handler) lands
        // the right frame, the overlay enters the scene, the
        // `:overlay-added` listener fires, and we select then.
        pendingSelectRef.current = track.id;
        scene?.selectOverlay(track.id);
      },
    }),
    [hovered, selected, scene, eventBus]
  );
}
