import useCanAnnotate from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/useCanAnnotate";
import * as fos from "@fiftyone/state";
import { useAtomValue } from "jotai";
import React, { useCallback, useEffect } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { type PerspectiveCamera, Quaternion, Vector3 } from "three";
import { useWorkingLabel } from "../annotation/store";
import {
  canTransformArchetypeUseMode,
  getSelectedTransformArchetype,
} from "../annotation/transform-archetype";
import type {
  ReconciledDetection3D,
  ReconciledPolyline3D,
} from "../annotation/types";
import {
  SET_EGO_VIEW_EVENT,
  SET_TOP_VIEW_EVENT,
  SET_ZOOM_TO_SELECTED_EVENT,
} from "../constants";
import {
  getCameraControlsTarget,
  setCameraControlsLookAt,
  type Fo3dCameraControls,
} from "../fo3d/camera-controls";
import { useFo3dContext } from "../fo3d/context";
import {
  annotationPlaneAtom,
  cameraViewStatusAtom,
  currentArchetypeSelectedForTransformAtom,
  isFo3dBackgroundOnAtom,
  selectedLabelForAnnotationAtom,
  selectedPolylineVertexAtom,
} from "../state";
import { isDetection3dOverlay, isPolyline3dOverlay } from "../types";

interface UseCameraViewsProps {
  cameraRef: React.RefObject<PerspectiveCamera>;
  cameraControlsRef: React.RefObject<Fo3dCameraControls>;
}

/**
 * Calculate the centroid and suggested viewing radius of a selected label.
 * For cuboids (Detection), returns the location and radius based on dimensions.
 * For polylines, calculates the centroid and radius from bounding box of all points.
 */
const calculateLabelCentroidAndRadius = (
  label?: ReconciledDetection3D | ReconciledPolyline3D | null,
): { centroid: Vector3; radius: number } | null => {
  if (!label) {
    return null;
  }

  if (isDetection3dOverlay(label)) {
    const location = label.location;
    const dimensions = label.dimensions;

    if (location) {
      // Calculate radius based on dimensions diagonal
      const radius =
        Math.sqrt(
          dimensions[0] ** 2 + dimensions[1] ** 2 + dimensions[2] ** 2,
        ) * 4.5;

      return {
        centroid: new Vector3(...location),
        radius,
      };
    }
  } else if (isPolyline3dOverlay(label)) {
    const points3d = label.points3d;

    if (points3d && points3d.length > 0) {
      const allPoints = points3d.flat();
      if (allPoints.length > 0) {
        const sum = allPoints.reduce(
          (acc, point) => [
            acc[0] + point[0],
            acc[1] + point[1],
            acc[2] + point[2],
          ],
          [0, 0, 0] as [number, number, number],
        );
        const centroid = new Vector3(
          sum[0] / allPoints.length,
          sum[1] / allPoints.length,
          sum[2] / allPoints.length,
        );

        // Calculate bounding box to determine viewing radius
        const min = [
          Number.POSITIVE_INFINITY,
          Number.POSITIVE_INFINITY,
          Number.POSITIVE_INFINITY,
        ];
        const max = [
          Number.NEGATIVE_INFINITY,
          Number.NEGATIVE_INFINITY,
          Number.NEGATIVE_INFINITY,
        ];
        for (const point of allPoints) {
          min[0] = Math.min(min[0], point[0]);
          min[1] = Math.min(min[1], point[1]);
          min[2] = Math.min(min[2], point[2]);
          max[0] = Math.max(max[0], point[0]);
          max[1] = Math.max(max[1], point[1]);
          max[2] = Math.max(max[2], point[2]);
        }

        // Use diagonal of bounding box * 1.5 for good viewing distance
        const diagonal = Math.sqrt(
          (max[0] - min[0]) ** 2 +
            (max[1] - min[1]) ** 2 +
            (max[2] - min[2]) ** 2,
        );
        const radius = Math.max(diagonal * 1.5, 2); // minimum radius of 2

        return { centroid, radius };
      }
    }
  }

  return null;
};

