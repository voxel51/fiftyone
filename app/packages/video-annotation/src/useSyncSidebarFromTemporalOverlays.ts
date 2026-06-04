/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  type Scene2D,
  TemporalOverlay,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { type AnnotationLabelData, useModalSample } from "@fiftyone/state";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  useGetSidebarLabels,
  useLabelsContext,
} from "../../core/src/components/Modal/Sidebar/Annotate";
import useFocus from "../../core/src/components/Modal/Sidebar/Annotate/useFocus";
import { frameAt } from "../../playback/src/lib/playback/utils";
import { usePlayhead } from "../../playback/src/lib/playback/use-playback-state";

const TEMPORAL_DETECTION = "TemporalDetection" as const;

/**
 * Frame-gates `TemporalDetection` sidebar membership so TDs behave like
 * tracked detections: listed only while the playhead is within their
 * `support` range.
 *
 * Why this is needed: video detections live under `frames.` and never hydrate
 * into the sidebar from the sample, so {@link useSyncSidebarFromSnapshot} is
 * their sole, frame-driven source. `TemporalDetections` are sample-level, so
 * the sidebar hydrates all of them on load and nothing removes them per frame —
 * they'd otherwise stay listed across the whole clip. This hook reconciles each
 * playhead tick:
 *   - in-range TD overlays are added (or refreshed) in the sidebar,
 *   - any TD-typed sidebar entry whose support no longer contains the frame is
 *     removed (covers both entries this hook added and sample-hydrated ones).
 *
 * The TemporalOverlays stay in the scene regardless of frame — their canvas
 * chip self-gates on `support` (see {@link useTemporalOverlaySync}); only
 * sidebar membership is gated here. Mounts alongside
 * {@link useSyncSidebarFromSnapshot} in the video tiles.
 */
export const useSyncSidebarFromTemporalOverlays = (
  scene: Scene2D | null,
  canonicalMediaReady: boolean
): void => {
  const { addLabelToSidebar, removeLabelFromSidebar, updateLabelData } =
    useLabelsContext();
  const getSidebarLabels = useGetSidebarLabels();
  // Ref, not an effect dep: this effect writes `current` (via updateLabelData)
  // and `focus`'s identity tracks `current`, so depending on it would loop.
  const focus = useFocus();
  const selectOverlayRef = useRef(focus.selectOverlay);
  selectOverlayRef.current = focus.selectOverlay;

  const sample = useModalSample();
  const frameRate = sample?.frameRate;
  const playheadSec = usePlayhead();
  // Same frame mapping the TemporalOverlay time-gate uses.
  const frame =
    frameRate && Number.isFinite(frameRate) && frameRate > 0
      ? frameAt(playheadSec, frameRate)
      : null;

  // Re-trigger effect when temporal detection labels are added/removed
  const temporalDetectionIds = getSidebarLabels()
    .filter((l) => l.type === TEMPORAL_DETECTION)
    .map((l) => l.overlay.id)
    .sort()
    .join(",");

  // The signature above is sidebar-derived, so it doesn't change when a TD
  // overlay is added straight to the *scene* (e.g. `CreateTemporalDetectionCommand`)
  // — that overlay isn't in the sidebar yet. Without a scene-side trigger the
  // reconcile below wouldn't run until the next playhead tick, so a freshly
  // created TD never enters the sidebar. Mirror `FrameLabels`' TD-track
  // invalidation: bump on scene TD overlay add/remove.
  const useLighterEvent = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );
  const [sceneTdVersion, setSceneTdVersion] = useState(0);
  const bumpSceneTdVersion = useCallback(
    () => setSceneTdVersion((v) => v + 1),
    []
  );
  useLighterEvent(
    "lighter:overlay-added",
    useCallback(
      (payload) => {
        if (payload.overlay instanceof TemporalOverlay) bumpSceneTdVersion();
      },
      [bumpSceneTdVersion]
    )
  );
  useLighterEvent(
    "lighter:overlay-removed",
    useCallback(
      (payload) => {
        if (payload.id?.startsWith("td-")) bumpSceneTdVersion();
      },
      [bumpSceneTdVersion]
    )
  );

  useEffect(() => {
    if (!scene || !canonicalMediaReady || frame === null) {
      return;
    }

    const inRange = new Set<string>();
    // TDs listed this tick that are already selected in the scene — their
    // editor needs (re)opening (see below).
    const newlyAddedSelected: string[] = [];

    for (const overlay of scene.getAllOverlays()) {
      if (!(overlay instanceof TemporalOverlay)) continue;

      const support = overlay.label?.support;
      if (
        !Array.isArray(support) ||
        support.length !== 2 ||
        frame < support[0] ||
        frame > support[1]
      ) {
        continue;
      }
      inRange.add(overlay.id);

      // Keep the row's data aligned with the overlay's current (possibly
      // locally-edited) label; add it if not already present.
      const data = overlay.label as unknown as AnnotationLabelData;
      if (updateLabelData(overlay.id, data)) {
        continue;
      }
      addLabelToSidebar({
        data,
        overlay,
        path: overlay.field,
        type: TEMPORAL_DETECTION,
      });

      if (scene.isOverlaySelected(overlay.id)) {
        newlyAddedSelected.push(overlay.id);
      }
    }

    // Clicking a TD bar off the current frame selects the overlay and seeks
    // into range, but `selectOverlay` ran before this hook listed the TD, so
    // it bailed (not yet in labelMap) and the editor never opened. Retry now
    // that it's listed; deferred so the addLabelToSidebar write has flushed.
    if (newlyAddedSelected.length > 0) {
      queueMicrotask(() => {
        for (const id of newlyAddedSelected) {
          selectOverlayRef.current(id);
        }
      });
    }

    // Evict TD rows whose support no longer contains the frame. Reading the
    // live sidebar (rather than tracking only our own adds) lets us also
    // remove entries the sample hydration added on load.
    for (const label of getSidebarLabels()) {
      if (label.type !== TEMPORAL_DETECTION) continue;
      if (!inRange.has(label.overlay.id)) {
        removeLabelFromSidebar(label.overlay.id);
      }
    }
  }, [
    addLabelToSidebar,
    canonicalMediaReady,
    frame,
    getSidebarLabels,
    removeLabelFromSidebar,
    scene,
    sceneTdVersion,
    temporalDetectionIds,
    updateLabelData,
  ]);
};
