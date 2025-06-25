/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import React, { useRef } from "react";
import { useLighter, usePixiRenderer, usePixiResourceLoader } from "./index";
import { BoundingBoxOverlay } from "../index";

/**
 * Example component demonstrating how to use custom renderer and resource loader hooks
 * with the modified useLighter hook.
 */
export const CustomHooksExample: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Create custom renderer and resource loader using the new hooks
  const { renderer, isInitialized: rendererInitialized } =
    usePixiRenderer(canvasRef);
  const { resourceLoader, isInitialized: resourceLoaderInitialized } =
    usePixiResourceLoader();

  // Use the modified useLighter hook with custom dependencies
  const { isReady, overlayCount, addOverlay, clearOverlays } = useLighter(
    canvasRef,
    renderer || undefined,
    resourceLoader || undefined
  );

  const addBoundingBox = () => {
    if (!isReady) return;

    const bbox = new BoundingBoxOverlay({
      bounds: {
        x: 50,
        y: 50,
        width: 100,
        height: 80,
      },
      style: {
        strokeStyle: "#ff0000",
        fillStyle: "rgba(255, 0, 0, 0.3)",
        lineWidth: 2,
      },
      label: "Example BBox",
    });

    addOverlay(bbox);
  };

  return (
    <div style={{ padding: "20px" }}>
      <h3>Custom Hooks Example</h3>
      <div style={{ marginBottom: "10px" }}>
        <p>
          Renderer Status: {rendererInitialized ? "Ready" : "Initializing..."}
        </p>
        <p>
          Resource Loader Status:{" "}
          {resourceLoaderInitialized ? "Ready" : "Initializing..."}
        </p>
        <p>Lighter Status: {isReady ? "Ready" : "Initializing..."}</p>
        <p>Overlay Count: {overlayCount}</p>
      </div>

      <canvas
        ref={canvasRef}
        style={{
          border: "1px solid #ccc",
          width: "400px",
          height: "300px",
          display: "block",
          marginBottom: "10px",
        }}
      />

      <div>
        <button
          onClick={addBoundingBox}
          disabled={!isReady}
          style={{
            padding: "8px 16px",
            background: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: isReady ? "pointer" : "not-allowed",
            opacity: isReady ? 1 : 0.5,
            marginRight: "8px",
          }}
        >
          Add Bounding Box
        </button>
        <button
          onClick={clearOverlays}
          disabled={!isReady}
          style={{
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
      </div>
    </div>
  );
};
