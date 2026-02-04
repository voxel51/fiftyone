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

const useCreateAnnotationLabel = () => {
  const { scene, addOverlay, overlayFactory } = useLighter();
  return useCallback(
    (type: LabelType): AnnotationLabel | undefined => {
      const id = objectId();
      const data = { _id: id };
      const store = getDefaultStore();
      const field = store.get(defaultField(type));
      if (!field) {
        return undefined;
      }

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
    [addOverlay, overlayFactory, scene]
  );
};

export default function useCreate(type: LabelType) {
  const setEditing = useSetAtom(editing);
  const createAnnotationLabel = useCreateAnnotationLabel();

  return useCallback(() => {
    const label = createAnnotationLabel(type);

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
  }, [createAnnotationLabel, setEditing, type]);
}
