import type { LabelRef } from "@fiftyone/annotation";
import type { LabelData } from "@fiftyone/utilities";
import type { SurfaceActions } from "./frameReader";

/** Sample-level TemporalDetection ops (no frame on the ref). */
export const makeTemporalDetectionOps = (actions: SurfaceActions) => {
  const createTemporalDetection = (
    fieldPath: string,
    support: [number, number],
    label?: string,
  ): string => {
    const ref: LabelRef = actions.createLabel(fieldPath, {
      _cls: "TemporalDetection",
      support,
      // mirror the server-materialized default so a tag edit has a real
      // array and the next refetch diff doesn't see an absent key
      tags: [],
      ...(label !== undefined ? { label } : {}),
    });

    // select the fresh TD so it becomes the editing target
    actions.setActive([ref]);

    return ref.instanceId;
  };

  const editTemporalDetection = (
    fieldPath: string,
    detectionId: string,
    update: Partial<LabelData>,
  ): void => {
    actions.updateLabel({ path: fieldPath, instanceId: detectionId }, update);
  };

  const deleteTemporalDetection = (
    fieldPath: string,
    detectionId: string,
  ): void => {
    actions.deleteLabel({ path: fieldPath, instanceId: detectionId });
  };

  return {
    createTemporalDetection,
    editTemporalDetection,
    deleteTemporalDetection,
  };
};

export type TemporalDetectionOps = ReturnType<typeof makeTemporalDetectionOps>;
