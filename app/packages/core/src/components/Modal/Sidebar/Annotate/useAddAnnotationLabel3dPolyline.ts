import { useSyncWithPolylinePointTransforms } from "@fiftyone/looker-3d/src/annotation/useSyncWithPolylinePointTransforms";
import {
  polylinePointTransformsAtom,
  selectedLabelForAnnotationAtom,
} from "@fiftyone/looker-3d/src/state";
import { PolylineLabel } from "@fiftyone/looker/src/overlays/polyline";
import type { AnnotationLabel } from "@fiftyone/state";
import { POLYLINE } from "@fiftyone/utilities";
import { useCallback } from "react";
import { useSetRecoilState } from "recoil";
import type { LabelType } from "./Edit/state";

export const useAddAnnotationLabel3dPolyline = () => {
  const setPolylinePointTransforms = useSetRecoilState(
    polylinePointTransformsAtom
  );
  const setSelectedLabelForAnnotation = useSetRecoilState(
    selectedLabelForAnnotationAtom
  );

  const syncWithPolylinePointTransforms = useSyncWithPolylinePointTransforms();

  return useCallback(
    (
      field: string,
      type: LabelType,
      data: AnnotationLabel["data"]
    ): AnnotationLabel | null => {
      if (type !== POLYLINE) {
        return null;
      }

      return {
        data,
        overlay: {
          id: data._id,
          field,
          label: data as PolylineLabel,
          updateLabel: (label: PolylineLabel) => {
            syncWithPolylinePointTransforms(label as AnnotationLabel["data"]);
          },
          setSelected: (selected: boolean) => {
            if (!selected) {
              setPolylinePointTransforms(null);
              setSelectedLabelForAnnotation(null);
              return;
            }

            setSelectedLabelForAnnotation({
              _id: data._id,
              path: field,
              selected: false,
              _cls: data["_cls"] ?? "Polyline",
            });
          },
        },
        path: field,
        type,
      };
    },
    [syncWithPolylinePointTransforms]
  );
};
