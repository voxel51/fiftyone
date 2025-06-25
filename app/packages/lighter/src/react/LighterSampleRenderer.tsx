/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { getSampleSrc, Sample } from "@fiftyone/state";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  BoundingBoxOptions,
  ClassificationOptions,
  overlayFactory,
} from "../index";
import { useLighterWithPixi } from "./useLighterWithPixi";

/**
 * Props for the LighterSampleRenderer component.
 */
export interface LighterSampleRendererProps {
  /** Width of the canvas */
  width?: number;
  /** Height of the canvas */
  height?: number;
  /** Custom CSS class name */
  className?: string;
  /** Sample to display */
  sample: Sample;
}

/**
 * Example of using the useLighter hook with optional custom renderer and resource loader.
 * This component demonstrates using the OverlayFactory to create overlays instead of direct instantiation.
 */
export const LighterSampleRenderer: React.FC<LighterSampleRendererProps> = ({
  width,
  height,
  className = "",
  sample,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasDimensions, setCanvasDimensions] = useState({
    width: width || 0,
    height: height || 0,
  });

  // Use the modified useLighter hook with optional dependencies
  const { isReady, overlayCount, addOverlay, clearOverlays } =
    useLighterWithPixi(canvasRef);

  // Get actual canvas dimensions from parent container
  useLayoutEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) return;

    const { width: actualWidth, height: actualHeight } =
      canvas.parentElement!.getBoundingClientRect();
    setCanvasDimensions({ width: actualWidth, height: actualHeight });
  }, [canvasRef]);

  useEffect(() => {
    if (isReady) {
      const mediaUrl = getSampleSrc(sample.urls[0].url!);
      addOverlay(
        overlayFactory.create("image", {
          src: mediaUrl,
          maintainAspectRatio: true,
        })
      );
    }
  }, [isReady, addOverlay, sample]);

  const addRandomBoundingBox = useCallback(() => {
    if (canvasDimensions.width === 0 || canvasDimensions.height === 0) return;

    const bbox = overlayFactory.create<BoundingBoxOptions>("bounding-box", {
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

  const addRandomClassification = useCallback(() => {
    if (canvasDimensions.width === 0 || canvasDimensions.height === 0) return;

    const classification = overlayFactory.create<ClassificationOptions>(
      "classification",
      {
        label: `class-${overlayCount + 1}`,
        confidence: Math.random(),
        position: {
          x: Math.random() * canvasDimensions.width,
          y: Math.random() * canvasDimensions.height,
        },
        style: {
          strokeStyle: `hsl(${Math.random() * 360}, 70%, 50%)`,
        },
        showConfidence: true,
      }
    );

    addOverlay(classification);
  }, [addOverlay, overlayCount, canvasDimensions]);

  return (
    <div
      className={`lighter-sample-renderer ${className}`}
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
          onClick={addRandomClassification}
          disabled={!isReady}
          style={{
            marginLeft: "8px",
            padding: "8px 16px",
            background: "#28a745",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: isReady ? "pointer" : "not-allowed",
            opacity: isReady ? 1 : 0.5,
          }}
        >
          Add Random Classification
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
