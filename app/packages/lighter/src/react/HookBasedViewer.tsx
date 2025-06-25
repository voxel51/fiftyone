/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import { BoundingBoxOverlay } from "../index";
import { useLighter } from "./useLighter";

/**
 * Props for the HookBasedViewer component.
 */
export interface HookBasedViewerProps {
  /** Width of the canvas */
  width?: number;
  /** Height of the canvas */
  height?: number;
  /** Custom CSS class name */
  className?: string;
}

/**
 * Example of using the useLighter hook.
 */
export const HookBasedViewer: React.FC<HookBasedViewerProps> = ({
  width,
  height,
  className = "",
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasDimensions, setCanvasDimensions] = useState({
    width: 0,
    height: 0,
  });

  const { isReady, overlayCount, addOverlay, clearOverlays } =
    useLighter(canvasRef);

  // Get actual canvas dimensions from parent container
  useLayoutEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) return;

    const { width: actualWidth, height: actualHeight } =
      canvas.parentElement!.getBoundingClientRect();
    setCanvasDimensions({ width: actualWidth, height: actualHeight });
  }, [canvasRef]);

  const addRandomBoundingBox = useCallback(() => {
    if (canvasDimensions.width === 0 || canvasDimensions.height === 0) return;

    const bbox = new BoundingBoxOverlay({
      bounds: {
        x: Math.random() * canvasDimensions.width,
        y: Math.random() * canvasDimensions.height,
        width: 30 + Math.random() * 70,
        height: 20 + Math.random() * 50,
      },
      style: {
        strokeStyle: `hsl(${Math.random() * 360}, 70%, 50%)`,
        fillStyle: `hsl(${Math.random() * 360}, 70%, 50%)`,
        lineWidth: 2,
      },
      label: `bbox-${overlayCount + 1}`,
    });

    addOverlay(bbox);
  }, [addOverlay, overlayCount, canvasDimensions]);

  return (
    <div
      className={`hook-based-viewer ${className}`}
      style={{
        width: "100%",
        height: "90%",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          border: "1px solid #ccc",
          display: "block",
        }}
      />

      <div style={{ marginTop: "8px" }}>
        <button
          onClick={addRandomBoundingBox}
          disabled={!isReady}
          style={{
            padding: "8px 16px",
            background: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: isReady ? "pointer" : "not-allowed",
            opacity: isReady ? 1 : 0.5,
          }}
        >
          Add Random BBox
        </button>
        <button
          onClick={clearOverlays}
          disabled={!isReady}
          style={{
            marginLeft: "8px",
            padding: "8px 16px",
            background: "#6c757d",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: isReady ? "pointer" : "not-allowed",
            opacity: isReady ? 1 : 0.5,
          }}
        >
          Clear All
        </button>
        <span style={{ marginLeft: "16px", fontFamily: "monospace" }}>
          Overlays: {overlayCount}
        </span>
      </div>
    </div>
  );
};
