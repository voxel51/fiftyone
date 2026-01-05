import { PolylineLabel } from "@fiftyone/looker/src/overlays/polyline";
import type { AnnotationLabel } from "@fiftyone/state";
import { POLYLINE } from "@fiftyone/utilities";
import { useCallback } from "react";
import type { LabelType } from "./Edit/state";

/**
 * This hook returns a function which is called a polyline is registered in the sidebar.
 */
export const useAddAnnotationLabel3dPolyline = () => {
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
        },
        type,
        path: field,
      };
    },
    []
  );
};
