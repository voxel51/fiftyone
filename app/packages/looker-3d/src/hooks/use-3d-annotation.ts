import { useAnnotationEventHandler } from "@fiftyone/annotation";
import { coerceStringBooleans } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate";
import { currentData } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/state";
import { DetectionLabel } from "@fiftyone/looker/src/overlays/detection";
import { PolylineLabel } from "@fiftyone/looker/src/overlays/polyline";
import { useSetAtom } from "jotai";
import { useCallback } from "react";
import { useSetRecoilState } from "recoil";
import type { Vector3Tuple } from "three";
import { PolylinePointTransformData } from "../annotation/types";
import { points3dToPolylineSegments } from "../annotation/utils/polyline-utils";
import {
  hoveredLabelAtom,
  selectedLabelForAnnotationAtom,
  stagedCuboidTransformsAtom,
  stagedPolylineTransformsAtom,
} from "../state";

/**
 * Hook that initializes 3D annotation.
 */
export const use3dAnnotation = () => {
  const setStagedPolylineTransforms = useSetRecoilState(
    stagedPolylineTransformsAtom
  );
  const setStagedCuboidTransforms = useSetRecoilState(
    stagedCuboidTransformsAtom
  );
  const setSelectedLabelForAnnotation = useSetRecoilState(
    selectedLabelForAnnotationAtom
  );
  const setHoveredLabel = useSetRecoilState(hoveredLabelAtom);

  const save = useSetAtom(currentData);

  useAnnotationEventHandler(
    "annotation:sidebarLabelSelected",
    useCallback((payload) => {
      setSelectedLabelForAnnotation({
        _id: payload.id,
        ...payload.data,
      });

      if (payload.type === "Polyline") {
        const polylineData = payload.data as PolylineLabel;
        const points3d = polylineData.points3d;

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
      } else if (payload.type === "Detection") {
        const detectionData = payload.data as DetectionLabel;
        const { location, dimensions, rotation } = detectionData;

        if (!Array.isArray(location) || !Array.isArray(dimensions)) {
          return;
        }

        // Update staging area with the new cuboid
        // overwrite any previously staged cuboid
        setStagedCuboidTransforms({
          [payload.id]: {
            location: location as Vector3Tuple,
            dimensions: dimensions as Vector3Tuple,
            rotation: rotation as Vector3Tuple,
          },
        });
      }
    }, [])
  );

  useAnnotationEventHandler(
    "annotation:sidebarValueUpdated",
    useCallback(
      (payload) => {
        const hasPoints3d = Array.isArray(payload.value["points3d"]);
        const hasLocationAndDimensions =
          Array.isArray(payload.value["location"]) &&
          Array.isArray(payload.value["dimensions"]);

        if (hasPoints3d) {
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
        } else if (hasLocationAndDimensions) {
          const detectionValue = payload.value as DetectionLabel;
          const { _id, location, dimensions, rotation } = detectionValue;

          setStagedCuboidTransforms((prev) => {
            const transformData = {
              location: location as Vector3Tuple,
              dimensions: dimensions as Vector3Tuple,
              rotation: rotation as Vector3Tuple,
            };

            if (!prev) {
              return {
                [_id]: transformData,
              };
            }

            return {
              ...prev,
              [_id]: {
                ...transformData,
                ...(prev[_id] ?? {}),
              },
            };
          });

          save(detectionValue);
        }
      },
      [save]
    )
  );

  useAnnotationEventHandler(
    "annotation:sidebarLabelHover",
    useCallback((payload) => {
      setHoveredLabel({
        id: payload.id,
      });
    }, [])
  );

  useAnnotationEventHandler(
    "annotation:sidebarLabelUnhover",
    useCallback(() => {
      setHoveredLabel(null);
    }, [])
  );
};
