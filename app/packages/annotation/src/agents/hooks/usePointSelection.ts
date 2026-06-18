import { useCallback, useEffect, useRef } from "react";
import {
  DrawStyle,
  InteractiveKeypointHandler,
  KeypointOptions,
  KeypointOverlay,
  KeypointPointHitAction,
  Point,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventBus,
} from "@fiftyone/lighter";
import { atom, getDefaultStore, useAtom } from "jotai";
import { v4 as uuidv4 } from "uuid";
import { ClickEventModifiers } from "@fiftyone/utilities";
import { useAnnotationContext } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/useAnnotationContext";
import {
  NEGATIVE_POINT_VARIANT,
  POSITIVE_POINT_VARIANT,
  type PointSelectionVariant,
  resolvePointVariant,
} from "./resolvePointVariant";

// Re-export the variant identifiers so existing callers can continue to
// import them from `./usePointSelection`.
export {
  NEGATIVE_POINT_VARIANT,
  POSITIVE_POINT_VARIANT,
  type PointSelectionVariant,
};

/** Mapping of supported variant styles to draw styles. */
const POINT_SELECTION_VARIANT_STYLES: Record<PointSelectionVariant, DrawStyle> =
  {
    [POSITIVE_POINT_VARIANT]: {
      fillStyle: "#1e7d45", // todo reference from voodo
      strokeStyle: "#ffffff",
    },
    [NEGATIVE_POINT_VARIANT]: {
      fillStyle: "#c33636", // todo reference from voodo
      strokeStyle: "#ffffff",
    },
  };

export interface PointSelection {
  /**
   * Activates point selection.
   */
  activate(): void;

  /**
   * Deactivates point selection. Disables interactivity with the point
   * selection business logic.
   */
  deactivate(): void;

  /**
   * Clears all placed points while keeping point selection active. The
   * overlay and interactive handler remain in place — the user can continue
   * placing new points on an empty canvas.
   */
  clearPoints(): void;

  /** The current activation status of the point selection tool. */
  isActive: boolean;
}

/**
 * Point hit action resolver; clicking on an existing point should delete it.
 */
const resolvePointHit = () => KeypointPointHitAction.DELETE;

/**
 * Maintains a reference to the keypoint overlay created for point selection.
 *
 * Overlay is created when point selection is activated, and removed when
 * point selection is deactivated.
 */
const keypointOverlayIdAtom = atom<string | null>(null);
/**
 * Maintains a boolean flag to indicate whether the point selection mode is
 * currently active.
 */
const pointSelectionActiveAtom = atom(false);
/**
 * Shared reference to the interactive handler for the active point selection
 * session. Held in an atom so activation and deactivation can happen from
 * different component instances of the hook.
 */
const interactiveHandlerAtom = atom<InteractiveKeypointHandler | null>(null);

/**
 * Hook which provides activation/deactivation functions for point selection.
 */
