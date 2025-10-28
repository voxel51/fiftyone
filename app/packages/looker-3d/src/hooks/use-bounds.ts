import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Box3, type Group } from "three";

const BOUNDING_BOX_POLLING_INTERVAL = 50;
const UNCHANGED_COUNT_THRESHOLD = 6;
const MAX_BOUNDING_BOX_RETRIES = 20;
const PREDICATE_TIMEOUT = 5000;

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
 * @returns Object containing the bounding box, a function to recompute it, and a flag indicating if computation is in progress
 */
export const useFo3dBounds = (
  objectRef: React.RefObject<Group>,
  predicate?: () => boolean
) => {
  const [boundingBox, setBoundingBox] = useState<Box3 | null>(null);
  const [isComputing, setIsComputing] = useState(false);

  const unchangedCount = useRef(0);
  const previousBox = useRef<Box3>(null);
  const retryCount = useRef(0);
  const predicateStartTime = useRef<number | null>(null);

  const timeOutIdRef = useRef<number | null>(null);

  const computeBounds = useCallback(() => {
    setIsComputing(true);

    if (!objectRef.current) {
      setBoundingBox(null);
      setIsComputing(false);
      return;
    }

    const box = new Box3().setFromObject(objectRef.current);

    if (!isFiniteBox(box)) {
      setBoundingBox(null);
      setIsComputing(false);
      return;
    }

    setBoundingBox(box);
    setIsComputing(false);
  }, [objectRef]);

  const recomputeBounds = useCallback(() => {
    const waitForPredicateThenCompute = () => {
      if (predicate) {
        if (predicateStartTime.current === null) {
          predicateStartTime.current = Date.now();
        }

        if (Date.now() - predicateStartTime.current > PREDICATE_TIMEOUT) {
          predicateStartTime.current = null;
          computeBounds();
          return;
        }

        if (!predicate()) {
          timeOutIdRef.current = window.setTimeout(
            waitForPredicateThenCompute,
            BOUNDING_BOX_POLLING_INTERVAL
          );
          return;
        }

        predicateStartTime.current = null;
      }
      computeBounds();
    };

    waitForPredicateThenCompute();
  }, [predicate, computeBounds]);

  useLayoutEffect(() => {
    // Flag to prevent state updates on unmounted components
    let isMounted = true;

    const boxesAreEqual = (box1: Box3, box2: Box3) => {
      return box1.min.equals(box2.min) && box1.max.equals(box2.max);
    };

    const getBoundingBox = () => {
      if (!isMounted) return;

      setIsComputing(true);

      if (!objectRef.current) {
        retryCount.current += 1;
        if (retryCount.current >= MAX_BOUNDING_BOX_RETRIES) {
          retryCount.current = 0;
          unchangedCount.current = 0;
          previousBox.current = null;
          setBoundingBox(null);
          setIsComputing(false);
          return;
        }
        timeOutIdRef.current = window.setTimeout(
          waitForPredicateThenGetBounds,
          BOUNDING_BOX_POLLING_INTERVAL
        );
        return;
      }

      const box = new Box3().setFromObject(objectRef.current);

      if (!isFiniteBox(box)) {
        retryCount.current += 1;
        if (retryCount.current >= MAX_BOUNDING_BOX_RETRIES) {
          retryCount.current = 0;
          unchangedCount.current = 0;
          previousBox.current = null;
          setBoundingBox(null);
          setIsComputing(false);
          return;
        }
        timeOutIdRef.current = window.setTimeout(
          waitForPredicateThenGetBounds,
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
        setIsComputing(false);
      } else {
        timeOutIdRef.current = window.setTimeout(
          waitForPredicateThenGetBounds,
          BOUNDING_BOX_POLLING_INTERVAL
        );
      }
    };

    const waitForPredicateThenGetBounds = () => {
      if (predicate) {
        // Initialize start time on first call
        if (predicateStartTime.current === null) {
          predicateStartTime.current = Date.now();
        }

        if (Date.now() - predicateStartTime.current > PREDICATE_TIMEOUT) {
          predicateStartTime.current = null;
          getBoundingBox();
          return;
        }

        if (!predicate()) {
          timeOutIdRef.current = window.setTimeout(
            waitForPredicateThenGetBounds,
            BOUNDING_BOX_POLLING_INTERVAL
          );
          return;
        }

        predicateStartTime.current = null;
      }
      getBoundingBox();
    };

    // This is a hack, yet to find a better way than polling to know when the asset is done loading
    // Callbacks in loaders are not reliable
    // Start with predicate check
    waitForPredicateThenGetBounds();

    return () => {
      isMounted = false;
      retryCount.current = 0;
      predicateStartTime.current = null;
      setIsComputing(false);

      if (timeOutIdRef.current) {
        window.clearTimeout(timeOutIdRef.current);
      }
    };
  }, [objectRef, predicate]);

  return { boundingBox, recomputeBounds, isComputing };
};
