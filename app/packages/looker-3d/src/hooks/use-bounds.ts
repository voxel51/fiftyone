import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Box3, Group } from "three";

const DEFAULT_STABLE_SAMPLES = 3;
const DEFAULT_EPSILON = 1e-4;
// 10 second hard timeout
const DEFAULT_HARD_TIMEOUT_MS = 10000;

type Options = {
  // If the number of primary assets is 0, we don't compute bounds
  numPrimaryAssets?: number;
  // Consecutive identical reads required before considering stable
  stableSamples?: number;
  // Equality tolerance for box comparison
  epsilon?: number;
  // Hard timeout after which to give up (ms)
  hardTimeoutMs?: number;
};

const boxesWithinEpsilon = (a: Box3, b: Box3, eps: number) =>
  Math.abs(a.min.x - b.min.x) <= eps &&
  Math.abs(a.min.y - b.min.y) <= eps &&
  Math.abs(a.min.z - b.min.z) <= eps &&
  Math.abs(a.max.x - b.max.x) <= eps &&
  Math.abs(a.max.y - b.max.y) <= eps &&
  Math.abs(a.max.z - b.max.z) <= eps;

const isFiniteBox = (b: Box3) =>
  Number.isFinite(b.min.x) &&
  Number.isFinite(b.min.y) &&
  Number.isFinite(b.min.z) &&
  Number.isFinite(b.max.x) &&
  Number.isFinite(b.max.y) &&
  Number.isFinite(b.max.z);

/**
 * Compute a stable world-space bounding box for a Group.
 *
 * Polls via rAF until either:
 * - N consecutive identical boxes (stability threshold)
 * - Hard timeout is reached
 *
 *
 * @param objectRef - Reference to the Three.js Group to measure
 * @param isReady - Whether to start computing (e.g., foScene loaded && assets ready)
 * @param opts - Configuration options
 */
export function useFo3dBounds(
  objectRef: React.RefObject<Group>,
  isReady: boolean = true,
  opts: Options = {}
) {
  const {
    stableSamples = DEFAULT_STABLE_SAMPLES,
    epsilon = DEFAULT_EPSILON,
    hardTimeoutMs = DEFAULT_HARD_TIMEOUT_MS,
    numPrimaryAssets = 1,
  } = opts;

  const skip = numPrimaryAssets === 0;

  const [boundingBox, setBoundingBox] = useState<Box3 | null>(null);
  const [isComputing, setIsComputing] = useState(false);

  const runToken = useRef(0); // increments to cancel in-flight loops

  const computeOnce = useCallback(() => {
    const obj = objectRef.current;
    if (!obj) return null;

    // ensure transforms are up to date before measuring
    obj.updateWorldMatrix(true, true);
    const box = new Box3().setFromObject(obj);
    return isFiniteBox(box) ? box : null;
  }, [objectRef]);

  const startLoop = useCallback(() => {
    const token = ++runToken.current;
    setIsComputing(true);

    const start = performance.now();
    let prev: Box3 | null = null;
    let stable = 0;
    let rafId = 0;

    const tick = () => {
      if (token !== runToken.current) return;

      const box = computeOnce();
      if (!box) {
        if (performance.now() - start > hardTimeoutMs) {
          if (token === runToken.current) {
            setBoundingBox(null);
            setIsComputing(false);
          }
          return;
        }
        rafId = requestAnimationFrame(tick);
        return;
      }

      if (prev && boxesWithinEpsilon(prev, box, epsilon)) {
        stable += 1;
      } else {
        stable = 1;
      }
      prev = box;

      if (
        stable >= stableSamples ||
        performance.now() - start > hardTimeoutMs
      ) {
        if (token === runToken.current) {
          setBoundingBox(box);
          setIsComputing(false);
        }
        return;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [computeOnce, hardTimeoutMs, epsilon, stableSamples]);

  const recomputeBounds = useCallback(() => {
    if (skip || !isReady) return;
    runToken.current++;
    startLoop();
  }, [startLoop, skip, isReady]);

  useLayoutEffect(() => {
    if (skip || !isReady) return;

    const cancel = startLoop();
    return () => {
      runToken.current++;
      cancel?.();
    };
  }, [startLoop, skip, isReady]);

  return { boundingBox, recomputeBounds, isComputing };
}
