import type {
  BoundingBoxOptions,
  BoundingBoxOverlay,
  ClassificationOptions,
  ClassificationOverlay,
} from "@fiftyone/lighter";
import { InteractiveDetectionHandler, useLighter } from "@fiftyone/lighter";
import type { AnnotationLabel } from "@fiftyone/state";
import {
  CLASSIFICATION,
  DETECTION,
  objectId,
  POLYLINE,
} from "@fiftyone/utilities";
import { atom, getDefaultStore, useSetAtom } from "jotai";
import { useCallback } from "react";
import type { LabelType } from "./state";
import { defaultField, editing, savedLabel } from "./state";
import { labelSchemaData } from "../state";
import { useQuickDraw } from "./useQuickDraw";
import { ClassificationLabel, DetectionLabel } from "@fiftyone/looker";

const useCreateAnnotationLabel = () => {
  const { scene, addOverlay, overlayFactory } = useLighter();
  const {
    quickDrawActive,
    getQuickDrawDetectionField,
    getQuickDrawDetectionLabel,
  } = useQuickDraw();

  return useCallback(
    (
      type: LabelType,
      shouldUseQuickDraw = false
    ): AnnotationLabel | undefined => {
      const id = objectId();
      const store = getDefaultStore();
      const isQuickDraw = shouldUseQuickDraw || quickDrawActive;

      // Get field - use auto-assignment for quick draw detections
      const field = isQuickDraw
        ? getQuickDrawDetectionField()
        : store.get(defaultField(type));

      if (!field) {
        return undefined;
      }

      // Get auto-assigned label value if in quick draw detection mode
      const labelValue = isQuickDraw
        ? getQuickDrawDetectionLabel(field)
        : undefined;

      const data = {
        _id: id,
        ...(labelValue && { label: labelValue }),
      };

      if (type === CLASSIFICATION) {
        data["_cls"] = "Classification";

        const overlay = overlayFactory.create<
          ClassificationOptions,
          ClassificationOverlay
        >("classification", {
          field,
          id,
          label: data as ClassificationLabel,
        });
        addOverlay(overlay);
        scene?.selectOverlay(id, { ignoreSideEffects: true });
        store.set(savedLabel, data);

        return { data, overlay, path: field, type };
      }

      if (type === DETECTION) {
        data["_cls"] = "Detection";

        const fieldSchema = store.get(labelSchemaData(field));
        const isReadOnly = !!fieldSchema?.read_only;

        const overlay = overlayFactory.create<
          BoundingBoxOptions,
          BoundingBoxOverlay
        >("bounding-box", {
          field,
          id,
          label: data as DetectionLabel,
          draggable: !isReadOnly,
          resizeable: !isReadOnly,
        });
        addOverlay(overlay);

        const handler = new InteractiveDetectionHandler(overlay);
        scene?.enterInteractiveMode(handler);
        store.set(savedLabel, data);
        return { data, overlay, path: field, type };
      }

      if (type === POLYLINE) {
        throw new Error("todo");
      }

      return undefined;
    },
    [
      addOverlay,
      overlayFactory,
      scene,
      quickDrawActive,
      getQuickDrawDetectionField,
      getQuickDrawDetectionLabel,
    ]
  );
};

/**
 * Hook that returns a function to create a new annotation label.
 * @param type - The type of label to create (CLASSIFICATION, DETECTION, or POLYLINE)
 * @returns A function that creates the annotation label. The function accepts an optional
 *   `shouldUseQuickDraw` parameter to force quick draw behavior, working around stale
 *   closure issues when `enableQuickDraw()` is called immediately before this function.
 */
export default function useCreate(type: LabelType) {
  const setEditing = useSetAtom(editing);
  const createAnnotationLabel = useCreateAnnotationLabel();

  return useCallback(
    /**
     * Create a new annotation label!
     * @param shouldUseQuickDraw - Force quick draw mode. Pass `true` to ensure quick draw
     *   behavior even if the `quickDrawActive` closure is stale. This handles React's async
     *   state updates when `enableQuickDraw()` is called immediately before `create()`.
     */
    (shouldUseQuickDraw = false) => {
      const label = createAnnotationLabel(type, shouldUseQuickDraw);

      if (label) {
        setEditing(
          atom<AnnotationLabel>({
            isNew: true,
            ...label,
          })
        );
      } else {
        setEditing(type);
      }
    },
    [createAnnotationLabel, setEditing, type]
  );
}
