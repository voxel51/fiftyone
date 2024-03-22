import { getSampleSrc } from "@fiftyone/state";
import { useLoader, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { Color, CubeTexture, CubeTextureLoader, TextureLoader } from "three";
import { FoScene } from "../hooks";

interface Fo3dBackgroundProps {
  background: FoScene["background"];
}

const CubeBackground = ({
  cube,
  intensity,
}: {
  cube: Fo3dBackgroundProps["background"]["cube"];
  intensity: Fo3dBackgroundProps["background"]["intensity"];
}) => {
  const { scene } = useThree();
  // images are assumed to correspond to px, nx, py, ny, pz, and nz
  const imageUrls = useMemo(() => cube.map(getSampleSrc), [cube]);
  // @ts-ignore - types are wrong for CubeTextureLoader
  const [cubeMap]: [CubeTexture] = useLoader(CubeTextureLoader, [imageUrls]);

  useEffect(() => {
    if (cubeMap) {
      scene.background = cubeMap;
      scene.backgroundIntensity = intensity;
    }

    return () => {
      scene.background = null;
    };
  }, [scene, cubeMap, intensity]);

  return null;
};

const ImageBackground = ({
  image,
  intensity,
}: {
  image: Fo3dBackgroundProps["background"]["image"];
  intensity: Fo3dBackgroundProps["background"]["intensity"];
}) => {
  const { scene } = useThree();
  const imageUrl = useMemo(() => getSampleSrc(image), [image]);
  const texture = useLoader(TextureLoader, imageUrl);

  useEffect(() => {
    scene.background = texture;
    scene.backgroundIntensity = intensity;

    return () => {
      scene.background = null;
    };
  }, [scene, texture, intensity]);

  return null;
};

const ColorBackground = ({
  color,
}: {
  color: Fo3dBackgroundProps["background"]["color"];
}) => {
  const { scene } = useThree();

  useEffect(() => {
    scene.background = new Color(color);

    return () => {
      scene.background = null;
    };
  }, [scene, color]);

  return null;
};

export const Fo3dBackground = ({ background }: Fo3dBackgroundProps) => {
  if (background.cube) {
    return (
      <CubeBackground cube={background.cube} intensity={background.intensity} />
    );
  }

  if (background.image) {
    return (
      <ImageBackground
        image={background.image}
        intensity={background.intensity}
      />
    );
  }

  if (background.color) {
    return <ColorBackground color={background.color} />;
  }

  return null;
};
