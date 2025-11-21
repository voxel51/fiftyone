import * as fos from "@fiftyone/state";
import { objectId } from "@fiftyone/utilities";
import { useMemo } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import * as THREE from "three";
import { useEmptyCanvasInteraction } from "../hooks/use-empty-canvas-interaction";
import {
  annotationPlaneAtom,
  currentActiveAnnotationField3dAtom,
  isCreatingCuboidAtom,
  selectedLabelForAnnotationAtom,
  stagedCuboidTransformsAtom,
} from "../state";
import { getPlaneFromPositionAndQuaternion } from "../utils";

interface CreateCuboidRendererProps {
  color?: string;
}

export const CreateCuboidRenderer = ({
  color = "#00ff00",
}: CreateCuboidRendererProps) => {
  const currentSampleId = useRecoilValue(fos.currentSampleId);
  const currentActiveField = useRecoilValue(currentActiveAnnotationField3dAtom);
  const [isCreatingCuboid, setIsCreatingCuboid] =
    useRecoilState(isCreatingCuboidAtom);
  const setSelectedLabelForAnnotation = useSetRecoilState(
    selectedLabelForAnnotationAtom
  );
  const setStagedCuboidTransforms = useSetRecoilState(
    stagedCuboidTransformsAtom
  );
  const annotationPlane = useRecoilValue(annotationPlaneAtom);

  const handleCanvasClick = (intersectionPoint: THREE.Vector3) => {
    if (!isCreatingCuboid || !currentActiveField) return;

    // Create a new unit cuboid at the click location
    const labelId = objectId();
    const location: THREE.Vector3Tuple = [
      Number(intersectionPoint.x.toFixed(7)),
      Number(intersectionPoint.y.toFixed(7)),
      Number(intersectionPoint.z.toFixed(7)),
    ];

    // Unit dimensions (1x1x1)
    const dimensions: THREE.Vector3Tuple = [1, 1, 1];

    // No rotation initially
    const rotation: THREE.Vector3Tuple = [0, 0, 0];

    // Add to staged transforms
    setStagedCuboidTransforms((prev) => ({
      ...prev,
      [labelId]: {
        location,
        dimensions,
        rotation,
      },
    }));

    // Select the newly created cuboid
    setSelectedLabelForAnnotation({
      _id: labelId,
      _cls: "Detection",
      location,
      dimensions,
      rotation,
    } as any);

    // Exit create mode after creating one cuboid
    setIsCreatingCuboid(false);
  };

  // Calculate the annotation plane for raycasting
  // This properly uses the annotation plane's position and orientation to resolve depth ambiguity
  const raycastPlane = useMemo(() => {
    const plane = getPlaneFromPositionAndQuaternion(
      annotationPlane.position,
      annotationPlane.quaternion
    );

    return {
      normal: plane.normal,
      constant: plane.constant,
    };
  }, [annotationPlane.position, annotationPlane.quaternion]);

  useEmptyCanvasInteraction({
    onPointerUp: isCreatingCuboid
      ? (intersectionPoint) => {
          handleCanvasClick(intersectionPoint);
        }
      : undefined,
    planeNormal: raycastPlane.normal,
    planeConstant: raycastPlane.constant,
  });

  // Don't render anything - this component just handles interactions
  return null;
};
