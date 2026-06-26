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

const getBoxCenterAndSize = (box: Box3) => {
  const center = new Vector3();
  const size = new Vector3();
  box.getCenter(center);
  box.getSize(size);

  return { center, size };
};

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

        const { center, size } = getBoxCenterAndSize(boundingBox);

        const cameraPosition = calculateCameraPositionForUpVector(
          center,
          size,
          upVector,
          2,
          "top",
        );

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
  );

  return handleZoomToSelected;
};
