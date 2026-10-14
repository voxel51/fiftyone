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

  // an earlier box (say, from before a slice was added) is not resolved until
  // the scene's current assets have been measured: the render that makes the
  // scene measurable comes before the measuring starts
  const isBoundsResolved =
    rootAssetCount === 0 ||
    (isReadyToComputeBounds &&
      hasSeenBoundsComputingRef.current &&
      !isComputingSceneBoundingBox);

  return {
    sceneBoundingBox,
    recomputeBounds,
    isComputingSceneBoundingBox,
    isBoundsResolved,
  };
};
