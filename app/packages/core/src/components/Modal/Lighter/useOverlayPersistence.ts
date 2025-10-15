/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { OverlayEventDetail, Scene2D } from "@fiftyone/lighter";
import { LIGHTER_EVENTS } from "@fiftyone/lighter";
import { useCallback, useEffect, useState } from "react";
import { JSONDeltas, patchSample } from "../../../client";
import { useRecoilValue, useSetRecoilState } from "recoil";
import * as fos from "@fiftyone/state";
import { AnnotationLabel } from "@fiftyone/state";
import { useVersionToken } from "../../../client/useVersionToken";
import { parseTimestamp } from "../../../client/util";
import { buildJsonPath, buildLabelDeltas, OpType } from "./deltas";

/**
 * Hook that handles overlay persistence events.
 */
export const useOverlayPersistence = (scene: Scene2D | null) => {
  const datasetId = useRecoilValue(fos.datasetId);
  const currentSample = useRecoilValue(fos.modalSample)?.sample;
  const setSnackbarMessage = useSetRecoilState(fos.snackbarMessage);
  const setSnackbarErrors = useSetRecoilState(fos.snackbarErrors);

  // todo replace with atom
  const [versionToken, setVersionToken] = useState<string | null>(null);

  useVersionToken({
    source: (parseTimestamp(currentSample.last_modified_at) ?? new Date())
      .toISOString()
      .toLowerCase(),
  }).then((token) => setVersionToken(token));

  const handlePatchSample = useCallback(
    async (sampleDeltas: JSONDeltas) => {
      if (sampleDeltas.length > 0) {
        try {
          const patchResponse = await patchSample({
            datasetId,
            sampleId: currentSample._id,
            deltas: sampleDeltas,
            versionToken,
          });

          setVersionToken(patchResponse.versionToken);
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
