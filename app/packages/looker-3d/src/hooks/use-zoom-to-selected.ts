import * as fos from "@fiftyone/state";
import { CameraControls } from "@react-three/drei";
import { useRecoilCallback } from "recoil";
import * as THREE from "three";
import { Vector3, Vector3Tuple } from "three";
import { selectedLabelForAnnotationAtom } from "../state";
import {
  calculateCameraPositionForUpVector,
  getAxisAlignedBoundingBoxForPoints3d,
} from "../utils";

interface UseZoomToSelectedProps {
  sample: fos.ModalSample;
  upVector: Vector3 | null;
  mode: string;
  cameraControlsRef: React.RefObject<CameraControls>;
}

/**
 * Hook that provides a handler function to zoom the camera to selected labels.
 * In annotation mode, it zooms to the selected label for annotation.
 * Otherwise, it zooms to all selected labels.
 */
export const useZoomToSelected = ({
  sample,
  upVector,
  mode,
  cameraControlsRef,
}: UseZoomToSelectedProps) => {
  const handleZoomToSelected = useRecoilCallback(
    ({ snapshot }) =>
      async () => {
        if (!upVector || !cameraControlsRef.current) {
          return;
        }

        let currentSelectedLabels;
        // If we're in annotation mode, zoom to selected labels for annotation instead
        if (mode === "annotate") {
          currentSelectedLabels = [
            await snapshot.getPromise(selectedLabelForAnnotationAtom),
          ].filter(Boolean);
        } else {
          currentSelectedLabels = await snapshot.getPromise(fos.selectedLabels);
        }

        if (currentSelectedLabels.length === 0) {
          return;
        }

        const labelBoundingBoxes: THREE.Box3[] = [];

        for (const selectedLabel of currentSelectedLabels) {
          const field = selectedLabel.field;
          const labelId = selectedLabel.labelId;

          const labelFieldData = sample.sample[field] ?? selectedLabel;

          let thisLabel = null;

          if (Array.isArray(labelFieldData)) {
            // if the field data is an array of labels
            thisLabel = labelFieldData.find(
              (l) => l._id === labelId || l.id === labelId
            );
          } else if (
            labelFieldData &&
            labelFieldData.detections &&
            Array.isArray(labelFieldData.detections)
          ) {
            // if the field data contains detections
            thisLabel = labelFieldData.detections.find(
              (l) => l._id === labelId || l.id === labelId
            );
          } else if (
            (labelFieldData &&
              labelFieldData.points3d &&
              Array.isArray(labelFieldData.points3d) &&
              labelFieldData.points3d.length > 0) ||
            (labelFieldData.polylines &&
              Array.isArray(labelFieldData.polylines) &&
              labelFieldData.polylines.length > 0)
          ) {
            let flattenedPoints: Vector3Tuple[] = [];
            if (labelFieldData.points3d) {
              flattenedPoints = labelFieldData.points3d.flat();
            } else if (labelFieldData.polylines) {
              flattenedPoints = labelFieldData.polylines
                .map((polyline) => polyline.points3d.flat())
                .flat();
            }
            const bbox = getAxisAlignedBoundingBoxForPoints3d(flattenedPoints);

            thisLabel = {
              dimensions: bbox.dimensions,
              location: bbox.location,
            };
          } else {
            // single label
            thisLabel = labelFieldData;
          }

          if (!thisLabel) {
            continue;
          }

          const thisLabelDimension = thisLabel.dimensions as [
            number,
            number,
            number
          ];
          const thisLabelLocation = thisLabel.location as [
            number,
            number,
            number
          ];

          const thisLabelBoundingBox = new THREE.Box3();
          thisLabelBoundingBox.setFromCenterAndSize(
            new THREE.Vector3(...thisLabelLocation),
            new THREE.Vector3(...thisLabelDimension)
          );

          labelBoundingBoxes.push(thisLabelBoundingBox);
        }

        const unionBoundingBox: THREE.Box3 = labelBoundingBoxes[0].clone();

        for (let i = 1; i < labelBoundingBoxes.length; i++) {
          unionBoundingBox.union(labelBoundingBoxes[i]);
        }

        // center = (min + max) / 2
        let unionBoundingBoxCenter = new Vector3();
        unionBoundingBoxCenter = unionBoundingBoxCenter
          .addVectors(unionBoundingBox.min, unionBoundingBox.max)
          .multiplyScalar(0.5);

        // size = max - min
        let unionBoundingBoxSize = new Vector3();
        unionBoundingBoxSize = unionBoundingBoxSize.subVectors(
          unionBoundingBox.max,
          unionBoundingBox.min
        );

        const newCameraPosition = calculateCameraPositionForUpVector(
          unionBoundingBoxCenter,
          unionBoundingBoxSize,
          upVector,
          2,
          "top"
        );

        await cameraControlsRef.current.setLookAt(
          newCameraPosition.x,
          newCameraPosition.y,
          newCameraPosition.z,
          unionBoundingBoxCenter.x,
          unionBoundingBoxCenter.y,
          unionBoundingBoxCenter.z,
          true
        );
      },
    [sample, upVector, mode, cameraControlsRef]
  );

  return handleZoomToSelected;
};
