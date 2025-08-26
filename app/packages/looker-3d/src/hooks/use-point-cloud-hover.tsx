import { ThreeEvent } from "@react-three/fiber";
import { useCallback, useEffect, useMemo } from "react";
import { useRecoilState } from "recoil";
import type { BufferGeometry, Quaternion } from "three";
import { Vector3 } from "three";
import { currentHoveredPointAtom } from "../state";
import { useFo3dContext } from "../fo3d/context";

interface UsePointCloudHoverProps {
  geometry: BufferGeometry;
  assetName: string;
  shadingMode: string;
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
}

export const usePointCloudHover = ({
  geometry,
  assetName,
  shadingMode,
  position,
  quaternion,
  scale,
}: UsePointCloudHoverProps) => {
  const { pointCloudSettings, setHoverMetadata } = useFo3dContext();
  const [currentHoveredPoint, setCurrentHoveredPoint] = useRecoilState(
    currentHoveredPointAtom
  );

  const pointerMoveHandler = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
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
        const localPosition = new Vector3(
          posAttr.getX(idx),
          posAttr.getY(idx),
          posAttr.getZ(idx)
        );
        md.coord = [localPosition.x, localPosition.y, localPosition.z];

        // transform the local position to world position using the transformation
        const worldPosition = localPosition.clone();

        // make sure it's TRS (scale, rotate, translate)
        worldPosition.multiply(scale);
        worldPosition.applyQuaternion(quaternion);
        worldPosition.add(position);

        setCurrentHoveredPoint(worldPosition);
      }

      // dynamically handle all other attributes
      Object.keys(geometry.attributes).forEach((attr) => {
        if (attr === "rgb" || attr === "position") return;
        md[attr] = geometry.attributes[attr].getX(idx);
      });

      setHoverMetadata({
        assetName,
        renderModeDescriptor: shadingMode,
        attributes: md,
      });
    },
    [
      geometry,
      setHoverMetadata,
      shadingMode,
      assetName,
      quaternion,
      position,
      scale,
    ]
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      setCurrentHoveredPoint(null);
    };
  }, [pointerMoveHandler]);

  // Update hover metadata when shading mode changes
  useEffect(() => {
    setHoverMetadata((prev) => ({
      ...prev,
      renderModeDescriptor: shadingMode,
    }));
  }, [shadingMode, setHoverMetadata]);

  return {
    currentHoveredPoint,
    hoverProps,
  };
};