export const useCameraViews = ({
  cameraRef,
  cameraControlsRef,
}: UseCameraViewsProps) => {
  const { sceneBoundingBox, upVector } = useFo3dContext();
  const setCameraViewStatus = useSetRecoilState(cameraViewStatusAtom);
  const annotationPlane = useRecoilValue(annotationPlaneAtom);
  const canAnnotate = useCanAnnotate();
  const mode = useAtomValue(fos.modalMode);
  const enableAnnotationPlaneCameraView =
    canAnnotate && mode === fos.ModalMode.ANNOTATE;
  const selectedLabelForAnnotation = useRecoilValue(
    selectedLabelForAnnotationAtom,
  );
  const currentArchetypeSelectedForTransform = useRecoilValue(
    currentArchetypeSelectedForTransformAtom,
  );
  const selectedPoint = useRecoilValue(selectedPolylineVertexAtom);
  const setIsFo3dBackgroundOn = useSetRecoilState(isFo3dBackgroundOnAtom);

  const workingLabel = useWorkingLabel(selectedLabelForAnnotation?._id ?? "");
  const selectedTransformArchetype = getSelectedTransformArchetype({
    currentArchetypeSelectedForTransform,
    isAnnotationPlaneEnabled: annotationPlane.enabled,
    selectedLabelForAnnotation,
    selectedPoint,
  });
  const shouldReserveTForTransform =
    mode === fos.ModalMode.ANNOTATE &&
    canTransformArchetypeUseMode(selectedTransformArchetype, "translate");

  // We use current camera position and look at point to calculate the camera position
  // with some reasonable constraints.
  // Alternative is to place camera outside bounding box, but that causes a "loss of information" type of UX.
  const calculateCameraPosition = useCallback(
    (direction: Vector3) => {
      if (
        !sceneBoundingBox ||
        !cameraRef.current ||
        !cameraControlsRef.current
      ) {
        return null;
      }

      const currentCameraPosition = cameraRef.current.position.clone();
      const lookAt = getCameraControlsTarget(cameraControlsRef.current);

      // Calculate radius based on the position of the camera and the look at point
      const currentRadius = currentCameraPosition.distanceTo(lookAt);

      // Get scene bounding box dimensions to bound the radius
      const center = sceneBoundingBox.getCenter(new Vector3());
      const size = sceneBoundingBox.getSize(new Vector3());
      const maxSize = Math.max(size.x, size.y, size.z);
      // Minimum radius is half the largest dimension
      const minRadius = maxSize * 0.5;
      // Maximum radius is 3x the largest dimension
      const maxRadius = maxSize * 3;

      // Clamp the radius
      const radius = Math.max(minRadius, Math.min(maxRadius, currentRadius));

      // Constrain lookAt to stay within 130% of scene bounding box center
      const maxLookAtDistance = maxSize * 1.3;
      const lookAtDistance = lookAt.distanceTo(center);
      let constrainedLookAt = lookAt;

      if (lookAtDistance > maxLookAtDistance) {
        const directionToLookAt = lookAt.clone().sub(center).normalize();
        constrainedLookAt = center
          .clone()
          .add(directionToLookAt.multiplyScalar(maxLookAtDistance));
      }

      // Position camera at constrained lookAt point + direction * radius
      const cameraPosition = constrainedLookAt
        .clone()
        .add(direction.clone().multiplyScalar(radius));

      return {
        cameraPosition,
        center: constrainedLookAt,
      };
    },
    [sceneBoundingBox, cameraRef, cameraControlsRef],
  );

  const applyCameraView = useCallback(
    (cameraPosition: Vector3, target: Vector3, viewName: string) => {
      if (!cameraRef.current || !cameraControlsRef.current) {
        return;
      }

<<<<<<< HEAD
      cameraControlsRef.current.setLookAt(
        cameraPosition.x,
        cameraPosition.y,
        cameraPosition.z,
        target.x,
        target.y,
        target.z,
        true,
      );
=======
      setCameraControlsLookAt({
        camera: cameraRef.current,
        controls: cameraControlsRef.current,
        position: cameraPosition,
        target,
      });
>>>>>>> main

      setCameraViewStatus({
        viewName,
        timestamp: Date.now(),
      });
    },
<<<<<<< HEAD
    [cameraControlsRef, setCameraViewStatus],
=======
    [cameraRef, cameraControlsRef, setCameraViewStatus],
>>>>>>> main
  );

  const setCameraView = useCallback(
    (direction: Vector3, viewName: string) => {
      const result = calculateCameraPosition(direction);
      if (!result) {
        return;
      }

      const { cameraPosition, center } = result;
      applyCameraView(cameraPosition, center, viewName);
    },
    [calculateCameraPosition, applyCameraView],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      // If we're in input mode, don't handle camera views
      const isInputMode =
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement;

      if (isInputMode) {
        return;
      }

      if (
        !event.metaKey &&
        event.code === "KeyT" &&
        !shouldReserveTForTransform
      ) {
        setCameraViewStatus({
          viewName: "Top view",
          timestamp: Date.now(),
        });
        event.preventDefault();
        window.dispatchEvent(new CustomEvent(SET_TOP_VIEW_EVENT));
        return;
      }

      if (!event.metaKey && event.code === "KeyE") {
        setCameraViewStatus({
          viewName: "Ego view",
          timestamp: Date.now(),
        });
        event.preventDefault();
        window.dispatchEvent(new CustomEvent(SET_EGO_VIEW_EVENT));
        return;
      }

      // exclude ctrlKey so Windows Ctrl+Z falls through to undo
      if (!event.metaKey && !event.ctrlKey && event.code === "KeyZ") {
        setCameraViewStatus({
          viewName: "Crop",
          timestamp: Date.now(),
        });
        event.preventDefault();
        window.dispatchEvent(new CustomEvent(SET_ZOOM_TO_SELECTED_EVENT));
        return;
      }

      if (
        event.code === "KeyB" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey &&
        !event.repeat
      ) {
        setIsFo3dBackgroundOn((prev) => !prev);
        event.preventDefault();
        return;
      }

      if (
        !(event.code.startsWith("Numpad") || event.code.startsWith("Digit")) ||
        !upVector
      ) {
        return;
      }

      const numPressed = event.code.startsWith("Numpad")
        ? event.code.replace("Numpad", "")
        : event.code.replace("Digit", "");

      if (
        numPressed === "1" ||
        numPressed === "2" ||
        numPressed === "3" ||
        (numPressed === "4" && enableAnnotationPlaneCameraView)
      ) {
        event.preventDefault();
      }

      const isCtrlPressed = event.ctrlKey || event.metaKey;

      let direction: Vector3;
      let viewName: string;

      const isYUp = Math.abs(upVector.y) === 1;
      const isXUp = Math.abs(upVector.x) === 1;
      const isZUp = Math.abs(upVector.z) === 1;

      if (numPressed === "1") {
        if (isCtrlPressed) {
          viewName = "Bottom view";

          if (isYUp) {
            direction = new Vector3(0, -1, 0);
          } else if (isXUp) {
            direction = new Vector3(-1, 0, 0);
          } else if (isZUp) {
            direction = new Vector3(0, 0, -1);
          } else {
            direction = new Vector3(0, 0, -1);
          }
        } else {
          viewName = "Top view";

          if (isYUp) {
            direction = new Vector3(0, 1, 0);
          } else if (isXUp) {
            direction = new Vector3(1, 0, 0);
          } else if (isZUp) {
            direction = new Vector3(0, 0, 1);
          } else {
            direction = new Vector3(0, 0, 1);
          }
        }
      } else if (numPressed === "2") {
        if (isCtrlPressed) {
          viewName = "Left view";
          if (isYUp) {
            direction = new Vector3(-1, 0, 0);
          } else if (isXUp) {
            direction = new Vector3(0, -1, 0);
          } else if (isZUp) {
            direction = new Vector3(-1, 0, 0);
          } else {
            direction = new Vector3(-1, 0, 0);
          }
        } else {
          viewName = "Right view";
          if (isYUp) {
            direction = new Vector3(1, 0, 0);
          } else if (isXUp) {
            direction = new Vector3(0, 1, 0);
          } else if (isZUp) {
            direction = new Vector3(1, 0, 0);
          } else {
            direction = new Vector3(1, 0, 0);
          }
        }
      } else if (numPressed === "3") {
        if (isCtrlPressed) {
          viewName = "Back view";
          if (isYUp) {
            direction = new Vector3(0, 0, -1);
          } else if (isXUp) {
            direction = new Vector3(0, 0, 1);
          } else if (isZUp) {
            direction = new Vector3(0, 1, 0);
          } else {
            direction = new Vector3(0, 1, 0);
          }
        } else {
          viewName = "Front view";
          if (isYUp) {
            direction = new Vector3(0, 0, 1);
          } else if (isXUp) {
            direction = new Vector3(0, 0, -1);
          } else if (isZUp) {
            direction = new Vector3(0, -1, 0);
          } else {
            direction = new Vector3(0, -1, 0);
          }
        }
      } else if (numPressed === "4" && enableAnnotationPlaneCameraView) {
        const quat = new Quaternion(...annotationPlane.quaternion);
        const normal = new Vector3(0, 0, 1).applyQuaternion(quat).normalize();

        if (isCtrlPressed) {
          direction = normal.clone().negate();
          viewName = "Annotation plane view 2";
        } else {
          direction = normal.clone();
          viewName = "Annotation plane view 1";
        }
      } else {
        return;
      }

      if (selectedLabelForAnnotation && cameraControlsRef.current) {
        const labelInfo = calculateLabelCentroidAndRadius(workingLabel);

        if (labelInfo) {
          const { centroid, radius } = labelInfo;
          const cameraPosition = centroid
            .clone()
            .add(direction.clone().multiplyScalar(radius));

          applyCameraView(cameraPosition, centroid, viewName);
          return;
        }
      }

      setCameraView(direction, viewName);
    },
    [
      upVector,
      setCameraView,
      applyCameraView,
      setCameraViewStatus,
      annotationPlane,
      enableAnnotationPlaneCameraView,
      shouldReserveTForTransform,
      selectedLabelForAnnotation,
      workingLabel,
      cameraControlsRef,
    ],
  );

  // This effect registers and cleans up keyboard shortcuts for camera views.
  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);
};
