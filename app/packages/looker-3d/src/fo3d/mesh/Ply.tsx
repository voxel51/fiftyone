import { getSampleSrc } from "@fiftyone/state";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type BufferGeometry,
  Mesh,
  Points,
  type Quaternion,
  Vector3,
} from "three";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader";
import type {
  FoMeshBasicMaterialProps,
  FoMeshMaterial,
  FoPointcloudMaterialProps,
  PlyAsset,
} from "../../hooks";
import { useFoLoader } from "../../hooks/use-fo-loaders";
import { useMeshMaterialControls } from "../../hooks/use-mesh-material-controls";
import { usePointCloudHover } from "../../hooks/use-point-cloud-hover";
import { HoveredPointMarker } from "../components/HoveredPointMarker";
import { useFo3dContext } from "../context";
import { usePcdMaterial } from "../point-cloud/use-pcd-material";
import { getBasePathForTextures, getResolvedUrlForFo3dAsset } from "../utils";

interface PlyProps {
  name: string;
  ply: PlyAsset;
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
  children?: React.ReactNode;
}

const PlyWithPointsMaterial = ({
  name,
  geometry,
  defaultMaterial,
  quaternion,
  position,
  scale,
  vertexColorsAvailable,
}: {
  name: string;
  geometry: BufferGeometry;
  defaultMaterial: FoMeshMaterial;
  quaternion: Quaternion;
  position: Vector3;
  scale: Vector3;
  vertexColorsAvailable: boolean;
}) => {
  const overrideMaterial = {
    shadingMode: "height",
    customColor: defaultMaterial["color"] ?? "#ffffff",
    pointSize: 2,
    attenuateByDistance: false,
    opacity: defaultMaterial.opacity,
  } as FoPointcloudMaterialProps;

  const pointsContainerRef = useRef();

  const { pointsMaterial, shadingMode } = usePcdMaterial(
    name,
    geometry,
    overrideMaterial,
    pointsContainerRef,
    quaternion,
    vertexColorsAvailable
  );

  const mesh = useMemo(() => new Points(geometry), [geometry]);

  const { hoverProps, currentHoveredPoint } = usePointCloudHover({
    geometry,
    assetName: name,
    shadingMode,
    position,
    quaternion,
    scale,
  });

  const { setHoverMetadata } = useFo3dContext();

  useEffect(() => {
    setHoverMetadata((prev) => ({
      ...prev,
      renderModeDescriptor: shadingMode,
    }));
  }, [shadingMode]);

  if (!geometry || !pointsMaterial) {
    return null;
  }

  return (
    <>
      {currentHoveredPoint && (
        <HoveredPointMarker position={currentHoveredPoint} />
      )}
      <primitive ref={pointsContainerRef} object={mesh} {...hoverProps}>
        {pointsMaterial}
      </primitive>
    </>
  );
};

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
  ply: {
    plyPath,
    preTransformedPlyPath,
    defaultMaterial,
    isPcd,
    centerGeometry,
  },
  position,
  quaternion,
  scale,
  children,
}: PlyProps) => {
  const { fo3dRoot } = useFo3dContext();

  const plyUrl = useMemo(
    () =>
      preTransformedPlyPath ??
      getSampleSrc(getResolvedUrlForFo3dAsset(plyPath, fo3dRoot)),
    [plyPath, preTransformedPlyPath, fo3dRoot]
  );

  const resourcePath = useMemo(
    () => getBasePathForTextures(fo3dRoot, plyUrl),
    [fo3dRoot, plyUrl]
  );

  const geometry = useFoLoader(PLYLoader, plyUrl, (loader) => {
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

      if (centerGeometry) {
        geometry.center();
      }
    }

    if (geometry.attributes?.color?.count) {
      setIsUsingVertexColors(true);
    }

    setIsGeometryResolved(true);
  }, [geometry, centerGeometry]);

  const mesh = useMemo(() => {
    if (!isGeometryResolved) {
      return null;
    }

    if (isPcd) {
      return (
        <PlyWithPointsMaterial
          name={name}
          geometry={geometry}
          defaultMaterial={defaultMaterial}
          quaternion={quaternion}
          position={position}
          scale={scale}
          vertexColorsAvailable={isUsingVertexColors}
        />
      );
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
    isPcd,
    name,
    defaultMaterial,
    position,
    scale,
    quaternion,
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
