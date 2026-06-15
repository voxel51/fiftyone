import {
  useCurrentSampleId,
  useInteraction3dSample,
  useModalSample,
  useModalSampleSchema,
} from "@fiftyone/state";
import { useEffect } from "react";
import { useSampleInstance } from "./useSample";

/**
 * Hydrate the pinned 3D scene's {@link Sample} when a grouped modal renders it
 * alongside a *different* selected 2D slice.
 *
 * The pinned 3D slice is a distinct sample document, keyed (in the engine and
 * the looker-3d working store) by `currentSampleId` rather than the selected
 * modal sample. When the two differ, this feeds that sample's own Sample from
 * the 3D scene's data + schema so the store the engine registers for it
 * resolves real labels (live 3D working-store edits land on top via
 * `useSync3dSample`). When the 3D slice is itself selected — or there is no
 * separate 3D scene — the ids coincide and {@link useSyncModalSample} owns the
 * single Sample, so this is inert.
 *
 * Mount once at the annotation root, beside {@link useSyncModalSample}.
 */
export const useSync3dModalSample = (): void => {
  const threeDId = useCurrentSampleId();
  const modalId = useModalSample()?.sample?._id;
  const scene = useInteraction3dSample();
  const schema = useModalSampleSchema();

  // the 3D scene's sample, only while it is co-resident with a different
  // selected slice; otherwise the throwaway sentinel instance (never written)
  const sceneId = threeDId && threeDId !== modalId ? threeDId : undefined;
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
