import { useCallback, useRef } from "react";
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
import { useAnnotationContext } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/state";
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
  const [interactiveHandler, setInteractiveHandler] = useAtom(
    interactiveHandlerAtom
  );

  const { getOverlay, scene, overlayFactory } = useLighter();
  const eventBus = useLighterEventBus(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );

  const { selectedLabel } = useAnnotationContext();
  const selectedLabelRef = useRef(selectedLabel);
  selectedLabelRef.current = selectedLabel;

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
    if (!getDefaultStore().get(pointSelectionActiveAtom)) {
      return;
    }

    // Points are ephemeral:
    // drop any undo/redo entries pushed before tearing down interactive mode
    interactiveHandler?.pruneCommands();
    setInteractiveHandler(null);

    // Clear the interactive keypoint handler; deactivates point interaction
    scene?.exitInteractiveMode();

    // Remove the keypoint overlay; removes rendered points from the scene
    if (keypointOverlayId) {
      scene?.removeOverlay(keypointOverlayId);
      setKeypointOverlayId(null);
    }

    setIsActive(false);
  }, [
    interactiveHandler,
    keypointOverlayId,
    scene,
    setInteractiveHandler,
    setIsActive,
    setKeypointOverlayId,
  ]);

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

  return { activate, clearPoints, deactivate, isActive };
};
