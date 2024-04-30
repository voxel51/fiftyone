import { getSampleSrc } from "@fiftyone/state";
import { useLoader } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import { BufferGeometry, Mesh, Quaternion, Vector3 } from "three";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader";
import {
  FoMeshBasicMaterialProps,
  FoMeshMaterial,
  PlyAsset,
} from "../../hooks";
import { useMeshMaterialControls } from "../../hooks/use-mesh-material-controls";
import { useFo3dContext } from "../context";
import { getBasePathForTextures, getResolvedUrlForFo3dAsset } from "../utils";

interface PlyProps {
  name: string;
  ply: PlyAsset;
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
  children?: React.ReactNode;
}

const PlyWithMaterialOverride = ({
  name,
  geometry,
  defaultMaterial,
}: {
  name: string;
  geometry: BufferGeometry;
  defaultMaterial: FoMeshMaterial;
}) => {
  const basicMaterial = useMemo(
    () =>
      ({
        ...defaultMaterial,
        vertexColors: true,
        color: "#ffffff",
      } as FoMeshBasicMaterialProps),
    [defaultMaterial]
  );

  const { material } = useMeshMaterialControls(name, basicMaterial);

  const mesh = useMemo(() => {
    return new Mesh(geometry, material);
  }, [geometry, material]);

  if (!mesh) {
    return null;
  }

  return <primitive object={mesh} />;
};

const PlyWithNoMaterialOverride = ({
  name,
  geometry,
  defaultMaterial,
}: {
  name: string;
  geometry: BufferGeometry;
  defaultMaterial: FoMeshMaterial;
}) => {
  const { material } = useMeshMaterialControls(name, defaultMaterial);

  const mesh = useMemo(() => {
    return new Mesh(geometry, material);
  }, [geometry, material]);

  if (!mesh) {
    return null;
  }

  return <primitive object={mesh} />;
};

export const Ply = ({
  name,
  ply: { plyPath, defaultMaterial },
  position,
  quaternion,
  scale,
  children,
}: PlyProps) => {
  const { fo3dRoot } = useFo3dContext();

  const plyUrl = useMemo(
    () => getSampleSrc(getResolvedUrlForFo3dAsset(plyPath, fo3dRoot)),
    [plyPath, fo3dRoot]
  );

  const resourcePath = useMemo(
    () => getBasePathForTextures(fo3dRoot, plyUrl),
    [fo3dRoot, plyUrl]
  );

  const geometry = useLoader(PLYLoader, plyUrl, (loader) => {
    loader.resourcePath = resourcePath;
  });

  const [isUsingVertexColors, setIsUsingVertexColors] = useState(false);
  const [isGeometryResolved, setIsGeometryResolved] = useState(false);

  useEffect(() => {
    if (!geometry) {
      return;
    }

    if (
      geometry.attributes?.position?.count &&
      !geometry.attributes.normal?.count
    ) {
      geometry.computeVertexNormals();
      geometry.center();
    }

    if (geometry.attributes?.color?.count) {
      setIsUsingVertexColors(true);
    }

    setIsGeometryResolved(true);
  }, [geometry]);

  const mesh = useMemo(() => {
    if (!isGeometryResolved) {
      return null;
    }

    if (isUsingVertexColors) {
      return (
        <PlyWithMaterialOverride
          name={name}
          geometry={geometry}
          defaultMaterial={defaultMaterial}
        />
      );
    }

    return (
      <PlyWithNoMaterialOverride
        name={name}
        geometry={geometry}
        defaultMaterial={defaultMaterial}
      />
    );
  }, [
    isGeometryResolved,
    isUsingVertexColors,
    geometry,
    name,
    defaultMaterial,
  ]);

  if (!mesh) {
    return null;
  }

  return (
    <group position={position} quaternion={quaternion} scale={scale}>
      {mesh}
      <group>{children ?? null}</group>
    </group>
  );
};
