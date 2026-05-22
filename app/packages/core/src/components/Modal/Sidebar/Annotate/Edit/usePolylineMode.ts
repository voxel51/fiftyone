import {
  InteractiveCreationHandler,
  InteractivePolylineHandler,
  KeypointPointHitAction,
  KeypointPointHitContext,
  PolylineEmptyHitAction,
  PolylineEmptyHitContext,
  PolylineOverlay,
  useLighter,
} from "@fiftyone/lighter";
import {
  AnnotationLabel,
  isPatchesView,
  PolylineAnnotationLabel,
} from "@fiftyone/state";
import { POLYLINE } from "@fiftyone/utilities";
import { atom, useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRecoilValue } from "recoil";
import { fieldsOfType } from "./useAnnotationContext/selectors";
import {
  type CreateOptions,
  useAnnotationContext,
} from "./useAnnotationContext";

/**
 * Utility method to determine if an {@link AnnotationLabel} is a 2d polyline.
 *
 * @param label Label to check
 */
const is2dPolyline = (
  label: AnnotationLabel
): label is PolylineAnnotationLabel => {
  return label?.type === "Polyline" && label.overlay instanceof PolylineOverlay;
};

/**
 * Active flag for 2D polyline annotation mode. While `true`, selecting a
 * polyline overlay installs an {@link InteractivePolylineHandler} on it; the
 * handler is torn down on selection change or mode deactivation.
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
 * - The deactivation function is called explicitly (toolbar toggle, generic
 *   mode-quit gesture, etc.), or
 * - Selection moves from a 2D polyline to a different (non-polyline) label.
 *
 * Deselecting entirely does NOT exit the mode — the user is still in polyline
 * mode, just without an active edit target, ready to draw a new one.
 */
export const usePolylineMode = () => {
  const [polylineModeActive, setPolylineModeActive] = useAtom(
    polylineModeActiveAtom
  );
  const { scene } = useLighter();
  const { selected, createNew } = useAnnotationContext();
  const isPatchView = useRecoilValue(isPatchesView);
  const fields = useAtomValue(fieldsOfType(POLYLINE));

  // The handler currently installed via scene.enterInteractiveMode, or null
  // when the mode is off. Holds either an `InteractivePolylineHandler` (when
  // a polyline is selected) or an `InteractiveCreationHandler` (when polyline
  // mode is active and a new polyline is being created).
  const installedHandlerRef = useRef<
    InteractivePolylineHandler | InteractiveCreationHandler | null
  >(null);

  const noActiveFields = fields.length === 0;
  const disabled = isPatchView || noActiveFields;

  const tooltip = isPatchView
    ? "Editing polylines is not supported in this view"
    : noActiveFields
    ? "No active fields"
    : polylineModeActive
    ? "Exit polyline mode"
    : "Create new polylines";

  const exitInstalledHandler = useCallback(() => {
    if (!installedHandlerRef.current) {
      return;
    }

    scene?.exitInteractiveMode();
    installedHandlerRef.current = null;
  }, [scene]);

  // Selection drives the mode. Selecting a 2D polyline activates polyline
  // mode; switching from a polyline to a *different* non-polyline label
  // exits it. Deselecting entirely leaves the mode active so the user can
  // immediately draw another polyline — exiting requires an explicit gesture
  // (toolbar toggle or generic mode-quit).
  const prevSelectedLabelRef = useRef(selected.label);
  useEffect(() => {
    const prev = prevSelectedLabelRef.current;
    prevSelectedLabelRef.current = selected.label;

    const isPolyline2d = is2dPolyline(selected.label);
    const wasPolyline2d = is2dPolyline(prev);

    if (isPolyline2d) {
      setPolylineModeActive(true);
    } else if (wasPolyline2d && selected.label) {
      // Switched from a polyline to a different non-polyline label.
      setPolylineModeActive(false);
    }
  }, [selected.label, setPolylineModeActive]);

  // Stable ref so the creation handler's `onCreate` always sees the latest
  // create function without needing to swap the installed handler.
  const createPolyline = useCallback(
    (options?: CreateOptions) => createNew(POLYLINE, options),
    [createNew]
  );
  const createPolylineRef = useRef(createPolyline);
  createPolylineRef.current = createPolyline;

  // Mode + selection drive the installed handler:
  //   - Polyline selected → `InteractivePolylineHandler` (editing).
  //   - Polyline mode on, no polyline selected → `InteractiveCreationHandler`
  //     (cursor + hover suppression + click-to-create).
  //   - Otherwise → no installed handler.
  useEffect(() => {
    if (!scene) {
      return;
    }

    const isPolyline2d = is2dPolyline(selected.label);

    if (!polylineModeActive) {
      exitInstalledHandler();
      return;
    }

    if (isPolyline2d) {
      const targetOverlay = selected.label!.overlay as PolylineOverlay;

      const installed = installedHandlerRef.current;
      if (
        installed instanceof InteractivePolylineHandler &&
        installed.overlay === targetOverlay
      ) {
        return;
      }

      exitInstalledHandler();

      const handler = new InteractivePolylineHandler(
        targetOverlay,
        resolvePointHit,
        undefined,
        resolveEmptyHit
      );

      scene.enterInteractiveMode(handler);
      installedHandlerRef.current = handler;

      // Seed activation from the cursor's last known position.
      // Without this, the next EXTEND click falls back to global-nearest
      // instead of the segment the user just clicked on.
      if (scene.hasOverlay(targetOverlay.id)) {
        const lastPixel = scene.getInteractionManager().getPixelCoordinates();
        if (lastPixel) {
          handler.activateSegmentAtWorldPoint(scene.screenToWorld(lastPixel));
        }
      }
      return;
    }

    // Mode active, no polyline selected; install creation handler
    if (installedHandlerRef.current instanceof InteractiveCreationHandler) {
      return;
    }

    exitInstalledHandler();

    const handler = new InteractiveCreationHandler({
      id: "interactive-polyline-creation-handler",
      onCreate: (worldPoint) => {
        const rel = scene.absolutePointToRelative(worldPoint);
        createPolylineRef.current({ origin: [rel.x, rel.y] });
      },
    });

    scene.enterInteractiveMode(handler);
    installedHandlerRef.current = handler;
  }, [exitInstalledHandler, polylineModeActive, scene, selected.label]);

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
