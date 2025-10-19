import { useCallback, useEffect } from "react";
import { useSetRecoilState } from "recoil";
import { Vector3 } from "three";
import { useFo3dContext } from "../fo3d/context";
import { cameraViewStatusAtom } from "../state";

interface UseCameraViewsProps {
  cameraControlsRef: React.RefObject<any>;
}

export const useCameraViews = ({ cameraControlsRef }: UseCameraViewsProps) => {
  const { sceneBoundingBox, upVector } = useFo3dContext();
  const setCameraViewStatus = useSetRecoilState(cameraViewStatusAtom);

  const calculateCameraPosition = useCallback(
    (direction: Vector3) => {
      if (!sceneBoundingBox || !upVector) {
        return null;
      }

      const center = sceneBoundingBox.getCenter(new Vector3());
      const size = sceneBoundingBox.getSize(new Vector3());
      const maxSize = Math.max(size.x, size.y, size.z);
      const distance = maxSize * 2;

      const cameraPosition = center
        .clone()
        .add(direction.clone().multiplyScalar(distance));

      return {
        cameraPosition,
        center,
      };
    },
    [sceneBoundingBox, upVector]
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
      if (
        !(event.code.startsWith("Numpad") || event.code.startsWith("Digit")) ||
        !upVector
      ) {
        return;
      }

      const numPressed = event.code.startsWith("Numpad")
        ? event.code.replace("Numpad", "")
        : event.code.replace("Digit", "");

      if (numPressed === "1" || numPressed === "2" || numPressed === "3") {
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
      } else {
        return;
      }

      setCameraView(direction, viewName);
    },
    [upVector, setCameraView]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);
};
