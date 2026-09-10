/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  type Scene2D,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { useDetectionMode } from "../../../core/src/components/Modal/Sidebar/Annotate/Edit/useDetectionMode";
import {
  usePolylineMode,
  usePolylineModeInstaller,
} from "../../../core/src/components/Modal/Sidebar/Annotate/Edit/usePolylineMode";
import { useSegmentationMode } from "../../../core/src/components/Modal/Sidebar/Annotate/Edit/useSegmentationMode";
import {
  useRegisterDrawEstablishHandler,
  useRegisterDrawHandler,
} from "./useLighterDrawHandlers";
import {
  useRegisterEditorTeardownHandler,
  useRegisterModeQuitHandlers,
  useRegisterPointSelectionFinalizeHandler,
  useRegisterTrackDeletedHandler,
} from "./useLighterModeHandlers";

/**
 * Bridges Lighter overlay events into the annotation systems for the video
 * surface. Binds the scene's event channel and delegates each concern to a
 * tightly-scoped handler hook.
 *
 * Event-handler-only: state changes flow through the public mode interfaces
 * (`useDetectionMode` / `useSegmentationMode` / `usePolylineMode`) rather than
 * direct atom access, so this stays decoupled from those modules' internals.
 * The modes are resolved once here (the binding agent) and injected — segmentation
 * in particular installs a scene handler (`usePenTool`), so it must mount once.
 * Sidebar membership is engine-derived (`useEntries` reads engine presence), so
 * nothing here pushes or prunes sidebar rows.
 *
 * Canvas selection (`lighter:overlay-select` / `deselect`) is owned by the
 * engine's Lighter `frame-locked` bridge (`SurfaceController.selectHandle`),
 * which maps an overlay handle to its `LabelRef` and drives `engine.interaction`
 * — so there is deliberately no select/deselect handler here.
 *
 * @param scene - The scene to bridge, or `null` while it's still being set up.
 *   When `null`, handlers attach to an inert sentinel channel and re-bind once
 *   the real scene becomes available.
 */
export const useSyncLighterAnnotation = (scene: Scene2D | null): void => {
  const registerHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID,
  );

  const detectionMode = useDetectionMode();
  const segmentationMode = useSegmentationMode();
  const polylineMode = usePolylineMode();

  useRegisterDrawHandler({ registerHandler, detectionMode, segmentationMode });
  useRegisterDrawEstablishHandler({ registerHandler });
  useRegisterEditorTeardownHandler({ registerHandler });
  useRegisterModeQuitHandlers({
    registerHandler,
    detectionMode,
    segmentationMode,
    polylineMode,
  });
  useRegisterPointSelectionFinalizeHandler({
    registerHandler,
    segmentationMode,
  });
  useRegisterTrackDeletedHandler({
    detectionMode,
    segmentationMode,
    polylineMode,
  });

  // Polylines self-create through an InteractiveCreationHandler the installer
  // mounts on the scene (the image surface gets this via `useBridge`); without
  // it polyline mode toggles but a canvas click draws nothing.
  usePolylineModeInstaller();
};
