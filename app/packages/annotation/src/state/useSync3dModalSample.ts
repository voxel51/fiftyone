import { useInteraction3dSample, useModalSampleSchema } from "@fiftyone/state";
import { useEffect } from "react";
import { useThreeDSceneSampleId } from "./useGroupAnnotationSample";
import { useSampleInstance } from "./useSample";

/**
 * Hydrate the pinned 3D scene's {@link Sample} when a grouped modal renders it
 * alongside a *different* selected 2D slice.
 *
 * The pinned 3D slice is a distinct sample document, keyed by its stable scene
 * id ({@link useThreeDSceneSampleId}). When that differs from the selected 2D
 * slice, this feeds the scene's own Sample from its data + schema so the store
 * the engine registers for it resolves real labels (live 3D edits land on top
 * via the looker-3d surface controller). When there is no separate 3D scene the
 * id is `undefined` and {@link useSyncModalSample} owns the single Sample, so
 * this is inert.
 *
 * Mount once at the annotation root, beside {@link useSyncModalSample}.
 */
export const useSync3dModalSample = (): void => {
  const scene = useInteraction3dSample();
  const schema = useModalSampleSchema();

  // the 3D scene's sample, only while it is co-resident with a different
  // selected slice; otherwise the throwaway sentinel instance (never written)
  const sceneId = useThreeDSceneSampleId();
  const sample = useSampleInstance(sceneId ?? "");
  const data = sceneId
    ? (scene?.sample as Record<string, unknown> | undefined)
    : undefined;

  useEffect(() => {
    if (!sceneId) {
      return undefined;
    }

    sample.clear();
    return () => sample.clear();
  }, [sceneId, sample]);

  useEffect(() => {
    if (data) {
      sample.setData(data);
    }
  }, [sample, data]);

  useEffect(() => {
    if (sceneId && schema) {
      sample.setSchema(schema);
    }
  }, [sceneId, sample, schema]);
};
