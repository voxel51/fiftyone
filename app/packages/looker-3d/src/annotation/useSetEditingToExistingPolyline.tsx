import { coerceStringBooleans } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate";
import { editing as editingAtom } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit";
import {
  current,
  savedLabel,
} from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/state";
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

      const currentVal = jotaiStore.get(current);
      const sanitizedLabel = coerceStringBooleans(
        label as unknown as Record<string, unknown>
      );
      jotaiStore.set(current, {
        ...currentVal,
        data: sanitizedLabel,
      });
    },
    []
  );

  const syncWithPolylinePointTransforms = useCallback(
    (label: fos.PolylineAnnotationLabel["data"]) => {
      setPolylinePointTransforms((prev) => {
        if (!prev) {
          const { points3d: _points3d, _id, ...rest } = label;
          return {
            [label._id]: {
              segments: _points3d.map((segment) => ({
                points: segment.map((point) => [point[0], point[1], point[2]]),
              })),
              misc: {
                ...coerceStringBooleans(rest ?? {}),
              },
            },
          };
        }

        const { points3d: _points3d, _id, ...rest } = label;
        return {
          ...prev,
          [label._id]: {
            ...(prev[label._id] ?? ({} as PolylinePointTransformData)),
            segments: label.points3d.map((segment) => ({
              points: segment.map((point) => [point[0], point[1], point[2]]),
            })),
            label: label.label ?? "",
            misc: {
              ...coerceStringBooleans(rest ?? {}),
            },
          },
        };
      });
    },
    []
  );

  return useCallback(
    (label: fos.PolylineAnnotationLabel["data"] & { path: string }) => {
      syncWithPolylinePointTransforms(label);
      debugger;

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
