import {
  BoundingBoxOptions,
  BoundingBoxOverlay,
  ClassificationOptions,
  ClassificationOverlay,
  useLighter,
} from "@fiftyone/lighter";
import { InteractiveDetectionHandler } from "@fiftyone/lighter/src/interaction/InteractiveDetectionHandler";
import type { AnnotationLabel } from "@fiftyone/state";
import {
  CLASSIFICATION,
  DETECTION,
  POLYLINE,
  objectId,
} from "@fiftyone/utilities";
import { atom, getDefaultStore, useSetAtom } from "jotai";
import { useCallback } from "react";
import type { LabelType } from "./state";
import { defaultField, editing } from "./state";

const useCreateAnnotationLabel = () => {
  const { scene, addOverlay, removeOverlay, overlayFactory } = useLighter();
  return useCallback(
    (type: LabelType) => {
      const id = objectId();
      const data = { _id: id };
      const store = getDefaultStore();
      const field = store.get(defaultField(type));
      if (!field) {
        return;
      }

      if (type === CLASSIFICATION) {
        const overlay = overlayFactory.create<
          ClassificationOptions,
          ClassificationOverlay
        >("classification", {
          field,
          id,
        });
        addOverlay(overlay);
        return { data, overlay, path: field, type };
      }

      if (type === DETECTION) {
        const overlay = overlayFactory.create<
          BoundingBoxOptions,
          BoundingBoxOverlay
        >("bounding-box", {
          field,
          id,
          label: {},
        });
        addOverlay(overlay);
        const handler = new InteractiveDetectionHandler(overlay);
        scene?.enterInteractiveMode(handler);
        return { data, overlay, path: field, type };
      }

      if (type === POLYLINE) {
        throw new Error("todo");
      }
    },
    [addOverlay, overlayFactory, scene]
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
