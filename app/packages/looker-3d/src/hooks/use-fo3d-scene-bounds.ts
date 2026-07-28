import { useRef } from "react";
import type { Group } from "three";
import type { FoScene } from "../fo3d/render-types";
import { useFo3dBounds } from "./use-bounds";

type UseFo3dSceneBoundsArgs = {
  assetsGroupRef: React.RefObject<Group>;
  foScene: FoScene | null;
  isParsingFo3d: boolean;
  rootAssetCount: number;
  isThreeJsLoading: boolean;
};

/**
 * Computes scene bounds and encapsulates fo3d-specific bounds readiness checks.
 */
export const useFo3dSceneBounds = ({
  assetsGroupRef,
  foScene,
  isParsingFo3d,
  rootAssetCount,
  isThreeJsLoading,
}: UseFo3dSceneBoundsArgs) => {
  const isReadyToComputeBounds =
    Boolean(foScene) && !isParsingFo3d && !isThreeJsLoading;

  const {
    boundingBox: sceneBoundingBox,
    recomputeBounds,
    isComputing: isComputingSceneBoundingBox,
  } = useFo3dBounds(assetsGroupRef, isReadyToComputeBounds, {
    numPrimaryAssets: rootAssetCount,
  });

  const hasSeenBoundsComputingRef = useRef(false);
  if (!isReadyToComputeBounds) {
    hasSeenBoundsComputingRef.current = false;
  } else if (isComputingSceneBoundingBox) {
    hasSeenBoundsComputingRef.current = true;
  }

  const isBoundsResolved =
    sceneBoundingBox !== null ||
    rootAssetCount === 0 ||
    (isReadyToComputeBounds &&
      !isComputingSceneBoundingBox &&
      hasSeenBoundsComputingRef.current);

  return {
    sceneBoundingBox,
    recomputeBounds,
    isComputingSceneBoundingBox,
    isBoundsResolved,
  };
};
