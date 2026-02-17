import { getSampleSrc } from "@fiftyone/state";
import { useEffect, useMemo, useRef } from "react";
import type { Points, Quaternion } from "three";
import { Vector3 } from "three";
import { HoveredPointMarker } from "../../components/HoveredPointMarker";
import PcdColormapModal, {
  PcdColorMapTunnel,
} from "../../components/PcdColormapModal";
import type { PcdAsset } from "../../hooks";
import { useFoLoader } from "../../hooks/use-fo-loaders";
import { usePointCloudHoverFromRaycast } from "../../hooks/use-point-cloud-hover-from-raycast";
import { DynamicPCDLoader } from "../../loaders/dynamic-pcd-loader";
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
  const { fo3dRoot, setHoverMetadata } = useFo3dContext();

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

  const pcdContainerRef = useRef<Points>(null);

  const {
    pointsMaterial,
    shadingMode,
    colorMap,
    isColormapModalOpen,
    setIsColormapModalOpen,
    handleColormapSave,
  } = usePcdMaterial(
    name,
    points.geometry,
    defaultMaterial,
    pcdContainerRef,
    quaternion
  );

  const { currentHoveredPoint } = usePointCloudHoverFromRaycast({
    geometry: points.geometry,
    assetName: name,
    shadingMode,
    pointsRef: pcdContainerRef,
  });

  useEffect(() => {
    setHoverMetadata((prev) => ({
      ...prev,
      renderModeDescriptor: shadingMode,
    }));
  }, [shadingMode]);

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
      >
        {pointsMaterial}
        {children ?? null}
      </primitive>
      {isColormapModalOpen && (
        <PcdColorMapTunnel.In>
          <PcdColormapModal
            isOpen={isColormapModalOpen}
            onClose={() => setIsColormapModalOpen(false)}
            attribute={shadingMode}
            onSave={handleColormapSave}
            initialColorscale={{ list: colorMap }}
          />
        </PcdColorMapTunnel.In>
      )}
    </>
  );
};
