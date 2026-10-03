/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { BaseOverlay } from "@fiftyone/lighter";
import { DetectionOverlay, KeypointOverlay } from "@fiftyone/lighter";
import { useCallback } from "react";

import type { AdapterMap } from "../../bridge/types";
import type { AnnotationEngine } from "../../core/engine";
import { stampFrame, toLabelRef } from "../../identity/ref";
import type { LighterDescriptor } from "./adapters";

interface UseFrameClipArgs {
  engine: AnnotationEngine;
  sample: string;
  adapters: AdapterMap<BaseOverlay, LighterDescriptor>;
  frameOf?: (path: string) => number | undefined;
  shouldClip?: (path: string) => boolean;
  onDiscardDraft?: (overlayId: string) => void;
}

/**
 * Clips a finished gesture to the media frame. When nothing is left inside
 * it, an edit re-applies its stored label and a fresh draw is handed to
 * `onDiscardDraft`, and the callback returns false so the caller skips the
 * commit.
 */
export const useFrameClip = ({
  engine,
  sample,
  adapters,
  frameOf,
  shouldClip,
  onDiscardDraft,
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
        adapters[engine.getLabelType(overlay.field)]?.updateHandle(
          overlay,
          stored,
        );
      } else {
        onDiscardDraft?.(overlay.id);
      }

      return false;
    },
    [adapters, engine, frameOf, onDiscardDraft, sample, shouldClip],
  );
