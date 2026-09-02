/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import React from "react";
import { useSyncAnnotationFrameClock } from "../hooks/useSyncAnnotationFrameClock";
import { useSyncAnnotationVideoStore } from "../hooks/useSyncAnnotationVideoStore";
import { useVideoLighterEngineBridge } from "../hooks/useVideoLighterEngineBridge";
import {
  useExploreFrameLabelFields,
  useExploreFrameLabelPaths,
} from "../state/exploreFrameLabelFields";

/**
 * Hydrates the video sample's frame labels onto the Explore surface's Lighter
 * scene — the per-frame detection boxes.
 *
 * The engine federates one store per sample, and the annotation root's
 * `useSyncAnnotationEngine` deliberately SKIPS a video sample so the video
 * surface can own the composite `VideoLabelStore`. Explore therefore has to
 * register that store itself; without this component the scene receives
 * temporal detections and canonical media and nothing else.
 *
 * This is the read half of {@link VideoAnnotationHandlerRegistration}, in the
 * same order that one uses and for the same reason: the clock installs the
 * `FrameTemporalView`, the store seeds the `FrameStore` from the `/frames`
 * stream, and only then does the bridge reconcile — against a seeded store and
 * the frame view rather than the degenerate pool view.
 *
 * What is deliberately NOT here is the editing half: keybindings, the SAM2
 * segment bitmap, point sessions, auto-interpolate and anchor-following all
 * belong to Annotate. Overlay geometry stays uneditable because nothing calls
 * `Scene2D.enterInteractiveMode()` — that is the annotate draw path's job, and
 * it is not mounted on this surface.
 *
 * Select and hover still route through the bridge, and selection here is
 * ADDITIVE — a click adds a label rather than replacing the selection. That
 * follows from the scene being in multi-select mode (`LighterVideo` sets it
 * for `explore`); the bridge reads the mode off the scene, so this file sets
 * nothing. It matters because the engine's active set is what the timeline's
 * track rows highlight AND — through `lighterBridge`'s `applySelected` — what
 * the canvas selection is reconciled against: were a click still replacing,
 * the engine would deselect every other overlay behind Lighter's back and the
 * canvas would collapse to one box however many the user clicked.
 * `useLighterSelectionEventHandler` mirrors the canvas's side of the same
 * gesture into `fos.selectedLabels`, which the modal's Tag and "Manage
 * selected" actions read.
 *
 * Mount inside the surface's `PlaybackProvider` (the frame clock reads it) and
 * as a SIBLING of `RegisterFrameLabels`, not a child: that component swaps its
 * wrapper when duration lands, which would remount anything nested inside it
 * and tear the store back down.
 */
export const RegisterVideoExploreLabels: React.FC = () => {
  // Explore scopes the store and the bridge to the sidebar's active frame
  // fields. The annotation-schema defaults these hooks fall back on are only
  // populated once the Annotate sidebar (or the Schema Manager) has loaded
  // them, so in Explore they are empty and nothing would render.
  const labelTypes = useExploreFrameLabelFields();
  const paths = useExploreFrameLabelPaths();

  useSyncAnnotationFrameClock();
  useSyncAnnotationVideoStore(labelTypes);
  // after the clock + store, so the bridge reconciles against the
  // FrameTemporalView and a seeded frame store
  useVideoLighterEngineBridge(paths);
  return null;
};