export const usePointSelection = (): PointSelection => {
  const [keypointOverlayId, setKeypointOverlayId] = useAtom(
    keypointOverlayIdAtom
  );
  const [isActive, setIsActive] = useAtom(pointSelectionActiveAtom);
  // deactivate() reads the current handler fresh from the store (see
  // comment in `deactivate`), so we only need the setter side here.
  const [, setInteractiveHandler] = useAtom(interactiveHandlerAtom);

  const { getOverlay, scene, overlayFactory } = useLighter();
  const eventBus = useLighterEventBus(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );

  const { selected } = useAnnotationContext();
  const selectedLabelRef = useRef(selected?.label);
  selectedLabelRef.current = selected?.label;

  // Closure around currently-selected label
  const resolveVariant = useCallback(
    (relativePoint: Point, ctx: ClickEventModifiers): PointSelectionVariant =>
      resolvePointVariant(relativePoint, ctx, selectedLabelRef.current),
    []
  );

  // Guards read fresh from the jotai store so a deactivate→activate pair
  // (e.g. AI right-click finalize) in the same tick doesn't no-op on a
  // stale closure value of `isActive`.
  const activate = useCallback(() => {
    if (getDefaultStore().get(pointSelectionActiveAtom)) {
      return;
    }

    if (scene) {
      // Create a new keypoint overlay;
      // this will maintain the set of positive and negative points
      const overlay = overlayFactory.create<KeypointOptions, KeypointOverlay>(
        "keypoint",
        {
          id: uuidv4(),
          label: { label: "", points: [] },
          field: "",
          variantStyles: POINT_SELECTION_VARIANT_STYLES,
        }
      );
      // UI scaffolding; exclude from persistence
      overlay.isPersistent = false;

      setKeypointOverlayId(overlay.id);
      scene.addOverlay(overlay);

      // Enter interactive mode with a keypoint handler;
      // this will allow for creating/removing points.
      const handler = new InteractiveKeypointHandler(
        overlay,
        eventBus,
        resolveVariant,
        resolvePointHit
      );
      setInteractiveHandler(handler);
      scene.enterInteractiveMode(handler);

      setIsActive(true);
    }
  }, [
    eventBus,
    overlayFactory,
    resolveVariant,
    scene,
    setInteractiveHandler,
    setIsActive,
    setKeypointOverlayId,
  ]);

  const deactivate = useCallback(() => {
    const store = getDefaultStore();
    if (!store.get(pointSelectionActiveAtom)) {
      return;
    }

    // Read the handler + overlay id fresh from the store rather than from
    // closure. Same rationale as the activate guard: a same-tick
    // activate→deactivate pair (e.g. AI right-click finalize) has no
    // re-render between, so the useAtom values captured by useCallback are
    // still pre-activate `null`s. Reading fresh ensures cleanup tears down
    // the resources activate just installed.
    const currentHandler = store.get(interactiveHandlerAtom);
    const currentOverlayId = store.get(keypointOverlayIdAtom);

    // Points are ephemeral:
    // drop any undo/redo entries pushed before tearing down interactive mode
    currentHandler?.pruneCommands();
    setInteractiveHandler(null);

    // Clear the interactive keypoint handler; deactivates point interaction
    scene?.exitInteractiveMode();

    // Remove the keypoint overlay; removes rendered points from the scene
    if (currentOverlayId) {
      scene?.removeOverlay(currentOverlayId);
      setKeypointOverlayId(null);
    }

    setIsActive(false);
  }, [scene, setInteractiveHandler, setIsActive, setKeypointOverlayId]);

  // Clear points from the overlay without removing the overlay from the scene
  const clearPoints = useCallback(() => {
    if (!keypointOverlayId || !scene) {
      return;
    }

    const overlay = getOverlay(keypointOverlayId);
    if (overlay && overlay instanceof KeypointOverlay) {
      overlay.clearPoints();
    }
  }, [getOverlay, keypointOverlayId, scene]);

  // Resets the state atoms without interacting with the scene. Use this when
  // the underlying scene has already been destroyed (e.g. sample navigation)
  // and the overlay/handler references are now stale.
  const reset = useCallback(() => {
    setIsActive(false);
    setKeypointOverlayId(null);
    setInteractiveHandler(null);
  }, [setInteractiveHandler, setIsActive, setKeypointOverlayId]);

  return { activate, clearPoints, deactivate, isActive, reset };
};

/**
 * Singleton hook which keeps point selection state coherent with the lighter
 * scene lifecycle. When the modal navigates to a new sample, the previous
 * `Scene2D` is destroyed and a new one takes its place — the keypoint overlay
 * and interactive handler go with it, but the activation atoms persist. This
 * hook detects that drift and rebuilds the tool on the new scene so the user
 * stays in point selection mode across navigation.
 *
 * **Wire once at the composition root** alongside the other
 * `useRegister*` handlers.
 */
export const useSyncPointSelectionWithScene = () => {
  const { scene } = useLighter();
  const { activate, reset } = usePointSelection();

  // Refs decouple effect re-runs from callback identity churn — usePointSelection
  // returns a fresh object on every render.
  const activateRef = useRef(activate);
  const resetRef = useRef(reset);
  activateRef.current = activate;
  resetRef.current = reset;

  useEffect(() => {
    if (!scene) {
      return;
    }

    const store = getDefaultStore();
    if (!store.get(pointSelectionActiveAtom)) {
      return;
    }

    const overlayId = store.get(keypointOverlayIdAtom);
    if (overlayId && scene.getOverlay(overlayId)) {
      // Overlay still belongs to the current scene
      return;
    }

    // Atoms reference an overlay/handler from a destroyed scene; rebuild.
    resetRef.current();
    activateRef.current();
  }, [scene]);
};
