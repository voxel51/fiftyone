import * as fos from "@fiftyone/state";
import { useAtom } from "jotai";
import { useCallback } from "react";

/**
 * Hook to get and set the modal viewport.
 *
 * @returns {
 *   viewport: { pan: [number, number]; scale: number } | null;
 *   setViewport: (viewport: { pan: [number, number]; scale: number } | null) => void;
 *   setPan: (pan: [number, number]) => void;
 *   setZoom: (scale: number) => void;
 *   pan: [number, number];
 *   scale: number;
 * }
 */
export const useViewport = () => {
  const [viewport, setViewport] = useAtom(fos.modalViewport) as [
    { scale: number; pan: [number, number] } | null,
    (update: unknown) => void
  ];

  const setPan = useCallback(
    (pan: [number, number]) => {
      setViewport((prev: { scale: number; pan: [number, number] } | null) =>
        prev ? { ...prev, pan } : { scale: 1, pan: pan }
      );
    },
    [setViewport]
  );

  const setZoom = useCallback(
    (scale: number) => {
      setViewport((prev: { scale: number; pan: [number, number] } | null) =>
        prev ? { ...prev, scale } : { scale, pan: [0, 0] }
      );
    },
    [setViewport]
  );

  return {
    viewport,
    setViewport,
    setPan,
    setZoom,
    pan: viewport?.pan ?? [0, 0],
    scale: viewport?.scale ?? 1,
  };
};
