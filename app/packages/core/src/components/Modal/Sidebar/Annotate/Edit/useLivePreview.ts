import {
  useActiveAnnotationSampleId,
  usePublishLabelPreview,
} from "@fiftyone/annotation";
import { useCurrentDatasetId } from "@fiftyone/state";
import type { LabelData } from "@fiftyone/utilities";
import { useCallback, useRef } from "react";

import { useAnnotationContext } from "./useAnnotationContext";

export const useLivePreview = (readOnly: boolean) => {
  const { selected } = useAnnotationContext();
  const overlay = selected?.overlay;
  const field = selected?.field ?? null;
  const data = selected?.data;
  const sample = useActiveAnnotationSampleId();
  const dataset = useCurrentDatasetId() ?? "";
  const publishPreview = usePublishLabelPreview();

  const overlayRef = useRef(overlay);
  const fieldRef = useRef(field);
  const dataRef = useRef(data);
  const sampleRef = useRef(sample);
  const datasetRef = useRef(dataset);
  overlayRef.current = overlay;
  fieldRef.current = field;
  dataRef.current = data;
  sampleRef.current = sample;
  datasetRef.current = dataset;

  return useCallback(
    (name: string, value: unknown) => {
      const overlay = overlayRef.current;
      const field = fieldRef.current;

      if (readOnly || !field || !overlay) return;

      const instanceId =
        (dataRef.current as { _id?: string })?._id ?? overlay.id;

      publishPreview(
        datasetRef.current,
        { sample: sampleRef.current, path: field, instanceId },
        { [name]: value } as Partial<LabelData>
      );
    },
    [publishPreview, readOnly]
  );
};
