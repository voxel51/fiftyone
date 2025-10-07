import {
  ClassificationOptions,
  ClassificationOverlay,
  InteractiveDetectionHandler,
  LIGHTER_EVENTS,
  useLighter,
} from "@fiftyone/lighter";
import type { AnnotationLabel } from "@fiftyone/state";
import { CLASSIFICATION, POLYLINE, objectId } from "@fiftyone/utilities";
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
        return { data, overlay };
      }

      throw new Error("E");
    },
    [addOverlay, overlayFactory]
  );
};

const useCreateLighterOverlay = () => {
  return useCallback(
    (id: string, type: LabelType) => {
      if (type === CLASSIFICATION) {
        return overlay;
      }

      if (type === POLYLINE) {
        return;
      }

      const handler = new InteractiveDetectionHandler(
        currentSampleId,
        addOverlay,
        removeOverlay,
        overlayFactory,
        (tempOverlay) => {
          const absoluteBounds = tempOverlay.getAbsoluteBounds();
          return;
          store.set(interactiveModeInput, {
            inputType: "new-bounding-box",
            payload: {
              x: absoluteBounds.x + absoluteBounds.width,
              y: absoluteBounds.y + absoluteBounds.height / 2,
            },
            onComplete: (value: { labelName: string; field: string }) => {
              const relativeBounds = tempOverlay.getRelativeBounds();

              const detection = overlayFactory.create<
                BoundingBoxOptions,
                BoundingBoxOverlay
              >("bounding-box", {
                field: value.field,
                sampleId: currentSampleId,
                label: {
                  id: objectId(),
                  label: value.labelName,
                  tags: [],
                  bounding_box: [
                    relativeBounds.x,
                    relativeBounds.y,
                    relativeBounds.width,
                    relativeBounds.height,
                  ],
                },
                relativeBounds: relativeBounds,
                draggable: true,
                selectable: true,
              });

              addOverlay(detection, true);

              // Persist the overlay
              scene.dispatchSafely({
                type: LIGHTER_EVENTS.DO_PERSIST_OVERLAY,
                detail: {
                  id: detection.id,
                  field: value.field,
                  sampleId: currentSampleId,
                  label: detection.label?.label ?? "",
                  bounds: detection.getRelativeBounds(),
                  misc: {},
                },
              });

              scene.exitInteractiveMode();
            },
            onDismiss: () => {},
          });
        }
      );

      scene?.enterInteractiveMode(handler);
    },
    [scene, addOverlay, removeOverlay, overlayFactory]
  );
};

export default function useCreate(type: LabelType) {
  const setEditing = useSetAtom(editing);
  const createAnnotationLabel = useCreateAnnotationLabel();

  return useCallback(() => {
    setEditing(atom<AnnotationLabel>({ type, ...createAnnotationLabel(type) }));
  }, [createAnnotationLabel, setEditing, type]);
}
