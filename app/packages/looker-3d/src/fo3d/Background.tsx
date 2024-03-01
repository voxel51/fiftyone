import { getSampleSrc } from "@fiftyone/state";
import { useLoader, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { TextureLoader } from "three";
import { FoScene } from "../hooks";

interface Fo3dBackgroundProps {
  cameraProps: FoScene["cameraProps"];
}

export const Fo3dBackground = ({ cameraProps }: Fo3dBackgroundProps) => {
  const { scene } = useThree();

  const imageUrl = useMemo(
    () => getSampleSrc(cameraProps.backgroundImagePath),
    [cameraProps.backgroundImagePath]
  );

  const texture = useLoader(TextureLoader, imageUrl);

  useEffect(() => {
    scene.background = texture;
    scene.backgroundIntensity = 0.1;

    return () => {
      scene.background = null;
    };
  }, [scene, texture]);

  return null;
};
