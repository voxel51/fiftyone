import { useLayoutEffect, useState } from "react";
import { Box3, Group } from "three";

const BOUNDING_BOX_POLLING_INTERVAL = 50;

/**
 * Calaculates the bounding box of the object with given ref.
 *
 *
 * @param objectRef ref to the object
 * @param predicate optional predicate to check before calculating the bounding box.
 * IMPORTANT: Make sure this predicate is memoized using useCallback
 * @returns bounding box of the object
 */
export const useFo3dBounds = (
  objectRef: React.RefObject<Group>,
  predicate?: () => boolean
) => {
  const [sceneBoundingBox, setSceneBoundingBox] = useState<Box3>(null);

  useLayoutEffect(() => {
    if (predicate && !predicate()) {
      return;
    }

    const getBoundingBox = () => {
      if (!objectRef.current) {
        setTimeout(getBoundingBox, BOUNDING_BOX_POLLING_INTERVAL);
        return;
      }

      const box = new Box3().setFromObject(objectRef.current);
      if (Math.abs(box.max?.x) === Infinity) {
        setTimeout(getBoundingBox, BOUNDING_BOX_POLLING_INTERVAL);
      } else {
        setSceneBoundingBox(box);
      }
    };

    // this is a hack, yet to find a robust way to know when the scene is done loading
    // callbacks in loaders are not reliable
    // check every 50ms for scene's bounding box
    setTimeout(getBoundingBox, BOUNDING_BOX_POLLING_INTERVAL);
  }, [objectRef, predicate]);

  return sceneBoundingBox;
};
