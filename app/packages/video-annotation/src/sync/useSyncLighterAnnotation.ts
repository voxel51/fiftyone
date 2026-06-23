/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  toFrameEnginePath,
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
import useExit from "../../../core/src/components/Modal/Sidebar/Annotate/Edit/useExit";
import { useVideoSurfaceActions } from "../hooks/useVideoSurfaceActions";
import { useFrameLabelsStream } from "../streams/frameLabelsStream";
import { autoExtendTargetFrames } from "../tracks/autoExtend";
import { useCurrentEditingOverlay } from "../state/accessors";
import { takeEstablishKey } from "./establishKeyRelay";

/** Registers a handler for a Lighter event on the bridged scene's channel. */
type RegisterLighterHandler = ReturnType<typeof useLighterEventHandler>;

/** Schema-driven TD check: a field whose label type is a temporal detection. */
const isTemporalDetectionType = (type: LabelType): boolean =>
  type === LabelType.TemporalDetection || type === LabelType.TemporalDetections;

/**
 * Draw: a Lighter overlay create while detection mode is active opens a new
 * detection draft on the engine frame path.
 */
const useRegisterDrawHandler = ({
  registerHandler,
}: {
  registerHandler: RegisterLighterHandler;
}): void => {
  const detectionMode = useDetectionMode();
  const stream = useFrameLabelsStream();

  registerHandler(
    "lighter:overlay-create",
    useCallback(() => {
      if (detectionMode.detectionModeActive) {
        // Pin the destination to the frame engine path. The schema only exposes
        // the sample-level detection field, so the default resolution would
        // stamp that path on the overlay and route the write to the sample
        // store; the seam maps the relative field to `frames.<field>`.
        detectionMode.create(
          stream ? toFrameEnginePath(stream.labelsField) : undefined
        );
      }
    }, [detectionMode, stream])
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
 * Mode quit: right-click (`lighter:detection-mode-quit`) and Esc
 * (`lighter:active-mode-quit-requested`) both deactivate detection mode.
 */
const useRegisterModeQuitHandlers = ({
  registerHandler,
}: {
  registerHandler: RegisterLighterHandler;
}): void => {
  const detectionMode = useDetectionMode();

  registerHandler(
    "lighter:detection-mode-quit",
    useCallback(() => {
      detectionMode.deactivateDetectionMode();
    }, [detectionMode])
  );

  registerHandler(
    "lighter:active-mode-quit-requested",
    useCallback(() => {
      if (detectionMode.detectionModeActive) {
        detectionMode.deactivateDetectionMode();
      }
    }, [detectionMode])
  );
};

/**
 * Track deleted: deleting a track leaves no useful edit/draw state to keep open,
 * so tear detection mode down.
 */
const useRegisterTrackDeletedHandler = (): void => {
  const detectionMode = useDetectionMode();

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
 * Event-handler-only: state changes flow through the public `useDetectionMode`
 * interface rather than direct atom access, so this stays decoupled from that
 * module's internals. Sidebar membership is engine-derived (`useEntries` reads
 * engine presence), so nothing here pushes or prunes sidebar rows.
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

  useRegisterDrawHandler({ registerHandler });
  useRegisterDrawEstablishHandler({ registerHandler });
  useRegisterEditorTeardownHandler({ registerHandler });
  useRegisterModeQuitHandlers({ registerHandler });
  useRegisterTrackDeletedHandler();
};
