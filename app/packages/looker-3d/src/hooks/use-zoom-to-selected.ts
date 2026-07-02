import * as fos from "@fiftyone/state";
import { useRecoilCallback } from "recoil";
import { Vector3, type Box3, type PerspectiveCamera } from "three";
import { renderModelSelector } from "../annotation/store";
import {
  setCameraControlsLookAt,
  type Fo3dCameraControls,
} from "../fo3d/camera-controls";
import { selectedLabelForAnnotationAtom } from "../state";
import { calculateCameraPositionForUpVector } from "../utils";
import {
  getSelectedLabelsBoundingBox,
  getUnionBoundingBox,
  resolveAnnotationLabelBoundingBox,
} from "./zoom-to-selected-bounds";

type SampleMap = Record<string, fos.ModalSample>;

interface UseZoomToSelectedProps {
  interactionSample: fos.ModalSample;
  activeSampleMap: SampleMap;
  upVector: Vector3 | null;
  mode: string;
  cameraControlsRef: React.RefObject<Fo3dCameraControls>;
  useLegacyCoordinates?: boolean;
}

<<<<<<< HEAD
type LabelWithId = { _id?: string; id?: string };

/**
 * Extracts a label from field data based on labelId
 */
const extractLabel = (
  labelFieldData: any,
  labelId: string,
): { dimensions: Vector3Tuple; location: Vector3Tuple } | null => {
  // Array of labels
  if (Array.isArray(labelFieldData)) {
    const label = labelFieldData.find(
      (l: LabelWithId) => l._id === labelId || l.id === labelId,
    );
    return label || null;
  }

  // Field with detections array
  if (labelFieldData?.detections && Array.isArray(labelFieldData.detections)) {
    const label = labelFieldData.detections.find(
      (l: LabelWithId) => l._id === labelId || l.id === labelId,
    );
    return label || null;
  }

  // Field with points3d or polylines
  if (labelFieldData?.points3d || labelFieldData?.polylines) {
    let flattenedPoints: Vector3Tuple[] = [];
    if (labelFieldData.points3d) {
      flattenedPoints = labelFieldData.points3d.flat();
    } else if (labelFieldData.polylines) {
      flattenedPoints = labelFieldData.polylines.flatMap((polyline: any) =>
        polyline.points3d.flat(),
      );
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
    new Vector3(...label.dimensions),
  );
  return box;
};

=======
>>>>>>> main
/**
 * Hook that provides a handler function to zoom the camera to selected labels.
 * In annotation mode, it zooms to the selected label for annotation.
 * Otherwise, it zooms to all selected labels.
 */
export const useZoomToSelected = ({
  interactionSample,
  activeSampleMap,
  upVector,
  mode,
  cameraControlsRef,
  useLegacyCoordinates = false,
}: UseZoomToSelectedProps) => {
  const handleZoomToSelected = useRecoilCallback(
    ({ snapshot }) =>
      async () => {
        if (!upVector || !cameraControlsRef.current) {
          return;
        }

        const boundingBox =
          mode === fos.ModalMode.ANNOTATE
            ? getUnionBoundingBox(
                [
                  resolveAnnotationLabelBoundingBox({
                    selectedLabel: await snapshot.getPromise(
                      selectedLabelForAnnotationAtom,
                    ),
                    renderModel: await snapshot.getPromise(renderModelSelector),
                    useLegacyCoordinates,
                  }),
                ].filter((box): box is Box3 => Boolean(box)),
              )
            : getSelectedLabelsBoundingBox({
                selectedLabels: await snapshot.getPromise(fos.selectedLabels),
                interactionSample,
                activeSampleMap,
                useLegacyCoordinates,
              });

        if (!boundingBox) {
          return;
        }

<<<<<<< HEAD
        const boundingBoxes = selectedLabels
          .map((selectedLabel) => {
            const field = selectedLabel.field;
            const labelId = selectedLabel.labelId;
            const labelFieldData =
              interactionSample.sample[field] ?? selectedLabel;
            const label = extractLabel(labelFieldData, labelId);
            return label ? createBoundingBox(label) : null;
          })
          .filter((box): box is Box3 => box !== null);

        if (boundingBoxes.length === 0) {
          return;
        }

        const unionBox = boundingBoxes.reduce(
          (acc, box) => acc.union(box),
          boundingBoxes[0].clone(),
        );

=======
>>>>>>> main
        const center = new Vector3();
        const size = new Vector3();
        boundingBox.getCenter(center);
        boundingBox.getSize(size);

        const cameraPosition = calculateCameraPositionForUpVector(
          center,
          size,
          upVector,
          2,
          "top",
        );

<<<<<<< HEAD
        await cameraControlsRef.current.setLookAt(
          cameraPosition.x,
          cameraPosition.y,
          cameraPosition.z,
          center.x,
          center.y,
          center.z,
          true,
        );
      },
    [interactionSample, upVector, mode, cameraControlsRef],
=======
        setCameraControlsLookAt({
          camera: cameraControlsRef.current.object as PerspectiveCamera,
          controls: cameraControlsRef.current,
          position: cameraPosition,
          target: center,
        });
      },
    [
      activeSampleMap,
      interactionSample,
      upVector,
      mode,
      cameraControlsRef,
      useLegacyCoordinates,
    ],
>>>>>>> main
  );

  return handleZoomToSelected;
};
