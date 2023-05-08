/**
 * This module exports cameras and lights for the scene
 */
import { OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { MutableRefObject, useEffect, useMemo } from "react";
import { Box3, Camera, Quaternion, Vector3 } from "three";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Looker3dPluginSettings } from "./Looker3dPlugin";

export const CAMERA_POSITION_KEY = "fiftyone-camera-position";

type EnvironmentProps = {
  cameraRef: MutableRefObject<Camera>;
  controlsRef: MutableRefObject<OrbitControlsImpl>;
  settings: Looker3dPluginSettings;
  isGridOn: boolean;
  bounds: Box3;
};

const ORIGIN = new Vector3(0, 0, 0);

export const Environment = ({
  cameraRef,
  controlsRef,
  settings,
  isGridOn,
  bounds,
}: EnvironmentProps) => {
  const camera = useThree((state) => state.camera);

  const upNormalized = useMemo(
    () => new Vector3(...settings.defaultUp).normalize(),
    [settings]
  );

  const gridHelperQuarternion = useMemo(() => {
    // calculate angle between custom up direction and default up direction (y-axis in three-js)
    const angle = Math.acos(upNormalized.dot(new Vector3(0, 1, 0)));

    // calculate axis perpendicular to both the default up direction and the custom up direction
    const axis = new Vector3()
      .crossVectors(new Vector3(0, 1, 0), upNormalized)
      .normalize();

    // quaternion to represent the rotation around an axis perpendicular to both the default up direction and the custom up direction
    return new Quaternion().setFromAxisAngle(axis, angle);
  }, [upNormalized]);

  useEffect(() => {
    cameraRef.current = camera;

    const handleCameraChange = () => {
      window?.localStorage.setItem(
        CAMERA_POSITION_KEY,
        JSON.stringify(camera.position.toArray())
      );
    };

    const controls = controlsRef.current;

    controls?.addEventListener("change", handleCameraChange);

    return () => {
      controls?.removeEventListener("change", handleCameraChange);
    };
  }, [camera, cameraRef, controlsRef]);

  const isDefaultUpZ = useMemo(
    () => upNormalized.equals(new Vector3(0, 0, 1)),
    [upNormalized]
  );

  const isDefaultUpY = useMemo(
    () => upNormalized.equals(new Vector3(0, 1, 0)),
    [upNormalized]
  );

  const isDefaultUpX = useMemo(
    () => upNormalized.equals(new Vector3(1, 0, 0)),
    [upNormalized]
  );

  const isDefaultUpOrthoNormal = useMemo(
    () => isDefaultUpX || isDefaultUpY || isDefaultUpZ,
    [isDefaultUpX, isDefaultUpY, isDefaultUpZ]
  );

  const gridSize = useMemo(() => {
    let maxInProjectionPlane: number;

    if (isDefaultUpX) {
      maxInProjectionPlane = Math.max(
        bounds?.max?.y - bounds?.min?.y,
        bounds?.max?.z - bounds?.min?.z
      );
    } else if (isDefaultUpY) {
      maxInProjectionPlane = Math.max(
        bounds?.max?.x - bounds?.min?.x,
        bounds?.max?.z - bounds?.min?.z
      );
    } else if (isDefaultUpZ) {
      maxInProjectionPlane = Math.max(
        bounds?.max?.x - bounds?.min?.x,
        bounds?.max?.y - bounds?.min?.y
      );
    } else {
      return 100; // arbitrary number for non-orthonormal up vectors
    }

    if (isNaN(maxInProjectionPlane)) {
      return 100; // arbitrary number for non-orthonormal up vectors
    }

    return Math.ceil(maxInProjectionPlane * 1.1); // add 10% padding
  }, [bounds, isDefaultUpX, isDefaultUpY, isDefaultUpZ]);

  const numGridLines = useMemo(() => {
    const numLines = Math.ceil(gridSize / 10);
    return numLines === 1 ? 5 : numLines;
  }, [gridSize]);

  return (
    <>
      <OrbitControls
        ref={controlsRef}
        makeDefault
        autoRotateSpeed={2.5}
        zoomSpeed={0.5}
      />

      <axesHelper />

      {/* display arrow helper with up vector if it's a non-standard up vecotr (like [0,1,1]) */}
      {!isDefaultUpOrthoNormal && <arrowHelper args={[upNormalized, ORIGIN]} />}

      {isGridOn && (
        <gridHelper
          args={[gridSize, numGridLines]}
          quaternion={gridHelperQuarternion}
        />
      )}
    </>
  );
};
