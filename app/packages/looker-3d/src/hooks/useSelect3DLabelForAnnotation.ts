import { useAnnotationEventBus } from "@fiftyone/annotation";
import { labelSchemaData } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/state";
import { getDefaultStore } from "jotai";
import { useCallback } from "react";
import { useRecoilState, useSetRecoilState } from "recoil";
import { useSetEditingToExisting3dLabel } from "../annotation/useSetEditingToExisting3dLabel";
import { ANNOTATION_CUBOID, ANNOTATION_POLYLINE } from "../constants";
import type { OverlayLabel } from "../labels/loader";
import {
  current3dAnnotationModeAtom,
  currentArchetypeSelectedForTransformAtom,
  selectedLabelForAnnotationAtom,
  transformModeAtom,
} from "../state";
import {
  Archetype3d,
  isDetection3dOverlay,
  isPolyline3dOverlay,
} from "../types";

/**
 * Hook that provides the logic for selecting a 3D label for annotation.
 */
export const useSelect3DLabelForAnnotation = () => {
  const [transformMode, setTransformMode] = useRecoilState(transformModeAtom);
  const setSelectedLabelForAnnotation = useSetRecoilState(
    selectedLabelForAnnotationAtom
  );
  const setCurrent3dAnnotationMode = useSetRecoilState(
    current3dAnnotationModeAtom
  );
  const setCurrentArchetypeSelectedForTransform = useSetRecoilState(
    currentArchetypeSelectedForTransformAtom
  );

  const setEditingToExistingPolyline =
    useSetEditingToExisting3dLabel(ANNOTATION_POLYLINE);
  const setEditingToExistingCuboid =
    useSetEditingToExisting3dLabel(ANNOTATION_CUBOID);

  const annotationEventBus = useAnnotationEventBus();

  /**
   * Select a label for annotation editing.
   *
   * @param label - The label to select
   * @param archetype - Optional archetype. If not provided, it will be deduced from the label type.
   */
  const select3DLabelForAnnotation = useCallback(
    (label: OverlayLabel, archetype?: Archetype3d) => {
      let resolvedArchetype = archetype;
      if (!resolvedArchetype) {
        if (isDetection3dOverlay(label)) {
          resolvedArchetype = ANNOTATION_CUBOID;
        } else if (isPolyline3dOverlay(label)) {
          resolvedArchetype = ANNOTATION_POLYLINE;
        } else {
          return;
        }
      }

      // Check if field is read-only
      const store = getDefaultStore();
      const fieldSchemaData = store.get(labelSchemaData(label.path));
      const isReadOnly = !!fieldSchemaData?.read_only;

      annotationEventBus.dispatch("annotation:3dLabelSelected", {
        id: label._id ?? (label["id"] as string),
        archetype: resolvedArchetype,
        label,
      });

      if (resolvedArchetype === ANNOTATION_CUBOID) {
        if (!isReadOnly) {
          setSelectedLabelForAnnotation(label);
          setCurrent3dAnnotationMode(ANNOTATION_CUBOID);
          setCurrentArchetypeSelectedForTransform(resolvedArchetype);
        }

        setEditingToExistingCuboid(label);
        return;
      }

      if (resolvedArchetype === ANNOTATION_POLYLINE) {
        if (!isReadOnly) {
          setSelectedLabelForAnnotation(label);
          setCurrent3dAnnotationMode(ANNOTATION_POLYLINE);
          setCurrentArchetypeSelectedForTransform(resolvedArchetype);

          // We only support translate for polylines for now
          if (transformMode === "rotate" || transformMode === "scale") {
            setTransformMode("translate");
          }
        }

        setEditingToExistingPolyline(label);
      }
    },
    [
      transformMode,
      setTransformMode,
      setSelectedLabelForAnnotation,
      setCurrent3dAnnotationMode,
      setCurrentArchetypeSelectedForTransform,
      setEditingToExistingPolyline,
      setEditingToExistingCuboid,
      annotationEventBus,
    ]
  );

  return select3DLabelForAnnotation;
};
