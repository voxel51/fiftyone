import { useAnnotationEventHandler } from "@fiftyone/annotation";
import { coerceStringBooleans } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate";
import { currentData } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/state";
import { PolylineLabel } from "@fiftyone/looker/src/overlays/polyline";
import { useSetAtom } from "jotai";
import { useCallback } from "react";
import { useSetRecoilState } from "recoil";
import { PolylinePointTransformData } from "../annotation/types";
import { points3dToPolylineSegments } from "../annotation/utils/polyline-utils";
import {
  selectedLabelForAnnotationAtom,
  stagedPolylineTransformsAtom,
} from "../state";

/**
 * Hook that initializes 3D annotation.
 */
export const use3dAnnotation = () => {
  const setStagedPolylineTransforms = useSetRecoilState(
    stagedPolylineTransformsAtom
  );
  const setSelectedLabelForAnnotation = useSetRecoilState(
    selectedLabelForAnnotationAtom
  );

  const save = useSetAtom(currentData);

  useAnnotationEventHandler(
    "annotation:notification:sidebarLabelSelected",
    useCallback((payload) => {
      if (payload.type !== "Polyline") {
        // Note: we don't support non-polyline annotations in 3D yet
        return;
      }

      setSelectedLabelForAnnotation({
        _id: payload.id,
        ...payload.data,
      });

      const polylineData = payload.data as PolylineLabel;

      const points3d = (polylineData as PolylineLabel).points3d;

      if (!Array.isArray(points3d)) {
        return;
      }

      // Update staging area with the new polyline
      // overwrite any previously staged polyline
      setStagedPolylineTransforms({
        [payload.id]: {
          segments: points3dToPolylineSegments(points3d),
          label: polylineData.label ?? "",
          misc: {
            ...(polylineData ?? {}),
          },
        },
      });
    }, [])
  );

  useAnnotationEventHandler(
    "annotation:notification:sidebarValueUpdated",
    useCallback(
      (payload) => {
        if (
          payload.value?.["type"] !== "Polyline" ||
          !Array.isArray(payload.value?.["points3d"])
        ) {
          return;
        }

        const coerced = coerceStringBooleans(payload.value as PolylineLabel);
        const { points3d, _id, label, ...rest } = coerced;

        setStagedPolylineTransforms((prev) => {
          if (!prev) {
            return {
              [_id]: {
                segments: points3dToPolylineSegments(points3d),
                label: label ?? "",
                misc: {
                  ...(rest ?? {}),
                },
              },
            };
          }

          return {
            ...prev,
            [_id]: {
              ...(prev[_id] ?? ({} as PolylinePointTransformData)),
              label,
              misc: {
                ...(rest ?? {}),
              },
            },
          };
        });

        save(coerced);
      },
      [save]
    )
  );
};
