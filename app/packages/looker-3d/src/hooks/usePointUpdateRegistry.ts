import { useCallback } from "react";
import { Vector3 } from "three";

// Registry to store point update callback
let pointUpdateCallback:
  | ((segmentIndex: number, pointIndex: number, newPosition: Vector3) => void)
  | null = null;

export const usePointUpdateRegistry = () => {
  const registerPointUpdateCallback = useCallback(
    (
      callback: (
        segmentIndex: number,
        pointIndex: number,
        newPosition: Vector3
      ) => void
    ) => {
      pointUpdateCallback = callback;
    },
    []
  );

  const unregisterPointUpdateCallback = useCallback(() => {
    pointUpdateCallback = null;
  }, []);

  const updatePoint = useCallback(
    (segmentIndex: number, pointIndex: number, newPosition: Vector3) => {
      if (pointUpdateCallback) {
        pointUpdateCallback(segmentIndex, pointIndex, newPosition);
      }
    },
    []
  );

  return {
    registerPointUpdateCallback,
    unregisterPointUpdateCallback,
    updatePoint,
  };
};
