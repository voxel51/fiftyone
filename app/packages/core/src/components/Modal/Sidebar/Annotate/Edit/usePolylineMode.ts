import {
  InteractiveCreationHandler,
  InteractivePolylineHandler,
  KeypointPointHitAction,
  KeypointPointHitContext,
  PolylineEmptyHitAction,
  PolylineEmptyHitContext,
  PolylineOverlay,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventBus,
} from "@fiftyone/lighter";
import { isPatchesView } from "@fiftyone/state";
import { POLYLINE } from "@fiftyone/utilities";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRecoilValue } from "recoil";
import {
  type AnnotationContextSelected,
  type CreateOptions,
  useAnnotationContext,
  useAnnotationFields,
} from "./useAnnotationContext";

/**
 * Whether a 2D polyline is the current selection. Keys off the normalized
 * selection `type`: a committed polyline reconciles back under the plural
 * `Polylines` field type, which `currentType` folds into `Polyline` — the raw
 * `label.type` would miss it and leave the edit tool disarmed.
 */
const is2dPolylineSelected = (
  selected: AnnotationContextSelected | null | undefined,
): boolean =>
  selected?.type === POLYLINE && selected.overlay instanceof PolylineOverlay;

/**
 * Active flag for 2D polyline annotation mode. While `true`, selecting a
 * polyline overlay installs an {@link InteractivePolylineHandler} on it; the
 * handler is torn down on selection change or mode deactivation.
 */
/** Frame-level field paths (`frames.<field>`) — i.e. video. */
const FRAMES_PREFIX = "frames.";

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
 * Read-only consumer hook for 2D polyline annotation mode.
 *
 * Returns the active flag, tooltip/disabled state, and the public
 * activate/deactivate/toggle methods. Safe to call from any number of
 * components — it has no side effects of its own.
 *
 * The actual install/teardown of the {@link InteractivePolylineHandler} lives
 * in {@link usePolylineModeInstaller}, which must be called exactly once in
 * the modal tree.
 */
export const usePolylineMode = () => {
  const [polylineModeActive, setPolylineModeActive] = useAtom(
    polylineModeActiveAtom,
  );
  const isPatchView = useRecoilValue(isPatchesView);
  const { fields } = useAnnotationFields(POLYLINE);

  const noActiveFields = fields.length === 0;
  const disabled = isPatchView || noActiveFields;

  const tooltip = isPatchView
    ? "Editing polylines is not supported in this view"
    : noActiveFields
      ? "No active fields"
      : polylineModeActive
        ? "Exit polyline mode"
        : "Create new polylines";

  const activatePolylineMode = useCallback(
    () => setPolylineModeActive(true),
    [setPolylineModeActive],
  );

  const deactivatePolylineMode = useCallback(
    () => setPolylineModeActive(false),
    [setPolylineModeActive],
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
    ],
  );
};

/**
 * Owner hook for the 2D polyline annotation handler lifecycle. Must be called
 * exactly once per modal scene — typically from `useBridge`.
 *
 * Two paths activate the mode:
 *
 * 1. **Toolbar toggle** — primes the UX for creating a new polyline. No
 *    overlay is selected yet; an {@link InteractiveCreationHandler} is
 *    installed.
 * 2. **Selection of a 2D polyline** — auto-activates the mode (if not
 *    already) and installs an {@link InteractivePolylineHandler} on the
 *    selected overlay via `scene.enterInteractiveMode`.
 *
 * The mode exits when:
 *
 * - The deactivation function (from {@link usePolylineMode}) is called
 *   explicitly (toolbar toggle, generic mode-quit gesture, etc.), or
 * - Selection moves from a 2D polyline to a different (non-polyline) label.
 *
 * Deselecting entirely does NOT exit the mode — the user is still in polyline
 * mode, just without an active edit target, ready to draw a new one.
 */
export const usePolylineModeInstaller = (): void => {
  const polylineModeActive = useAtomValue(polylineModeActiveAtom);
  const setPolylineModeActive = useSetAtom(polylineModeActiveAtom);
  const { scene } = useLighter();
  const eventBus = useLighterEventBus(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID,
  );
  const { selected, createNew } = useAnnotationContext();

  // The handler currently installed via scene.enterInteractiveMode, or null
  // when the mode is off. Holds either an `InteractivePolylineHandler` (when
  // a polyline is selected) or an `InteractiveCreationHandler` (when polyline
  // mode is active and a new polyline is being created).
  const installedHandlerRef = useRef<
    InteractivePolylineHandler | InteractiveCreationHandler | null
  >(null);

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
  const prevSelectedRef = useRef(selected);
  useEffect(() => {
    const prev = prevSelectedRef.current;
    prevSelectedRef.current = selected;

    const isPolyline2d = is2dPolylineSelected(selected);
    const wasPolyline2d = is2dPolylineSelected(prev);

    if (isPolyline2d) {
      setPolylineModeActive(true);
    } else if (wasPolyline2d && selected?.label) {
      // Switched from a polyline to a different non-polyline label.
      setPolylineModeActive(false);
    }
  }, [selected, setPolylineModeActive]);

  // Stable ref so the creation handler's `onCreate` always sees the latest
  // create function without needing to swap the installed handler.
  const createPolyline = useCallback(
    (options?: CreateOptions) => createNew(POLYLINE, options),
    [createNew],
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

    const isPolyline2d = is2dPolylineSelected(selected);

    if (!polylineModeActive) {
      exitInstalledHandler();
      return;
    }

    if (isPolyline2d) {
      const targetOverlay = selected!.label!.overlay as PolylineOverlay;

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
        resolveEmptyHit,
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
        const created = createPolylineRef.current({ origin: [rel.x, rel.y] });

        // A drawn shape on video has to announce itself so the video surface can
        // establish the track — first keyframe plus the auto-extend filler — which
        // is what makes "draw on one frame, scrub forward, drag the point" work
        // without extending the track by hand every time. A drawn detection gets
        // this from the interaction manager's SETTING pointer-up path; the polyline
        // creation flow (creation handler -> createNew -> polyline handler) has no
        // equivalent, so without this a drawn polyline never became a track.
        //
        // Frame-level fields only: an image polyline is already committed by
        // `createNew`'s vertex seeding, and re-announcing it would only
        // re-commit the same label. On video the seeding commit also ran
        // (frame-stamped), so the bridge's establish commit is a value-equal
        // no-op — the undo stack drops it — but the establish is still what
        // stashes the gesture key and hands the draw to the video surface.
        // Lighter records no undo command of its own here (the annotation engine
        // holds undo authority while mounted), so this pushes no duplicate.
        if (created?.path?.startsWith(FRAMES_PREFIX)) {
          // The video handler reads geometry from the engine anchor, not from
          // this payload, so a zero rect is enough to satisfy the event shape.
          const bounds = { x: 0, y: 0, width: 0, height: 0 };

          eventBus.dispatch("lighter:overlay-establish", {
            id: handler.id,
            overlayId: created.data._id as string,
            handler,
            startBounds: bounds,
            startPosition: { x: bounds.x, y: bounds.y },
            bounds,
          });
        }
      },
    });

    scene.enterInteractiveMode(handler);
    installedHandlerRef.current = handler;
  }, [eventBus, exitInstalledHandler, polylineModeActive, scene, selected]);

  // Tear down on unmount (e.g., scene swap, modal close).
  useEffect(() => {
    return () => {
      exitInstalledHandler();
    };
  }, [exitInstalledHandler]);
};
