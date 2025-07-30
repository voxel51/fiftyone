import { getSampleSrc } from "@fiftyone/state";
import { ThreeEvent, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRecoilState } from "recoil";
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
import { currentHoveredPointAtom } from "../../state";
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
}: {
  name: string;
  geometry: BufferGeometry;
  defaultMaterial: FoMeshMaterial;
}) => {
  const { pointCloudSettings, setHoverMetadata } = useFo3dContext();
  const [currentHoveredPoint, setCurrentHoveredPoint] = useRecoilState(
    currentHoveredPointAtom
  );

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
    pointsContainerRef
  );

  const mesh = useMemo(() => new Points(geometry), [geometry]);

  const pointerMoveHandler = useMemo(
    () => (e: ThreeEvent<MouseEvent>) => {
      const idx = e.index;
      if (idx === undefined) return;

      const md: Record<string, any> = { index: idx };

      if (geometry.hasAttribute("rgb")) {
        const colorAttr = geometry.getAttribute("rgb");

        md.rgb = [
          colorAttr.getX(idx),
          colorAttr.getY(idx),
          colorAttr.getZ(idx),
        ];
      }

      if (geometry.hasAttribute("position")) {
        const posAttr = geometry.getAttribute("position");
        md.coord = [posAttr.getX(idx), posAttr.getY(idx), posAttr.getZ(idx)];
        setCurrentHoveredPoint(
          new Vector3(posAttr.getX(idx), posAttr.getY(idx), posAttr.getZ(idx))
        );
      }

      // dynamically handle all other attributes
      Object.keys(geometry.attributes).forEach((attr) => {
        if (attr === "rgb" || attr === "position") return;
        md[attr] = geometry.attributes[attr].getX(idx);
      });

      setHoverMetadata({
        assetName: name,
        renderModeDescriptor: shadingMode,
        attributes: md,
      });
    },
    [geometry, setHoverMetadata, shadingMode, name]
  );

  const hoverProps = useMemo(() => {
    if (!pointCloudSettings.enableTooltip) return {};

    return {
      // fires on *every* intersected point
      onPointerMove: pointerMoveHandler,
      onPointerOut: () => {
        setCurrentHoveredPoint(null);
      },
    };
  }, [pointCloudSettings.enableTooltip, pointerMoveHandler]);

  useEffect(() => {
    return () => {
      setCurrentHoveredPoint(null);
    };
  }, [pointerMoveHandler]);

  useEffect(() => {
    setHoverMetadata((prev) => ({
      ...prev,
      renderModeDescriptor: shadingMode,
    }));
  }, [shadingMode, setHoverMetadata]);

  const HoveredPointMarker = ({ position }: { position: Vector3 }) => {
    const meshRef = useRef<any>(null);

    // apply pulsating effect for scaling (based on distance from camera) and color
    // so that the marker is visible from far away
    useFrame(({ clock, camera }) => {
      const t = clock.getElapsedTime();
      const distance = camera.position.distanceTo(position);
      const pulse = 0.5 + 0.3 * Math.sin(t * 4);
      const scale = pulse * (distance * 0.1);

      if (meshRef.current) {
        meshRef.current.scale.set(scale, scale, scale);
        const colorPhase = (Math.sin(t * 2) + 1) / 2;
        meshRef.current.material.color.setRGB(1, colorPhase, 0);
        meshRef.current.material.emissive.setRGB(1, colorPhase, 0);
        meshRef.current.material.emissiveIntensity = 0.7 + 0.3 * colorPhase;
      }
    });
    return (
      <mesh ref={meshRef} position={position}>
        <sphereGeometry args={[0.07, 32, 32]} />
        <meshStandardMaterial
          color="red"
          emissive="orange"
          emissiveIntensity={1}
        />
      </mesh>
    );
  };

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
