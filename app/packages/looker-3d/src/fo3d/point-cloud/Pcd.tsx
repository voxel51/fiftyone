import { getSampleSrc } from "@fiftyone/state";
import { ThreeEvent, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { useRecoilState } from "recoil";
import type { Quaternion } from "three";
import { Vector3 } from "three";
import type { PcdAsset } from "../../hooks";
import { useFoLoader } from "../../hooks/use-fo-loaders";
import { DynamicPCDLoader } from "../../loaders/dynamic-pcd-loader";
import { currentHoveredPointAtom } from "../../state";
import { useFo3dContext } from "../context";
import { getResolvedUrlForFo3dAsset } from "../utils";
import { usePcdMaterial } from "./use-pcd-material";

export const Pcd = ({
  name,
  pcd: { pcdPath, preTransformedPcdPath, defaultMaterial, centerGeometry },
  position,
  quaternion,
  scale,
  children,
}: {
  name: string;
  pcd: PcdAsset;
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
  children?: React.ReactNode;
}) => {
  const { fo3dRoot, pointCloudSettings, setHoverMetadata } = useFo3dContext();

  const [currentHoveredPoint, setCurrentHoveredPoint] = useRecoilState(
    currentHoveredPointAtom
  );

  const pcdUrl = useMemo(
    () =>
      preTransformedPcdPath ??
      getSampleSrc(getResolvedUrlForFo3dAsset(pcdPath, fo3dRoot)),
    [pcdPath, preTransformedPcdPath, fo3dRoot]
  );

  const points_ = useFoLoader(DynamicPCDLoader, pcdUrl);

  // todo: hack until https://github.com/pmndrs/react-three-fiber/issues/245 is fixed
  const points = useMemo(() => points_.clone(false), [points_]);

  useEffect(() => {
    if (points && centerGeometry) {
      points.geometry.center();
    }
  }, [points, centerGeometry]);

  const pcdContainerRef = useRef();

  const { pointsMaterial, shadingMode } = usePcdMaterial(
    name,
    points.geometry,
    defaultMaterial,
    pcdContainerRef
  );

  const pointerMoveHandler = useMemo(
    () => (e: ThreeEvent<MouseEvent>) => {
      const idx = e.index;
      if (idx === undefined) return;

      const md: Record<string, any> = { index: idx };

      if (
        points.geometry.hasAttribute("color") ||
        points.geometry.hasAttribute("rgb")
      ) {
        const colorAttr = points.geometry.hasAttribute("color")
          ? points.geometry.getAttribute("color")
          : points.geometry.getAttribute("rgb");

        md.rgb = [
          colorAttr.getX(idx),
          colorAttr.getY(idx),
          colorAttr.getZ(idx),
        ];
      }

      if (points.geometry.hasAttribute("position")) {
        const posAttr = points.geometry.getAttribute("position");
        md.coord = [posAttr.getX(idx), posAttr.getY(idx), posAttr.getZ(idx)];
        setCurrentHoveredPoint(
          new Vector3(posAttr.getX(idx), posAttr.getY(idx), posAttr.getZ(idx))
        );
      }

      // dynamically handle all other attributes
      Object.keys(points.geometry.attributes).forEach((attr) => {
        if (attr === "color" || attr === "intensity" || attr === "position")
          return;
        md[attr] = points.geometry.attributes[attr].getX(idx);
      });

      setHoverMetadata({
        assetName: name,
        renderModeDescriptor: shadingMode,
        attributes: md,
      });
    },
    [points, setHoverMetadata, shadingMode]
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
  }, [shadingMode]);

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

  if (!points) {
    return null;
  }

  return (
    <>
      {currentHoveredPoint && (
        <HoveredPointMarker position={currentHoveredPoint} />
      )}

      <primitive
        ref={pcdContainerRef}
        object={points}
        position={position}
        quaternion={quaternion}
        scale={scale}
        {...hoverProps}
      >
        {pointsMaterial}
        {children ?? null}
      </primitive>
    </>
  );
};
