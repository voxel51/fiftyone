/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { OverlayEventDetail, Scene2D } from "@fiftyone/lighter";
import { LIGHTER_EVENTS } from "@fiftyone/lighter";
import { Sample } from "@fiftyone/looker";
import { isSampleIsh } from "@fiftyone/looker/src/util";
import {
  AnnotationLabel,
  datasetId as fosDatasetId,
  modalSample,
  snackbarErrors,
  snackbarMessage,
  useRefreshSample,
} from "@fiftyone/state";
import { useCallback, useEffect, useMemo } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { JSONDeltas, patchSample } from "../../../client";
import { transformSampleData } from "../../../client/transformer";
import { parseTimestamp } from "../../../client/util";
import { buildJsonPath, buildLabelDeltas, OpType } from "./deltas";
import { Field } from "@fiftyone/utilities";

/**
 * Hook that handles overlay persistence events.
 */
export const useOverlayPersistence = (scene: Scene2D | null) => {
  const datasetId = useRecoilValue(fosDatasetId);
  const currentSample = useRecoilValue(modalSample)?.sample;
  const setSnackbarMessage = useSetRecoilState(snackbarMessage);
  const setSnackbarErrors = useSetRecoilState(snackbarErrors);
  const refreshSample = useRefreshSample();

  // The annotation endpoint requires a version token in order to execute
  // mutations.
  // Updated version tokens are returned in the response body,
  // but the server also allows the current sample timestamp to be used as
  // a version token.
  const versionToken = useMemo(() => {
    const isoTimestamp = parseTimestamp(
      (currentSample?.last_modified_at as unknown) as string
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

          setSnackbarMessage("Changes have been saved");
        } catch (error) {
          console.error("error patching sample", error);
          setSnackbarErrors([error.message ?? error]);
          return false;
        }
      }

      return true;
    },
    [
      currentSample,
      datasetId,
      refreshSample,
      setSnackbarErrors,
      setSnackbarMessage,
      versionToken,
    ]
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
    async (
      event: CustomEvent<
        OverlayEventDetail<typeof LIGHTER_EVENTS.DO_PERSIST_OVERLAY>
      >
    ) => {
      const success = await handlePersistenceEvent(
        event.detail.label,
        event.detail.schema,
        "mutate"
      );

      if (success) {
        event.detail.onSuccess?.();
      } else {
        event.detail.onError?.();
      }
    },
    [handlePersistenceEvent]
  );

  const handleRemoveOverlay = useCallback(
    async (
      event: CustomEvent<
        OverlayEventDetail<typeof LIGHTER_EVENTS.DO_REMOVE_OVERLAY>
      >
    ) => {
      const success = await handlePersistenceEvent(
        event.detail.label,
        event.detail.schema,
        "delete"
      );

      if (success) {
        event.detail.onSuccess?.();
      } else {
        event.detail.onError?.();
      }
    },
    [handlePersistenceEvent]
  );

  useEffect(() => {
    if (!scene) {
      return;
    }

    scene.on(LIGHTER_EVENTS.DO_PERSIST_OVERLAY, handlePersistOverlay);
    scene.on(LIGHTER_EVENTS.DO_REMOVE_OVERLAY, handleRemoveOverlay);

    return () => {
      scene.off(LIGHTER_EVENTS.DO_PERSIST_OVERLAY, handlePersistOverlay);
      scene.off(LIGHTER_EVENTS.DO_REMOVE_OVERLAY, handleRemoveOverlay);
    };
  }, [handlePersistOverlay, handleRemoveOverlay, scene]);
};
