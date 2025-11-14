/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import {
  useAnnotationEventBus,
  useAnnotationEventHandler,
} from "@fiftyone/annotation";
import { JSONDeltas, patchSample } from "@fiftyone/core/src/client";
import { transformSampleData } from "@fiftyone/core/src/client/transformer";
import { parseTimestamp } from "@fiftyone/core/src/client/util";
import {
  OpType,
  buildJsonPath,
  buildLabelDeltas,
} from "@fiftyone/core/src/components/Modal/Lighter/deltas";
import { Sample } from "@fiftyone/looker";
import { isSampleIsh } from "@fiftyone/looker/src/util";
import {
  AnnotationLabel,
  datasetId as fosDatasetId,
  modalSample,
  useRefreshSample,
} from "@fiftyone/state";
import { Field } from "@fiftyone/utilities";
import { useCallback, useMemo } from "react";
import { useRecoilValue } from "recoil";

/**
 * Hook that handles annotation persistence events.
 */
export const useAnnotationPersistence = () => {
  const datasetId = useRecoilValue(fosDatasetId);
  const currentSample = useRecoilValue(modalSample)?.sample;
  const refreshSample = useRefreshSample();
  const eventBus = useAnnotationEventBus();

  // The annotation endpoint requires a version token in order to execute
  // mutations.
  // Updated version tokens are returned in the response body,
  // but the server also allows the current sample timestamp to be used as
  // a version token.
  const versionToken = useMemo(() => {
    const isoTimestamp = parseTimestamp(
      currentSample?.last_modified_at as unknown as string
    )?.toISOString();

    // server doesn't like the iso timestamp ending in 'Z'
    if (isoTimestamp?.endsWith("Z")) {
      return isoTimestamp.substring(0, isoTimestamp.length - 1);
    } else {
      return isoTimestamp;
    }
  }, [currentSample?.last_modified_at]);

  const handlePatchSample = useCallback(
    /**
     * Returns true if a patch was applied successfully
     *
     * @param sampleDeltas Deltas to apply
     */
    async (sampleDeltas: JSONDeltas): Promise<boolean> => {
      if (!datasetId || !currentSample?._id || !versionToken) {
        return false;
      }

      if (sampleDeltas.length > 0) {
        try {
          const response = await patchSample({
            datasetId,
            sampleId: currentSample._id,
            deltas: sampleDeltas,
            versionToken,
          });

          // transform response data to match the graphql sample format
          const cleanedSample = transformSampleData(response.sample);
          if (isSampleIsh(cleanedSample)) {
            refreshSample(cleanedSample as Sample);
          } else {
            console.error(
              "response data does not adhere to sample format",
              cleanedSample
            );
          }
        } catch (error) {
          console.error("error patching sample", error);

          return false;
        }
      }

      return true;
    },
    [currentSample, datasetId, refreshSample, versionToken]
  );

  // callback which handles both mutation (upsert) and deletion
  const handlePersistenceEvent = useCallback(
    async (
      annotationLabel: AnnotationLabel,
      schema: Field,
      opType: OpType
    ): Promise<boolean> => {
      if (!currentSample) {
        console.error("missing sample data!");
        return false;
      }

      if (!annotationLabel) {
        console.error("missing annotation label!");
        return false;
      }

      // calculate label deltas between current sample data and new label data
      const sampleDeltas = buildLabelDeltas(
        currentSample,
        annotationLabel,
        schema,
        opType
      ).map((delta) => ({
        ...delta,
        // convert label delta to sample delta
        path: buildJsonPath(annotationLabel.path, delta.path),
      }));

      return await handlePatchSample(sampleDeltas);
    },
    [currentSample, handlePatchSample]
  );

  const handlePersistOverlay = useCallback(
    async (data: {
      sourceId: string;
      label: AnnotationLabel;
      schema: Field;
    }) => {
      const success = await handlePersistenceEvent(
        data.label,
        data.schema,
        "mutate"
      );

      if (success) {
        eventBus.dispatch("annotation:notification:upsertSuccess", {
          sourceId: data.sourceId,
          type: "upsert",
        });
      } else {
        eventBus.dispatch("annotation:notification:upsertError", {
          sourceId: data.sourceId,
          type: "upsert",
        });
      }
    },
    [handlePersistenceEvent, eventBus]
  );

  const handleRemoveOverlay = useCallback(
    async (data: {
      sourceId: string;
      label: AnnotationLabel;
      schema: Field;
    }) => {
      const success = await handlePersistenceEvent(
        data.label,
        data.schema,
        "delete"
      );

      if (success) {
        eventBus.dispatch("annotation:notification:deleteSuccess", {
          sourceId: data.sourceId,
          type: "delete",
        });
      } else {
        eventBus.dispatch("annotation:notification:deleteError", {
          sourceId: data.sourceId,
          type: "delete",
        });
      }
    },
    [handlePersistenceEvent, eventBus]
  );

  useAnnotationEventHandler("annotation:command:upsert", handlePersistOverlay);
  useAnnotationEventHandler("annotation:command:delete", handleRemoveOverlay);
};
