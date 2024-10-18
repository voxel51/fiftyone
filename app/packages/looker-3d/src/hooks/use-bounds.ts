import { useLayoutEffect, useRef, useState } from "react";
import { Box3, type Group } from "three";

const BOUNDING_BOX_POLLING_INTERVAL = 50;
const UNCHANGED_COUNT_THRESHOLD = 6;

/**
 * Calculates the bounding box of the object with the given ref.
 *
 * @param objectRef - Ref to the object
 * @param predicate - Optional predicate to check before calculating the bounding box.
 * IMPORTANT: Make sure this predicate is memoized using useCallback
 * @returns Bounding box of the object
 */
export const useFo3dBounds = (
  objectRef: React.RefObject<Group>,
  predicate?: () => boolean
) => {
  const [sceneBoundingBox, setSceneBoundingBox] = useState<Box3>(null);

  const unchangedCount = useRef(0);
  const previousBox = useRef<Box3>(null);

  const timeOutIdRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (predicate && !predicate()) {
      return;
    }

    // flag to prevent state updates on unmounted components
    let isMounted = true;

    const boxesAreEqual = (box1: Box3, box2: Box3) => {
      return box1.min.equals(box2.min) && box1.max.equals(box2.max);
    };

    const getBoundingBox = () => {
      if (!isMounted) return;

      if (!objectRef.current) {
        timeOutIdRef.current = window.setTimeout(
          getBoundingBox,
          BOUNDING_BOX_POLLING_INTERVAL
        );
        return;
      }

      const box = new Box3().setFromObject(objectRef.current);

      if (Math.abs(box.max?.x) === Number.POSITIVE_INFINITY) {
        timeOutIdRef.current = window.setTimeout(
          getBoundingBox,
          BOUNDING_BOX_POLLING_INTERVAL
        );
        return;
      }

      if (previousBox.current && boxesAreEqual(box, previousBox.current)) {
        unchangedCount.current += 1;
      } else {
        unchangedCount.current = 1;
      }

      previousBox.current = box;

      if (unchangedCount.current >= UNCHANGED_COUNT_THRESHOLD) {
        setSceneBoundingBox(box);
      } else {
        timeOutIdRef.current = window.setTimeout(
          getBoundingBox,
          BOUNDING_BOX_POLLING_INTERVAL
        );
      }
    };

    // this is a hack, yet to find a better way than polling to know when the scene is done loading
    // callbacks in loaders are not reliable
    timeOutIdRef.current = window.setTimeout(
      getBoundingBox,
      BOUNDING_BOX_POLLING_INTERVAL
    );

    // cleanup function to prevent memory leaks
    return () => {
      isMounted = false;

      if (timeOutIdRef.current) {
        window.clearTimeout(timeOutIdRef.current);
      }
    };
  }, [objectRef, predicate]);

  return sceneBoundingBox;
};
