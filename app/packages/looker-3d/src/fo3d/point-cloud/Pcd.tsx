import { getSampleSrc } from "@fiftyone/state";
import { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { useRecoilState } from "recoil";
import type { Quaternion } from "three";
import { Vector3 } from "three";
import PcdColormapModal, {
  PcdColorMapTunnel,
} from "../../components/PcdColormapModal";
import type { PcdAsset } from "../../hooks";
import { useFoLoader } from "../../hooks/use-fo-loaders";
import { DynamicPCDLoader } from "../../loaders/dynamic-pcd-loader";
import { currentHoveredPointAtom } from "../../state";
import { useFo3dContext } from "../context";
import { HoveredPointMarker } from "../components/HoveredPointMarker";
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

  const pointerMoveHandler = useMemo(
    () => (e: ThreeEvent<MouseEvent>) => {
      const idx = e.index;
      if (idx === undefined) return;

      const md: Record<string, any> = { index: idx };

      if (points.geometry.hasAttribute("rgb")) {
        const colorAttr = points.geometry.getAttribute("rgb");

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
        if (attr === "rgb" || attr === "position") return;
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
