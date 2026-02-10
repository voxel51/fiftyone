import { useEffect, useRef } from "react";
import { useRecoilState } from "recoil";
import type { BufferGeometry } from "three";
import { Points, Vector3 } from "three";
import { useFo3dContext } from "../fo3d/context";
import { currentHoveredPointAtom } from "../state";
import { useRaycastResult } from "./use-raycast-result";

interface UsePointCloudHoverFromRaycastProps {
  geometry: BufferGeometry;
  assetName: string;
  shadingMode: string;
  pointsRef: React.RefObject<Points | null>;
}

/**
 * Hook that extracts point cloud attributes from the centralized raycast result.
 */
export const usePointCloudHoverFromRaycast = ({
  geometry,
  assetName,
  shadingMode,
  pointsRef,
}: UsePointCloudHoverFromRaycastProps) => {
  const { pointCloudSettings, setHoverMetadata } = useFo3dContext();
  const [currentHoveredPoint, setCurrentHoveredPoint] = useRecoilState(
    currentHoveredPointAtom
  );
  const raycastResult = useRaycastResult();

  const lastProcessedTimestampRef = useRef<number>(0);
  const isActiveHoverSourceRef = useRef<boolean>(false);

  // This effect processes raycast result when it changes
  useEffect(() => {
    if (!pointCloudSettings.enableTooltip) {
      return;
    }

    // Skip if we've already processed this result
    if (raycastResult.timestamp === lastProcessedTimestampRef.current) {
      return;
    }
    lastProcessedTimestampRef.current = raycastResult.timestamp;

    const points = pointsRef.current;

    const isOurObject =
      points &&
      raycastResult.intersectedObjectUuid &&
      raycastResult.intersectedObjectUuid === points.uuid;

    if (!isOurObject) {
      // Note: HUD persists until explicitly dismissed by user
      if (isActiveHoverSourceRef.current) {
        setCurrentHoveredPoint(null);
        isActiveHoverSourceRef.current = false;
      }
      return;
    }

    const idx = raycastResult.pointIndex;
    if (idx === null || idx === undefined) {
      return;
    }

    // Mark ourselves as the active hover source
    isActiveHoverSourceRef.current = true;

    const md: Record<string, any> = { index: idx };

    if (geometry.hasAttribute("rgb")) {
      const colorAttr = geometry.getAttribute("rgb");
      md.rgb = [colorAttr.getX(idx), colorAttr.getY(idx), colorAttr.getZ(idx)];
    }

    if (raycastResult.worldPosition) {
      md.coord = raycastResult.worldPosition;

      setCurrentHoveredPoint(new Vector3(...raycastResult.worldPosition));
    }

    // Dynamically handle all other attributes
    Object.keys(geometry.attributes).forEach((attr) => {
      if (attr === "rgb" || attr === "position") return;
      md[attr] = geometry.attributes[attr].getX(idx);
    });

    setHoverMetadata({
      assetName,
      renderModeDescriptor: shadingMode,
      attributes: md,
    });
  }, [
    raycastResult,
    geometry,
    pointsRef,
    pointCloudSettings.enableTooltip,
    assetName,
    shadingMode,
  ]);

  // This effect cleans up marker on unmount
  useEffect(() => {
    return () => {
      if (isActiveHoverSourceRef.current) {
        setCurrentHoveredPoint(null);
        isActiveHoverSourceRef.current = false;
      }
    };
  }, [setCurrentHoveredPoint]);

  return {
    currentHoveredPoint,
  };
};
