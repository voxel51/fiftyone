import { useCallback, useRef } from "react";
import {
  DetectionOverlay,
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
import { atom, useAtom } from "jotai";
import { v4 as uuidv4 } from "uuid";
import { ClickEventModifiers } from "@fiftyone/utilities";
import { AnnotationLabel } from "@fiftyone/state";
import { useAnnotationContext } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/state";

/** Positive points are explicitly *included* in inference results. */
export const POSITIVE_POINT_VARIANT = "positive" as const;
/** Negative points are explicitly *excluded* from inference results. */
export const NEGATIVE_POINT_VARIANT = "negative" as const;

/** Union of supported point selection variants. */
export type PointSelectionVariant =
  | typeof POSITIVE_POINT_VARIANT
  | typeof NEGATIVE_POINT_VARIANT;

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
 * Resolve the point variant with the given context.
 *
 * Points placed on the current label's mask are interpreted as negative;
 * points placed off-mask are positive.
 * If shift is pressed while clicking, the variants are inverted.
 *
 * @param relativePoint Point in relative coordinates
 * @param shiftKey Flag indicating whether the shift key is pressed
 * @param label Label to use for mask hit detection
 */
const resolvePointVariant = (
  relativePoint: Point,
  { shiftKey }: ClickEventModifiers,
  label: AnnotationLabel
): PointSelectionVariant => {
  const onMask =
    label && label.overlay instanceof DetectionOverlay
      ? label.overlay.containsMaskPixel(relativePoint)
      : false;

  const variant = onMask ? NEGATIVE_POINT_VARIANT : POSITIVE_POINT_VARIANT;

  return !shiftKey
    ? // normal variant if shift key is not pressed
      variant
    : // otherwise invert the variant
    variant === POSITIVE_POINT_VARIANT
    ? NEGATIVE_POINT_VARIANT
    : POSITIVE_POINT_VARIANT;
};

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

  const activate = useCallback(() => {
    if (isActive) {
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
    isActive,
    overlayFactory,
    resolveVariant,
    scene,
    setInteractiveHandler,
    setIsActive,
    setKeypointOverlayId,
  ]);

  const deactivate = useCallback(() => {
    if (!isActive) {
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
    isActive,
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
