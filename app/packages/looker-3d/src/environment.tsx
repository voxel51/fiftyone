/**
 * This module exports cameras and lights for the scene
 */
import { OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { MutableRefObject, useLayoutEffect } from "react";
import { Camera } from "three";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { ThreeDPluginSettings } from "./Looker3dPlugin";

type CameraProps = {
  cameraRef: MutableRefObject<Camera>;
  controlsRef: MutableRefObject<{ useLayoutEffect: typeof useLayoutEffect }> &
    React.Ref<OrbitControlsImpl>;
  settings: ThreeDPluginSettings;
};

export const CameraSetup = ({
  cameraRef,
  controlsRef,
  settings,
}: CameraProps) => {
  const camera = useThree((state) => state.camera);

  controlsRef.current.useLayoutEffect(() => {
    if (settings.defaultCameraPosition) {
      camera.position.set(
        settings.defaultCameraPosition.x,
        settings.defaultCameraPosition.y,
        settings.defaultCameraPosition.z
      );
    } else {
      camera.position.set(0, 0, 20);
    }
    camera.rotation.set(0, 0, 0);
    camera.updateProjectionMatrix();
    cameraRef.current = camera;
  }, [camera, settings, cameraRef]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      autoRotateSpeed={2.5}
      zoomSpeed={0.5}
    />
  );
};
