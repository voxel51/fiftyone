import { coerceStringBooleans } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate";
import { editing as editingAtom } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit";
import { savedLabel } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/state";
import * as fos from "@fiftyone/state";
import { getDefaultStore, useSetAtom } from "jotai";
import { useResetAtom } from "jotai/utils";
import { useCallback, useEffect } from "react";
import { useSetRecoilState } from "recoil";
import {
  clearTransformStateSelector,
  polylinePointTransformsAtom,
} from "../state";
import { PolylinePointTransformData } from "./types";
import { currentEditingPolylineAtom } from "./useSetEditingToNewPolyline";
import { useSyncWithPolylinePointTransforms } from "./useSyncWithPolylinePointTransforms";

/**
 * Hook to set editing atom for existing polylines when clicked
 */
export const useSetEditingToExistingPolyline = () => {
  const setEditing = useSetAtom(editingAtom);
  const resetEditing = useResetAtom(editingAtom);
  const resetCurrentEditing = useResetAtom(currentEditingPolylineAtom);
  const setCurrentEditing = useSetAtom(currentEditingPolylineAtom);
  const setPolylinePointTransforms = useSetRecoilState(
    polylinePointTransformsAtom
  );
  const syncWithPolylinePointTransforms = useSyncWithPolylinePointTransforms();

  useEffect(() => {
    return () => {
      resetCurrentEditing();
      resetEditing();
    };
  }, [resetCurrentEditing, resetEditing]);

  const clearTransformState = useSetRecoilState(clearTransformStateSelector);

  const jotaiStore = getDefaultStore();

  const syncWithSidebar = useCallback(
    (label: fos.PolylineAnnotationLabel["data"]) => {
      const { points3d: _points3d, _id, label: _label, ...rest } = label;

      setPolylinePointTransforms((prev) => {
        return {
          ...prev,
          [label._id]: {
            ...(prev[label._id] ?? ({} as PolylinePointTransformData)),
            label: _label,
            misc: {
              ...coerceStringBooleans(rest ?? {}),
            },
          },
        };
      });

      // const currentVal = jotaiStore.get(current);
      // const sanitizedLabel = coerceStringBooleans(
      //   label as unknown as Record<string, unknown>
      // );
      // jotaiStore.set(current, {
      //   ...currentVal,
      //   data: sanitizedLabel,
      //   overlay: {
      //     ...currentVal?.overlay,
      //     label: sanitizedLabel,
      //   },
      // });
    },
    []
  );

  return useCallback(
    (label: fos.PolylineAnnotationLabel["data"] & { path: string }) => {
      syncWithPolylinePointTransforms(label);

      setCurrentEditing({
        isNew: false,
        data: label,
        path: label.path,
        type: "Polyline" as const,
        overlay: {
          id: label._id,
          field: label.path,
          label: label,
          updateLabel: syncWithSidebar,
          getLabel: () => {
            return { ...label };
          },
          setSelected: (selected: boolean) => {
            if (!selected) {
              clearTransformState({});
              setPolylinePointTransforms(null);
            }
          },
        },
      });

      setEditing(currentEditingPolylineAtom);

      jotaiStore.set(savedLabel, label);
    },
    [syncWithSidebar, syncWithPolylinePointTransforms]
  );
};
