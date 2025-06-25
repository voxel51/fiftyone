/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import React from "react";
import {
  LighterViewer,
  AdvancedLighterViewer,
  HookBasedViewer,
  useLighter,
  type LighterViewerProps,
  type LighterViewerRef,
} from "../src/react";
import { BoundingBoxOverlay } from "../src";

/**
 * Example demonstrating how to use the LighterViewer component.
 */
export function BasicLighterViewerExample() {
  const handleOverlayLoaded = (overlayId: string) => {
    console.log("Overlay loaded:", overlayId);
  };

  const handleSceneReady = (scene: any) => {
    console.log("Scene ready:", scene);
  };

  const initialOverlays = [
    {
      type: "bounding-box" as const,
      data: {
        bounds: { x: 100, y: 100, width: 200, height: 150 },
        style: { strokeStyle: "#ff0000", lineWidth: 2 },
        label: "person",
        confidence: 0.95,
      },
    },
    {
      type: "classification" as const,
      data: {
        label: "car",
        confidence: 0.87,
        position: { x: 50, y: 50 },
        style: { strokeStyle: "#00ff00" },
        showConfidence: true,
      },
    },
  ];

  return (
    <LighterViewer
      width={800}
      height={600}
      initialOverlays={initialOverlays}
      onOverlayLoaded={handleOverlayLoaded}
      onSceneReady={handleSceneReady}
      enablePerformanceMonitoring={true}
      className="my-lighter-viewer"
    />
  );
}

/**
 * Example demonstrating how to use the AdvancedLighterViewer component.
 */
export function AdvancedLighterViewerExample() {
  return (
    <AdvancedLighterViewer
      width={1000}
      height={700}
      enablePerformanceMonitoring={true}
    />
  );
}

/**
 * Example demonstrating how to use the HookBasedViewer component.
 */
export function HookBasedViewerExample() {
  return (
    <HookBasedViewer width={600} height={400} className="my-hook-viewer" />
  );
}

/**
 * Example demonstrating how to use the useLighter hook directly.
 */
export function UseLighterHookExample() {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const {
    scene,
    isReady,
    overlayCount,
    addOverlay,
    removeOverlay,
    clearOverlays,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useLighter(canvasRef);

  const addRandomBoundingBox = React.useCallback(() => {
    if (!isReady) return;

    const bbox = new BoundingBoxOverlay({
      bounds: {
        x: Math.random() * 600,
        y: Math.random() * 400,
        width: 30 + Math.random() * 70,
        height: 20 + Math.random() * 50,
      },
      style: {
        strokeStyle: `hsl(${Math.random() * 360}, 70%, 50%)`,
        lineWidth: 2,
      },
      label: `bbox-${overlayCount + 1}`,
    });

    addOverlay(bbox);
  }, [addOverlay, overlayCount, isReady]);

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={600}
        height={400}
        style={{ border: "1px solid #ccc", display: "block" }}
      />

      <div style={{ marginTop: "8px" }}>
        <button onClick={addRandomBoundingBox} disabled={!isReady}>
          Add Random BBox
        </button>
        <button
          onClick={clearOverlays}
          disabled={!isReady}
          style={{ marginLeft: "8px" }}
        >
          Clear All
        </button>
        <button
          onClick={undo}
          disabled={!canUndo()}
          style={{ marginLeft: "8px" }}
        >
          Undo
        </button>
        <button
          onClick={redo}
          disabled={!canRedo()}
          style={{ marginLeft: "8px" }}
        >
          Redo
        </button>
        <span style={{ marginLeft: "16px" }}>Overlays: {overlayCount}</span>
      </div>
    </div>
  );
}

/**
 * Example demonstrating how to use the LighterViewer with a ref.
 */
export function LighterViewerWithRefExample() {
  const viewerRef = React.useRef<LighterViewerRef>(null);

  const addBoundingBox = React.useCallback(() => {
    if (!viewerRef.current) return;

    const bbox = new BoundingBoxOverlay({
      bounds: {
        x: Math.random() * 800,
        y: Math.random() * 600,
        width: 50 + Math.random() * 100,
        height: 30 + Math.random() * 80,
      },
      style: {
        strokeStyle: `hsl(${Math.random() * 360}, 70%, 50%)`,
        lineWidth: 2,
        fillStyle: `hsla(${Math.random() * 360}, 70%, 50%, 0.1)`,
      },
      label: `object-${Date.now()}`,
      confidence: Math.random(),
    });

    viewerRef.current.addOverlay(bbox);
  }, []);

  const clearAll = React.useCallback(() => {
    viewerRef.current?.clearOverlays();
  }, []);

  const undo = React.useCallback(() => {
    viewerRef.current?.undo();
  }, []);

  const redo = React.useCallback(() => {
    viewerRef.current?.redo();
  }, []);

  return (
    <div>
      <LighterViewer
        ref={viewerRef}
        width={800}
        height={600}
        enablePerformanceMonitoring={true}
      />

      <div style={{ marginTop: "8px" }}>
        <button onClick={addBoundingBox}>Add Bounding Box</button>
        <button onClick={clearAll} style={{ marginLeft: "8px" }}>
          Clear All
        </button>
        <button onClick={undo} style={{ marginLeft: "8px" }}>
          Undo
        </button>
        <button onClick={redo} style={{ marginLeft: "8px" }}>
          Redo
        </button>
      </div>
    </div>
  );
}
