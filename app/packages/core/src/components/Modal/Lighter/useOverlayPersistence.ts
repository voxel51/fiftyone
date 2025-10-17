/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { OverlayEventDetail, Scene2D } from "@fiftyone/lighter";
import { LIGHTER_EVENTS } from "@fiftyone/lighter";
import * as fos from "@fiftyone/state";
import { AnnotationLabel } from "@fiftyone/state";
import { useCallback, useEffect, useMemo } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { JSONDeltas, patchSample } from "../../../client";
import { parseTimestamp } from "../../../client/util";
import { OpType, buildJsonPath, buildLabelDeltas } from "./deltas";

/**
 * Hook that handles overlay persistence events.
 */
export const useOverlayPersistence = (scene: Scene2D | null) => {
  const datasetId = useRecoilValue(fos.datasetId);
  const currentSample = useRecoilValue(fos.modalSample)?.sample;
  const setSnackbarMessage = useSetRecoilState(fos.snackbarMessage);
  const setSnackbarErrors = useSetRecoilState(fos.snackbarErrors);

  const versionToken = useMemo(() => {
    const isoTimestamp = parseTimestamp(
      currentSample?.last_modified_at
    )?.toISOString();

    if (isoTimestamp?.endsWith("Z")) {
      return isoTimestamp.substring(0, isoTimestamp.length - 1);
    } else {
      return isoTimestamp;
    }
  }, [currentSample.last_modified_at]);

  const handlePatchSample = useCallback(
    async (sampleDeltas: JSONDeltas) => {
      if (sampleDeltas.length > 0) {
        try {
          await patchSample({
            datasetId,
            sampleId: currentSample._id,
            deltas: sampleDeltas,
            versionToken,
          });

          setSnackbarMessage("Changes have been saved");
        } catch (error) {
          console.error("error patching sample", error);
          setSnackbarErrors([error.message]);
        }

        // todo update sample data
        // todo update lighter
      }
    },
    [
      currentSample,
      datasetId,
      setSnackbarErrors,
      setSnackbarMessage,
      versionToken,
    ]
  );

  const handlePersistenceEvent = useCallback(
    async (annotationLabel: AnnotationLabel, opType: OpType) => {
      if (!currentSample) {
        console.error("missing sample data!");
        return;
      }

      if (!annotationLabel) {
        console.error("missing annotation label!");
        return;
      }

      const sampleDeltas = buildLabelDeltas(
        currentSample,
        annotationLabel,
        opType
      ).map((delta) => ({
        ...delta,
        // convert label delta to sample delta
        path: buildJsonPath(annotationLabel.path, delta.path),
      }));

      await handlePatchSample(sampleDeltas);
    },
    [currentSample, handlePatchSample]
  );

  const handlePersistOverlay = useCallback(
    async (
      event: CustomEvent<
        OverlayEventDetail<typeof LIGHTER_EVENTS.DO_PERSIST_OVERLAY>
      >
    ) => {
      await handlePersistenceEvent(event.detail, "mutate");
    },
    [handlePersistenceEvent]
  );

  const handleRemoveOverlay = useCallback(
    async (
      event: CustomEvent<
        OverlayEventDetail<typeof LIGHTER_EVENTS.DO_REMOVE_OVERLAY>
      >
    ) => {
      await handlePersistenceEvent(event.detail, "delete");
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
