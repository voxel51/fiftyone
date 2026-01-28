import type {
  BoundingBoxOptions,
  BoundingBoxOverlay,
  ClassificationOptions,
  ClassificationOverlay,
} from "@fiftyone/lighter";
import { InteractiveDetectionHandler, useLighter } from "@fiftyone/lighter";
import type { AnnotationLabel } from "@fiftyone/state";
import { objectId } from "@fiftyone/utilities";
import { atom, getDefaultStore, useSetAtom } from "jotai";
import { useCallback } from "react";
import type { LabelType } from "./state";
import { CLASSIFICATION, DETECTION, POLYLINE } from "@fiftyone/utilities";
import {
  quickDrawActiveAtom,
  defaultField,
  editing,
  savedLabel,
} from "./state";
import { addLabel } from "../useLabels";
import { useAutoAssignment } from "./useAutoAssignment";

const useCreateAnnotationLabel = () => {
  const { scene, addOverlay, overlayFactory } = useLighter();
  const { getAutoAssignedField, getAutoAssignedLabel } = useAutoAssignment();

  return useCallback(
    (type: LabelType) => {
      const id = objectId();
      const store = getDefaultStore();

      // Check if we're in quick draw mode
      const isQuickDrawMode = store.get(quickDrawActiveAtom);

      // Get field - use auto-assignment in quick draw mode
      const field = isQuickDrawMode
        ? getAutoAssignedField(type)
        : store.get(defaultField(type));

      if (!field) {
        return;
      }

      // Get auto-assigned label value if in quick draw mode
      const labelValue = isQuickDrawMode
        ? getAutoAssignedLabel(type, field)
        : undefined;

      const data = {
        _id: id,
        ...(labelValue && { label: labelValue }),
      };

      if (type === CLASSIFICATION) {
        const overlay = overlayFactory.create<
          ClassificationOptions,
          ClassificationOverlay
        >("classification", {
          field,
          id,
          label: data,
        });
        addOverlay(overlay);
        scene?.selectOverlay(id, { ignoreSideEffects: true });
        store.set(savedLabel, data);

        // In quick draw mode, add label to sidebar before interaction
        if (isQuickDrawMode) {
          const labelData = { data, overlay, path: field, type };
          store.set(addLabel, labelData);
        }

        return { data, overlay, path: field, type };
      }

      if (type === DETECTION) {
        const overlay = overlayFactory.create<
          BoundingBoxOptions,
          BoundingBoxOverlay
        >("bounding-box", {
          field,
          id,
          label: data,
        });
        addOverlay(overlay);

        // In quick draw mode, add label to sidebar BEFORE entering interactive mode
        if (isQuickDrawMode) {
          const labelData = { data, overlay, path: field, type };
          store.set(addLabel, labelData);
        }

        const handler = new InteractiveDetectionHandler(overlay);
        scene?.enterInteractiveMode(handler);
        store.set(savedLabel, data);
        return { data, overlay, path: field, type };
      }

      if (type === POLYLINE) {
        throw new Error("todo");
      }
    },
    [addOverlay, overlayFactory, scene, getAutoAssignedField, getAutoAssignedLabel]
  );
};

export default function useCreate(type: LabelType) {
  const setEditing = useSetAtom(editing);
  const createAnnotationLabel = useCreateAnnotationLabel();

  return useCallback(() => {
    const label = createAnnotationLabel(type);

    setEditing(
      label
        ? atom<AnnotationLabel>({
            isNew: true,
            ...label,
          })
        : type
    );
  }, [createAnnotationLabel, setEditing, type]);
}
