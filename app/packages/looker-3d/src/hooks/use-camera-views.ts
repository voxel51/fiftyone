import useCanAnnotate from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/useCanAnnotate";
import * as fos from "@fiftyone/state";
import { CameraControls } from "@react-three/drei";
import { useAtomValue } from "jotai";
import React, { useCallback, useEffect } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { PerspectiveCamera, Quaternion, Vector3 } from "three";
import { useFo3dContext } from "../fo3d/context";
import { annotationPlaneAtom, cameraViewStatusAtom } from "../state";

interface UseCameraViewsProps {
  cameraRef: React.RefObject<PerspectiveCamera>;
  cameraControlsRef: React.RefObject<CameraControls>;
}

export const useCameraViews = ({
  cameraRef,
  cameraControlsRef,
}: UseCameraViewsProps) => {
  const { sceneBoundingBox, upVector } = useFo3dContext();
  const setCameraViewStatus = useSetRecoilState(cameraViewStatusAtom);
  const annotationPlane = useRecoilValue(annotationPlaneAtom);
  const canAnnotate = useCanAnnotate();
  const mode = useAtomValue(fos.modalMode);
  const enableAnnotationPlaneCameraView = canAnnotate && mode === "annotate";

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
      const lookAt = new Vector3();
      cameraControlsRef.current.getTarget(lookAt);

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
    [sceneBoundingBox, cameraRef, cameraControlsRef]
  );

  const setCameraView = useCallback(
    (direction: Vector3, viewName: string) => {
      const result = calculateCameraPosition(direction);
      if (!result || !cameraControlsRef.current) {
        return;
      }

      const { cameraPosition, center } = result;

      cameraControlsRef.current.setLookAt(
        cameraPosition.x,
        cameraPosition.y,
        cameraPosition.z,
        center.x,
        center.y,
        center.z,
        true
      );

      setCameraViewStatus({
        viewName,
        timestamp: Date.now(),
      });
    },
    [calculateCameraPosition, cameraControlsRef, setCameraViewStatus]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // If we're in input mode, don't handle camera views
      const isInputMode =
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement;

      if (isInputMode) {
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
        if (
          !cameraRef.current ||
          !cameraControlsRef.current ||
          !sceneBoundingBox
        ) {
          return;
        }

        // Get current radius
        const currentCameraPosition = cameraRef.current.position.clone();
        const currentLookAt = new Vector3();
        cameraControlsRef.current.getTarget(currentLookAt);
        const currentRadius = currentCameraPosition.distanceTo(currentLookAt);

        // Extract normal from annotation plane quaternion
        const quat = new Quaternion(...annotationPlane.quaternion);
        const normal = new Vector3(0, 0, 1).applyQuaternion(quat).normalize();

        // Use annotation plane position as look-at point
        const planePosition = new Vector3(...annotationPlane.position);

        let cameraPosition: Vector3;
        let viewName: string;

        if (isCtrlPressed) {
          // Opposite view: look at plane from opposite side (negative normal)
          // Position camera at plane position + (-normal) * radius
          cameraPosition = planePosition
            .clone()
            .add(normal.clone().negate().multiplyScalar(currentRadius));

          viewName = "Annotation plane view 2";
        } else {
          cameraPosition = planePosition
            .clone()
            .add(normal.clone().multiplyScalar(currentRadius));

          viewName = "Annotation plane view 1";
        }

        cameraControlsRef.current.setLookAt(
          cameraPosition.x,
          cameraPosition.y,
          cameraPosition.z,
          planePosition.x,
          planePosition.y,
          planePosition.z,
          true
        );

        setCameraViewStatus({
          viewName,
          timestamp: Date.now(),
        });

        return;
      } else {
        return;
      }

      setCameraView(direction, viewName);
    },
    [
      upVector,
      setCameraView,
      annotationPlane,
      cameraRef,
      cameraControlsRef,
      sceneBoundingBox,
      enableAnnotationPlaneCameraView,
    ]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);
};
