import { useCallback } from "react";
import type {
  DrawStyle,
  KeypointVariantResolverContext,
  Point,
} from "@fiftyone/lighter";
import {
  InteractiveKeypointHandler,
  KeypointOptions,
  KeypointOverlay,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventBus,
} from "@fiftyone/lighter";
import { atom, useAtom } from "jotai";
import { v4 as uuidv4 } from "uuid";

/** Variant keys used by point selection. */
export const POSITIVE_POINT_VARIANT = "positive" as const;
export const NEGATIVE_POINT_VARIANT = "negative" as const;

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
   * Activates point selection. The optional resolver is invoked for each
   * placed point and should return the variant key to associate with it.
   */
  activate(
    resolveVariant?: (
      relativePoint: Point,
      ctx: KeypointVariantResolverContext
    ) => PointSelectionVariant
  ): void;

  /**
   * Deactivates point selection. Disables interactivity with the point
   * selection business logic.
   */
  deactivate(): void;

  /** The current activation status of the point selection tool. */
  isActive: boolean;
}

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
 * Hook which provides activation/deactivation functions for point selection.
 */
export const usePointSelection = (): PointSelection => {
  const { scene, overlayFactory } = useLighter();
  const eventBus = useLighterEventBus(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );

  const [keypointOverlayId, setKeypointOverlayId] = useAtom(
    keypointOverlayIdAtom
  );
  const [isActive, setIsActive] = useAtom(pointSelectionActiveAtom);

  const activate = useCallback(
    (
      resolveVariant?: (
        relativePoint: Point,
        ctx: KeypointVariantResolverContext
      ) => PointSelectionVariant
    ) => {
      if (isActive) {
        return;
      }

      if (scene) {
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

        scene.enterInteractiveMode(
          new InteractiveKeypointHandler(overlay, eventBus, resolveVariant)
        );

        setIsActive(true);
      }
    },
    [
      eventBus,
      isActive,
      overlayFactory,
      scene,
      setIsActive,
      setKeypointOverlayId,
    ]
  );

  const deactivate = useCallback(() => {
    if (!isActive) {
      return;
    }

    scene?.exitInteractiveMode();

    if (keypointOverlayId) {
      scene?.removeOverlay(keypointOverlayId);
      setKeypointOverlayId(null);
    }

    setIsActive(false);
  }, [isActive, keypointOverlayId, scene, setIsActive, setKeypointOverlayId]);

  return { activate, deactivate, isActive };
};
