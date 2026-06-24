/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  useAnnotationEngine,
  useAnnotationEventHandler,
} from "@fiftyone/annotation";
import {
  type Scene2D,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { LabelType } from "@fiftyone/utilities";
import { useCallback } from "react";
import { useAnnotationContext } from "../../../core/src/components/Modal/Sidebar/Annotate/Edit/useAnnotationContext";
import { useDetectionMode } from "../../../core/src/components/Modal/Sidebar/Annotate/Edit/useDetectionMode";
import {
  usePolylineMode,
  usePolylineModeInstaller,
} from "../../../core/src/components/Modal/Sidebar/Annotate/Edit/usePolylineMode";
import { useSegmentationMode } from "../../../core/src/components/Modal/Sidebar/Annotate/Edit/useSegmentationMode";
import useExit from "../../../core/src/components/Modal/Sidebar/Annotate/Edit/useExit";
import { useVideoSurfaceActions } from "../hooks/useVideoSurfaceActions";
import { useFrameLabelsStream } from "../streams/frameLabelsStream";
import { autoExtendTargetFrames } from "../tracks/autoExtend";
import { useCurrentEditingOverlay } from "../state/accessors";
import { takeEstablishKey } from "./establishKeyRelay";

/** Registers a handler for a Lighter event on the bridged scene's channel. */
type RegisterLighterHandler = ReturnType<typeof useLighterEventHandler>;

/** The create modes the top hook resolves once and injects into sub-hooks. */
type DetectionMode = ReturnType<typeof useDetectionMode>;
type SegmentationMode = ReturnType<typeof useSegmentationMode>;
type PolylineMode = ReturnType<typeof usePolylineMode>;

/** Schema-driven TD check: a field whose label type is a temporal detection. */
const isTemporalDetectionType = (type: LabelType): boolean =>
  type === LabelType.TemporalDetection || type === LabelType.TemporalDetections;

/**
 * Draw: a Lighter overlay create opens a new draft on the engine frame path —
 * a masked detection while segmentation mode is active, else a plain detection
 * while detection mode is active. (Polylines self-create through their own
 * creation handler — see {@link usePolylineModeInstaller}.)
 */
const useRegisterDrawHandler = ({
  registerHandler,
  detectionMode,
  segmentationMode,
}: {
  registerHandler: RegisterLighterHandler;
  detectionMode: DetectionMode;
  segmentationMode: SegmentationMode;
}): void => {
  registerHandler(
    "lighter:overlay-create",
    useCallback(() => {
      // The schema exposes the frame field at its real `frames.<field>` path,
      // so default field resolution stamps it and the write routes to the
      // FrameStore — no pinned destination needed.
      if (segmentationMode.segmentationModeActive) {
        segmentationMode.create();
      } else if (detectionMode.detectionModeActive) {
        detectionMode.create();
      }
    }, [detectionMode, segmentationMode])
  );
};

/**
 * Draw establish: the engine bridge commits + selects the draw synchronously, so
 * a microtask later the engine owns the label and the interaction anchor IS the
 * new track's ref. Two things happen here, both keyed off that anchor:
 *
 *  1. Hand the form off from the surface-owned draft to the engine anchor. The
 *     draft pins the ENGINE path (`frames.<field>`) so the write routes to the
 *     FrameStore and carries no engine ref, so the form shows the raw path and
 *     neither playhead-follow nor live re-sync engage. Dropping the draft
 *     (`clear`) lets `useFormAnchor` adopt the anchor — schema field + ref — so
 *     the form reads `<field>` and tracks the playhead, as a deselect→reselect
 *     does manually.
 *  2. Auto-extend a freshly-drawn box forward as a short track. `establish` fires
 *     only for a new draw (a new track), so this is new-tracks-only by
 *     construction; copy its box onto the next frames as non-keyframe filler
 *     (`extendTrack` semantics), matching a manual drag-to-extend. Leaves a
 *     single keyframe, so a later propagate/auto-lerp fills these in place.
 */
const useRegisterDrawEstablishHandler = ({
  registerHandler,
}: {
  registerHandler: RegisterLighterHandler;
}): void => {
  const { clear } = useAnnotationContext();
  const stream = useFrameLabelsStream();
  const engine = useAnnotationEngine();
  const surfaceActions = useVideoSurfaceActions();

  registerHandler(
    "lighter:overlay-establish",
    useCallback(
      (payload) => {
        if (!stream) {
          return;
        }

        queueMicrotask(() => {
          // The bridge stashed this draw's gesture key by overlay id during its
          // synchronous establish commit; take it (consume-once) so the
          // auto-extend folds into the draw's undo unit. Microtask order
          // guarantees the stash ran first, and it's keyed by identity.
          const drawUndoKey = takeEstablishKey(payload.overlayId);
          const anchor = engine.interaction.getAnchor();

          if (!anchor || anchor.frame == null) {
            return;
          }

          const source = engine.getLabel(anchor);

          if (!source) {
            return;
          }

          clear();

          // boxes only — a fresh draw of another label kind isn't a track
          if (!Array.isArray(source.bounding_box)) {
            return;
          }

          const targetFrames = autoExtendTargetFrames(
            anchor.frame,
            stream.totalFrames
          );

          if (targetFrames.length === 0) {
            return;
          }

          // fold the filler into the draw's undo unit (key taken above)
          surfaceActions.extendTrack(
            anchor.instanceId,
            anchor.frame,
            targetFrames,
            drawUndoKey
          );
        });
      },
      [clear, engine, surfaceActions, stream]
    )
  );
};

/**
 * Editor teardown: a TemporalDetection deleted from the timeline context menu
 * removes its overlay directly; if it was open in the editor, tear the
 * now-dangling edit panel down.
 */
const useRegisterEditorTeardownHandler = ({
  registerHandler,
}: {
  registerHandler: RegisterLighterHandler;
}): void => {
  const exit = useExit();
  const engine = useAnnotationEngine();
  const editingOverlay = useCurrentEditingOverlay();

  registerHandler(
    "lighter:overlay-removed",
    useCallback(
      (payload) => {
        // Identify the TD by the editing overlay's FIELD TYPE (the schema)
        // rather than an id shape: a fresh-draw detection swap (which also
        // removes an overlay mid-edit then re-selects its replacement) is a
        // Detection field, so it's left untouched.
        if (
          editingOverlay &&
          editingOverlay.id === payload.id &&
          isTemporalDetectionType(engine.getLabelType(editingOverlay.field))
        ) {
          // `overlay-removed` fires synchronously inside the engine's delete
          // dispatch; `exit()` writes `engine.interaction.setActive([])`, so
          // defer it outside the dispatch — a subscriber must never write back
          // to the engine.
          queueMicrotask(() => exit());
        }
      },
      [engine, exit, editingOverlay]
    )
  );
};

/**
 * Mode quit: right-click and Esc deactivate whichever create mode is active.
 * `lighter:detection-mode-quit` / `lighter:segmentation-mode-quit` target their
 * own mode; the generic `lighter:active-mode-quit-requested` self-filters across
 * detection, segmentation, and polyline.
 */
const useRegisterModeQuitHandlers = ({
  registerHandler,
  detectionMode,
  segmentationMode,
  polylineMode,
}: {
  registerHandler: RegisterLighterHandler;
  detectionMode: DetectionMode;
  segmentationMode: SegmentationMode;
  polylineMode: PolylineMode;
}): void => {
  registerHandler(
    "lighter:detection-mode-quit",
    useCallback(() => {
      detectionMode.deactivateDetectionMode();
    }, [detectionMode])
  );

  registerHandler(
    "lighter:segmentation-mode-quit",
    useCallback(() => {
      if (segmentationMode.segmentationModeActive) {
        segmentationMode.deactivateSegmentationMode();
      }
    }, [segmentationMode])
  );

  registerHandler(
    "lighter:active-mode-quit-requested",
    useCallback(() => {
      if (detectionMode.detectionModeActive) {
        detectionMode.deactivateDetectionMode();
        return;
      }

      if (segmentationMode.segmentationModeActive) {
        segmentationMode.deactivateSegmentationMode();
        return;
      }

      if (polylineMode.polylineModeActive) {
        polylineMode.deactivatePolylineMode();
      }
    }, [detectionMode, segmentationMode, polylineMode])
  );
};

/**
 * Track deleted: deleting a track leaves no useful edit/draw state to keep open,
 * so tear detection mode down.
 */
const useRegisterTrackDeletedHandler = ({
  detectionMode,
}: {
  detectionMode: DetectionMode;
}): void => {
  useAnnotationEventHandler(
    "annotation:trackDeleted",
    useCallback(() => {
      detectionMode.deactivateDetectionMode();
    }, [detectionMode])
  );
};

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
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
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
  useRegisterTrackDeletedHandler({ detectionMode });

  // Polylines self-create through an InteractiveCreationHandler the installer
  // mounts on the scene (the image surface gets this via `useBridge`); without
  // it polyline mode toggles but a canvas click draws nothing.
  usePolylineModeInstaller();
};
