/**
 * This module exports cameras and lights for the scene
 */
import { OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { MutableRefObject, useLayoutEffect, useMemo } from "react";
import { Camera, Quaternion, Vector3, Box3 } from "three";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Looker3dPluginSettings } from "./Looker3dPlugin";

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

  useLayoutEffect(() => {
    if (settings.defaultCameraPosition) {
      camera.position.set(
        settings.defaultCameraPosition.x,
        settings.defaultCameraPosition.y,
        settings.defaultCameraPosition.z
      );
    } else {
      camera.position.set(0, 0, 20);
    }

    camera.up = upNormalized.clone();

    camera.updateProjectionMatrix();
    cameraRef.current = camera;

    controlsRef.current.target = new Vector3(0, 0, 0);
    controlsRef.current.update();
  }, [camera, cameraRef, controlsRef, settings, upNormalized]);

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
          args={[gridSize, Math.ceil(gridSize / 10)]}
          quaternion={gridHelperQuarternion}
        />
      )}
    </>
  );
};
