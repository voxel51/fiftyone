import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Box3, type Group } from "three";
import { DEFAULT_BOUNDING_BOX } from "../constants";

const BOUNDING_BOX_POLLING_INTERVAL = 50;
const UNCHANGED_COUNT_THRESHOLD = 6;
const MAX_BOUNDING_BOX_RETRIES = 5;

/**
 * Checks if a bounding box has all finite values in its min and max components.
 * Returns true if all components are finite, false otherwise.
 */
const isFiniteBox = (box: Box3): boolean => {
  return (
    Number.isFinite(box.min.x) &&
    Number.isFinite(box.min.y) &&
    Number.isFinite(box.min.z) &&
    Number.isFinite(box.max.x) &&
    Number.isFinite(box.max.y) &&
    Number.isFinite(box.max.z)
  );
};

/**
 * Calculates the bounding box of the object with the given ref.
 *
 * @param objectRef - Ref to the object
 * @param predicate - Optional predicate to check before calculating the bounding box.
 * IMPORTANT: Make sure this predicate is memoized using useCallback
 * @returns Object containing the bounding box and a function to recompute it
 */
export const useFo3dBounds = (
  objectRef: React.RefObject<Group>,
  predicate?: () => boolean
) => {
  const [boundingBox, setBoundingBox] = useState<Box3>(null);

  const unchangedCount = useRef(0);
  const previousBox = useRef<Box3>(null);
  const retryCount = useRef(0);

  const timeOutIdRef = useRef<number | null>(null);

  const recomputeBounds = useCallback(() => {
    if (!objectRef.current) {
      setBoundingBox(DEFAULT_BOUNDING_BOX);
      return;
    }

    const box = new Box3().setFromObject(objectRef.current);

    if (!isFiniteBox(box)) {
      setBoundingBox(DEFAULT_BOUNDING_BOX);
      return;
    }

    setBoundingBox(box);
  }, [objectRef]);

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
        retryCount.current += 1;
        if (retryCount.current >= MAX_BOUNDING_BOX_RETRIES) {
          retryCount.current = 0;
          setBoundingBox(DEFAULT_BOUNDING_BOX);
          return;
        }
        timeOutIdRef.current = window.setTimeout(
          getBoundingBox,
          BOUNDING_BOX_POLLING_INTERVAL
        );
        return;
      }

      const box = new Box3().setFromObject(objectRef.current);

      if (!isFiniteBox(box)) {
        retryCount.current += 1;
        if (retryCount.current >= MAX_BOUNDING_BOX_RETRIES) {
          retryCount.current = 0;
          setBoundingBox(DEFAULT_BOUNDING_BOX);
          return;
        }
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
        retryCount.current = 0;
        setBoundingBox(box);
      } else {
        timeOutIdRef.current = window.setTimeout(
          getBoundingBox,
          BOUNDING_BOX_POLLING_INTERVAL
        );
      }
    };

    // this is a hack, yet to find a better way than polling to know when the asset is done loading
    // callbacks in loaders are not reliable
    timeOutIdRef.current = window.setTimeout(
      getBoundingBox,
      BOUNDING_BOX_POLLING_INTERVAL
    );

    // cleanup function to prevent memory leaks
    return () => {
      isMounted = false;
      retryCount.current = 0;

      if (timeOutIdRef.current) {
        window.clearTimeout(timeOutIdRef.current);
      }
    };
  }, [objectRef, predicate]);

  return { boundingBox, recomputeBounds };
};
