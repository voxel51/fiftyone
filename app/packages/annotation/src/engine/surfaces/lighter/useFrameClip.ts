/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { BaseOverlay, Scene2D } from "@fiftyone/lighter";
import { DetectionOverlay, KeypointOverlay } from "@fiftyone/lighter";
import { useCallback } from "react";

import type { SurfaceController } from "../../bridge/surfaceController";
import type { AnnotationEngine } from "../../core/engine";
import { stampFrame, toLabelRef } from "../../identity/ref";

interface UseFrameClipArgs {
  engine: AnnotationEngine;
  sample: string;
  scene: Scene2D | null | undefined;
  surface: SurfaceController<BaseOverlay>;
  frameOf?: (path: string) => number | undefined;
  shouldClip?: (path: string) => boolean;
}

/**
 * Clips a finished gesture to the media frame. When nothing is left inside
 * it, the overlay reverts to its stored label (or a fresh draw is discarded)
 * and the callback returns false so the caller skips the commit.
 */
export const useFrameClip = ({
  engine,
  sample,
  scene,
  surface,
  frameOf,
  shouldClip,
}: UseFrameClipArgs) =>
  useCallback(
    (overlay: BaseOverlay | undefined): boolean => {
      if (
        !(
          overlay instanceof DetectionOverlay ||
          overlay instanceof KeypointOverlay
        ) ||
        !shouldClip?.(overlay.field) ||
        overlay.clipToFrame() !== "empty"
      ) {
        return true;
      }

      const stored = engine.getLabel(
        toLabelRef(
          sample,
          stampFrame({ path: overlay.field, instanceId: overlay.id }, frameOf),
        ),
      );

      if (stored) {
        (overlay as BaseOverlay).applyLabel(
          stored as Parameters<BaseOverlay["applyLabel"]>[0],
        );
      } else {
        surface.selectHandle(undefined);
        scene?.removeOverlay(overlay.id);
      }

      return false;
    },
    [engine, frameOf, sample, scene, shouldClip, surface],
  );
