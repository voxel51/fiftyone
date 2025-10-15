/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { OverlayEventDetail, Scene2D } from "@fiftyone/lighter";
import { LIGHTER_EVENTS } from "@fiftyone/lighter";
import { useCallback, useEffect, useState } from "react";
import { patchSample } from "../../../client";
import { useRecoilValue } from "recoil";
import * as fos from "@fiftyone/state";
import { useVersionToken } from "../../../client/useVersionToken";
import { parseTimestamp } from "../../../client/util";
import { buildLabelDeltas } from "./deltas";

/**
 * Hook that handles overlay persistence events.
 */
export const useOverlayPersistence = (scene: Scene2D | null) => {
  const datasetId = useRecoilValue(fos.datasetId);
  const currentSample = useRecoilValue(fos.modalSample)?.sample;

  // todo replace with atom
  const [versionToken, setVersionToken] = useState<string | null>(null);

  useVersionToken({
    source: (parseTimestamp(currentSample.last_modified_at) ?? new Date())
      .toISOString()
      .toLowerCase(),
  }).then((token) => setVersionToken(token));

  const handlePersistOverlay = useCallback(
    async (
      event: CustomEvent<
        OverlayEventDetail<typeof LIGHTER_EVENTS.DO_PERSIST_OVERLAY>
      >
    ) => {
      if (!currentSample) {
        console.error("missing sample data!");
        return;
      }

      const annotationLabel = event.detail;

      if (!annotationLabel) {
        console.error("missing annotation label!");
        return;
      }

      const sampleDeltas = buildLabelDeltas(currentSample, annotationLabel).map(
        (delta) => ({
          ...delta,
          // convert label delta to sample delta
          path: `/${annotationLabel.path}${delta.path}`,
        })
      );

      if (sampleDeltas.length > 0) {
        const patchResponse = await patchSample({
          datasetId,
          sampleId: currentSample._id,
          deltas: sampleDeltas,
          versionToken,
        });

        setVersionToken(patchResponse.versionToken);

        // todo update sample data
      }
    },
    [currentSample, datasetId, versionToken]
  );

  const handleRemoveOverlay = useCallback(
    (
      event: CustomEvent<
        OverlayEventDetail<typeof LIGHTER_EVENTS.DO_REMOVE_OVERLAY>
      >
    ) => {
      // todo
    },
    [currentSample, datasetId, versionToken]
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
