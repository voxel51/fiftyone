import {
  InteractivePolylineHandler,
  KeypointPointHitAction,
  KeypointPointHitContext,
  PolylineEmptyHitAction,
  PolylineEmptyHitContext,
  PolylineOverlay,
  useLighter,
} from "@fiftyone/lighter";
import { isPatchesView } from "@fiftyone/state";
import { POLYLINE } from "@fiftyone/utilities";
import { atom, useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRecoilValue } from "recoil";
import { fieldsOfType, useAnnotationContext } from "./state";

/**
 * Active flag for 2D polyline annotation mode. While `true`, selecting a
 * polyline overlay installs an {@link InteractivePolylineHandler} on it; the
 * handler is torn down on selection change or mode deactivation.
 */
const polylineModeActiveAtom = atom<boolean>(false);

/**
 * Modifier policy: Alt-click on a point deletes it.
 */
const resolvePointHit = (ctx: KeypointPointHitContext) =>
  ctx.modifiers.altKey ? KeypointPointHitAction.DELETE : undefined;

/**
 * Modifier policy: Shift-click on empty space starts a new segment instead
 * of extending the nearest endpoint.
 */
const resolveEmptyHit = (ctx: PolylineEmptyHitContext) =>
  ctx.modifiers.shiftKey ? PolylineEmptyHitAction.NEW_SEGMENT : undefined;

/**
 * Centralized hook for 2D polyline annotation mode.
 *
 * Lifecycle:
 * - Toggling on activates the mode; toggling off exits.
 * - While active, whenever the currently-edited annotation is a 2D polyline,
 *   an {@link InteractivePolylineHandler} is installed via
 *   `scene.enterInteractiveMode`. Selecting a different label or deselecting
 *   tears the handler down; the next polyline selection installs a fresh
 *   one.
 * - 3D polyline labels (`PolylineAnnotationLabel` whose overlay isn't a
 *   real `PolylineOverlay`) are ignored — they have their own annotation
 *   pipeline.
 *
 * Creation of new polylines is wired up separately (see `useCreate`).
 */
export const usePolylineMode = () => {
  const [polylineModeActive, setPolylineModeActive] = useAtom(
    polylineModeActiveAtom
  );
  const { scene } = useLighter();
  const { selectedLabel } = useAnnotationContext();
  const isPatchView = useRecoilValue(isPatchesView);
  const fields = useAtomValue(fieldsOfType(POLYLINE));

  // The handler currently installed via scene.enterInteractiveMode, or null
  // when no polyline is selected (or the mode is off).
  const installedHandlerRef = useRef<InteractivePolylineHandler | null>(null);

  const noActiveFields = fields.length === 0;
  const disabled = isPatchView || noActiveFields;

  const tooltip = isPatchView
    ? "Editing polylines is not supported in this view"
    : noActiveFields
    ? "No active fields"
    : polylineModeActive
    ? "Exit polyline mode"
    : "Edit polylines";

  const exitInstalledHandler = useCallback(() => {
    if (!installedHandlerRef.current) {
      return;
    }

    scene?.exitInteractiveMode();
    installedHandlerRef.current = null;
  }, [scene]);

  // Install / re-install / tear down based on selection while mode is active.
  useEffect(() => {
    if (!scene) {
      return;
    }

    if (!polylineModeActive) {
      exitInstalledHandler();
      return;
    }

    // Only target real 2D PolylineOverlay instances. 3D polyline labels use
    // a generic overlay shape and have a separate pipeline.
    const isPolyline2d =
      selectedLabel?.type === "Polyline" &&
      selectedLabel.overlay instanceof PolylineOverlay;

    if (!isPolyline2d) {
      exitInstalledHandler();
      return;
    }

    const targetOverlay = selectedLabel.overlay as PolylineOverlay;

    // Already installed for this overlay — nothing to do.
    if (installedHandlerRef.current?.overlay === targetOverlay) {
      return;
    }

    // Different overlay (or first install) — swap handlers.
    exitInstalledHandler();

    const handler = new InteractivePolylineHandler(
      targetOverlay,
      resolvePointHit,
      undefined,
      resolveEmptyHit
    );

    scene.enterInteractiveMode(handler);
    installedHandlerRef.current = handler;
  }, [exitInstalledHandler, polylineModeActive, scene, selectedLabel]);

  // Tear down on unmount (e.g., scene swap, modal close).
  useEffect(() => {
    return () => {
      exitInstalledHandler();
    };
  }, [exitInstalledHandler]);

  const activatePolylineMode = useCallback(
    () => setPolylineModeActive(true),
    [setPolylineModeActive]
  );

  const deactivatePolylineMode = useCallback(
    () => setPolylineModeActive(false),
    [setPolylineModeActive]
  );

  const togglePolylineMode = useCallback(() => {
    setPolylineModeActive((prev) => !prev);
  }, [setPolylineModeActive]);

  return useMemo(
    () => ({
      polylineModeActive,
      disabled,
      tooltip,
      activatePolylineMode,
      deactivatePolylineMode,
      togglePolylineMode,
    }),
    [
      polylineModeActive,
      disabled,
      tooltip,
      activatePolylineMode,
      deactivatePolylineMode,
      togglePolylineMode,
    ]
  );
};
