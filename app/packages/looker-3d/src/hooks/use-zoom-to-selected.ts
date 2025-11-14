import * as fos from "@fiftyone/state";
import { CameraControls } from "@react-three/drei";
import { useRecoilCallback } from "recoil";
import { Box3, Vector3, Vector3Tuple } from "three";
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

type LabelWithId = { _id?: string; id?: string };

/**
 * Extracts a label from field data based on labelId
 */
const extractLabel = (
  labelFieldData: any,
  labelId: string
): { dimensions: Vector3Tuple; location: Vector3Tuple } | null => {
  // Array of labels
  if (Array.isArray(labelFieldData)) {
    const label = labelFieldData.find(
      (l: LabelWithId) => l._id === labelId || l.id === labelId
    );
    return label || null;
  }

  // Field with detections array
  if (labelFieldData?.detections && Array.isArray(labelFieldData.detections)) {
    const label = labelFieldData.detections.find(
      (l: LabelWithId) => l._id === labelId || l.id === labelId
    );
    return label || null;
  }

  // Field with points3d or polylines
  if (labelFieldData?.points3d || labelFieldData?.polylines) {
    let flattenedPoints: Vector3Tuple[] = [];
    if (labelFieldData.points3d) {
      flattenedPoints = labelFieldData.points3d.flat();
    } else if (labelFieldData.polylines) {
      flattenedPoints = labelFieldData.polylines
        .map((polyline: any) => polyline.points3d.flat())
        .flat();
    }

    if (flattenedPoints.length === 0) {
      return null;
    }

    const bbox = getAxisAlignedBoundingBoxForPoints3d(flattenedPoints);
    return {
      dimensions: bbox.dimensions,
      location: bbox.location,
    };
  }

  // Single label
  return labelFieldData || null;
};

/**
 * Creates a bounding box from label dimensions and location
 */
const createBoundingBox = (label: {
  dimensions: Vector3Tuple;
  location: Vector3Tuple;
}): Box3 => {
  const box = new Box3();
  box.setFromCenterAndSize(
    new Vector3(...label.location),
    new Vector3(...label.dimensions)
  );
  return box;
};

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

        const selectedLabels =
          mode === "annotate"
            ? [
                await snapshot.getPromise(selectedLabelForAnnotationAtom),
              ].filter(Boolean)
            : await snapshot.getPromise(fos.selectedLabels);

        if (selectedLabels.length === 0) {
          return;
        }

        const boundingBoxes = selectedLabels
          .map((selectedLabel) => {
            const field = selectedLabel.field;
            const labelId = selectedLabel.labelId;
            const labelFieldData = sample.sample[field] ?? selectedLabel;
            const label = extractLabel(labelFieldData, labelId);
            return label ? createBoundingBox(label) : null;
          })
          .filter((box): box is Box3 => box !== null);

        if (boundingBoxes.length === 0) {
          return;
        }

        const unionBox = boundingBoxes.reduce(
          (acc, box) => acc.union(box),
          boundingBoxes[0].clone()
        );

        const center = new Vector3();
        const size = new Vector3();
        unionBox.getCenter(center);
        unionBox.getSize(size);

        const cameraPosition = calculateCameraPositionForUpVector(
          center,
          size,
          upVector,
          2,
          "top"
        );

        await cameraControlsRef.current.setLookAt(
          cameraPosition.x,
          cameraPosition.y,
          cameraPosition.z,
          center.x,
          center.y,
          center.z,
          true
        );
      },
    [sample, upVector, mode, cameraControlsRef]
  );

  return handleZoomToSelected;
};
