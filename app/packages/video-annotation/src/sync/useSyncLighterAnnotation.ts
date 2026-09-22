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
 * Bridge the video surface's Lighter overlay events into the create modes:
 * the modes are resolved once here and injected into each handler hook. A
 * `null` scene binds an inert channel until the real one arrives; canvas
 * select/deselect is the engine bridge's, so there is no handler for it here.
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
