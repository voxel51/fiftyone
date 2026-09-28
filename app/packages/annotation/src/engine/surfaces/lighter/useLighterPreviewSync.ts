import type { Scene2D } from "@fiftyone/lighter";
import { useEffect } from "react";

import type { AnnotationEngine } from "../../core/engine";
import { decodeEntityId } from "../../identity/entityId";
import {
  LABEL_PATCH_SIGNAL,
  type LabelPatchSignal,
} from "../../signals/labelPatch";

/**
 * Mirror live label-patch previews onto this scene's overlays, render-only. A
 * surface (e.g. the sidebar form) publishes a patch during a continuous gesture;
 * we merge it over the committed label and apply it to the matching overlay
 * without committing — `applyLabel` touches only overlay render state, so the
 * dispatch guard holds. The committed value re-baselines via the normal
 * reproject.
 */
export const useLighterPreviewSync = (
  engine: AnnotationEngine,
  dataset: string,
  sample: string,
  scene: Scene2D | null,
): void => {
  useEffect(() => {
    return engine.subscribeSignal<LabelPatchSignal>(
      LABEL_PATCH_SIGNAL,
      "*",
      (patch, key) => {
        let identity: ReturnType<typeof decodeEntityId>;
        try {
          identity = decodeEntityId(key);
        } catch {
          return;
        }

        // scope to this surface's entity namespace — instanceIds can overlap
        // across datasets/samples
        if (identity.dataset !== dataset || identity.ref.sample !== sample) {
          return;
        }

        const overlay = scene?.getOverlay(identity.ref.instanceId);

        if (!overlay) {
          return;
        }

        // the overlay's own label goes stale after a canvas gesture commits
        // (the commit is not echoed back onto it), so merge over the engine's
        const committed = engine.getLabel(identity.ref) ?? overlay.label;

        overlay.applyLabel({
          ...(committed as Record<string, unknown>),
          ...patch,
        } as Parameters<typeof overlay.applyLabel>[0]);
      },
    );
  }, [engine, dataset, sample, scene]);
};
