import { usePublishLabelPreview } from "@fiftyone/annotation";
import { useCurrentDatasetId } from "@fiftyone/state";
import type { LabelData } from "@fiftyone/utilities";
import { useCallback } from "react";

import { useAnnotationContext } from "./useAnnotationContext";

/**
 * Sidebar binding for live label preview. Returns a `(name, value)` callback
 * that publishes a render-only patch for the selected label — addressed by the
 * engine anchor (`selected.ref`, which carries `instanceId` and `frame`) — so
 * observing surfaces like the canvas overlay preview the in-progress edit
 * without a commit. The actual write still happens separately, on release.
 */
export const useLivePreview = (readOnly: boolean) => {
  const { selected } = useAnnotationContext();
  const ref = selected?.ref ?? null;
  const dataset = useCurrentDatasetId() ?? "";
  const publishPreview = usePublishLabelPreview();

  return useCallback(
    (name: string, value: unknown) => {
      if (readOnly || !ref) return;

      publishPreview(dataset, ref, { [name]: value } as Partial<LabelData>);
    },
    [publishPreview, readOnly, ref, dataset],
  );
};
