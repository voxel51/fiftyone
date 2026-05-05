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
import useCreate from "./useCreate";

/**
 * Active flag for 2D polyline annotation mode. While `true`, selecting a
 * polyline overlay installs an {@link InteractivePolylineHandler} on it; the
 * handler is torn down on selection change or mode deactivation.
 *
 * This atom is exported (as `_unsafe…`) for inspection from non-React code
 * such as InteractionManager bridges; React code should use
 * {@link usePolylineMode} instead.
 */
const polylineModeActiveAtom = atom<boolean>(false);
export { polylineModeActiveAtom as _unsafePolylineModeActiveAtom };

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
 * Two paths activate the mode:
 *
 * 1. **Toolbar toggle** — primes the UX for creating a new polyline. No
 *    overlay is selected yet.
 * 2. **Selection of a 2D polyline** — auto-activates the mode (if not
 *    already) and installs an {@link InteractivePolylineHandler} on the
 *    selected overlay via `scene.enterInteractiveMode`.
 *
 * The mode exits when:
 *
 * - The deactivation function is called explicitly, or
 * - Selection moves from a 2D polyline to a different label, or to nothing.
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

  // Selection drives the mode. Selecting a 2D polyline activates polyline
  // mode; selecting a non-polyline (or deselecting) exits it.
  // Toolbar activations with no selection are preserved (the previous selection
  // ref lets us distinguish "no change" from "user deselected").
  const prevSelectedLabelRef = useRef(selectedLabel);
  useEffect(() => {
    const prev = prevSelectedLabelRef.current;
    prevSelectedLabelRef.current = selectedLabel;

    const isPolyline2d =
      selectedLabel?.type === "Polyline" &&
      selectedLabel.overlay instanceof PolylineOverlay;

    const wasPolyline2d =
      prev?.type === "Polyline" && prev.overlay instanceof PolylineOverlay;

    if (isPolyline2d) {
      setPolylineModeActive(true);
    } else if (wasPolyline2d) {
      // Selection moved away from a polyline (different label or deselect).
      setPolylineModeActive(false);
    }
    // Otherwise the selection isn't (and wasn't) a polyline — leave the mode
    // alone so toolbar-driven activations stick around for creation.
  }, [selectedLabel, setPolylineModeActive]);

  // Mode + selection drive the installed handler.
  useEffect(() => {
    if (!scene) {
      return;
    }

    const isPolyline2d =
      selectedLabel?.type === "Polyline" &&
      selectedLabel.overlay instanceof PolylineOverlay;

    if (!polylineModeActive || !isPolyline2d) {
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

  // Empty-canvas click => create a new polyline seeded at the click position.
  // Only registered when mode is active and no polyline is currently being
  // edited (when one is, clicks go through the installed interactive handler).
  const createPolyline = useCreate(POLYLINE);
  const createPolylineRef = useRef(createPolyline);
  createPolylineRef.current = createPolyline;

  const isEditingPolyline =
    selectedLabel?.type === "Polyline" &&
    selectedLabel.overlay instanceof PolylineOverlay;

  useEffect(() => {
    if (!scene || !polylineModeActive || isEditingPolyline) {
      return null;
    }

    scene.setEmptyCanvasClickHandler((worldPoint) => {
      const rel = scene.absolutePointToRelative(worldPoint);
      createPolylineRef.current({ origin: [rel.x, rel.y] });
      return true;
    });

    return () => {
      scene.setEmptyCanvasClickHandler(null);
    };
  }, [isEditingPolyline, polylineModeActive, scene]);

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
