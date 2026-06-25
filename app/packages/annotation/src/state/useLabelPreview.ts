import { useCallback } from "react";

import {
  type LabelPatchSignal,
  type LabelRef,
  publishLabelPreview,
} from "../engine";
import { useAnnotationEngine } from "./useEngine";

/**
 * Declarative live preview: a stable callback bound to the session engine that
 * publishes a render-only label patch (no commit). Surfaces call it during a
 * continuous gesture (e.g. a slider drag) to preview an edit before committing.
 */
export const usePublishLabelPreview = () => {
  const engine = useAnnotationEngine();

  return useCallback(
    (dataset: string, ref: LabelRef, patch: LabelPatchSignal) =>
      publishLabelPreview(engine, dataset, ref, patch),
    [engine]
  );
};
