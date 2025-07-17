/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { loadOverlays } from "@fiftyone/looker/src/overlays";
import DetectionOverlay from "@fiftyone/looker/src/overlays/detection";
import {
  fieldSchema,
  getSampleSrc,
  Sample,
  State,
  useAssertedRecoilValue,
} from "@fiftyone/state";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  BoundingBoxOptions,
  BoundingBoxOverlay,
  ClassificationOptions,
  ClassificationOverlay,
  ImageOptions,
  ImageOverlay,
  LIGHTER_EVENTS,
  overlayFactory,
} from "../index";
import { convertLegacyToLighterDetection } from "./looker-lighter-bridge";
import { useLighterWithPixi } from "./useLighterWithPixi";
import { useSceneSelectionState } from "./useSceneSelectionState";

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

  const {
    scene,
    isReady,
    overlayCount,
    addOverlay,
    clearOverlays,
    undo,
    redo,
  } = useLighterWithPixi(canvasRef);

  // Use the new selection state hook
  const { selectedOverlayIds, selectedBounds } = useSceneSelectionState(scene);

  // Get actual canvas dimensions from parent container
  useLayoutEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) return;

    const { width: actualWidth, height: actualHeight } =
      canvas.parentElement!.getBoundingClientRect();
    setCanvasDimensions({ width: actualWidth, height: actualHeight });
  }, [canvasRef]);

  const schema = useAssertedRecoilValue(
    fieldSchema({ space: State.SPACE.SAMPLE })
  );

  useEffect(() => {
    if (isReady && scene) {
      const mediaUrl =
        sample.urls.length > 0 ? getSampleSrc(sample.urls[0].url!) : null;

      if (mediaUrl) {
        const mediaOverlay = overlayFactory.create<ImageOptions, ImageOverlay>(
          "image",
          {
            src: mediaUrl,
            maintainAspectRatio: true,
          }
        );
        addOverlay(mediaOverlay);

        // Set the image overlay as canonical media for coordinate transformations
        scene.setCanonicalMedia(mediaOverlay);
      }

      // Load and add overlays from the sample
      const overlays = loadOverlays(sample.sample, schema, false);

      for (const overlay of overlays) {
        if (overlay instanceof DetectionOverlay) {
          // Convert legacy overlay to lighter overlay with relative coordinates
          const lighterOverlay = convertLegacyToLighterDetection(overlay);
          addOverlay(lighterOverlay);
        }
      }
    }
  }, [isReady, addOverlay, sample, scene, schema]); // Add scene and schema to dependencies

  const addRandomBoundingBox = useCallback(() => {
    if (canvasDimensions.width === 0 || canvasDimensions.height === 0) return;

    const bbox = overlayFactory.create<BoundingBoxOptions, BoundingBoxOverlay>(
      "bounding-box",
      {
        bounds: {
          x: Math.random() * canvasDimensions.width,
          y: Math.random() * canvasDimensions.height,
          width: 30 + Math.random() * 70,
          height: 20 + Math.random() * 50,
        },
        label: {
          id: `bbox-${overlayCount + 1}`,
          label: `bbox-${overlayCount + 1}`,
          tags: [],
        },
        draggable: true,
        selectable: true,
      }
    );

    addOverlay(bbox);
  }, [addOverlay, overlayCount, canvasDimensions]);

  const addRandomClassification = useCallback(() => {
    if (canvasDimensions.width === 0 || canvasDimensions.height === 0) return;

    const classification = overlayFactory.create<
      ClassificationOptions,
      ClassificationOverlay
    >("classification", {
      label: {
        id: `class-${overlayCount + 1}`,
        label: `class-${overlayCount + 1}`,
        tags: [],
      },
      confidence: Math.random(),
      position: {
        x: Math.random() * canvasDimensions.width,
        y: Math.random() * canvasDimensions.height,
      },
      showConfidence: true,
      selectable: true,
    });

    addOverlay(classification);
  }, [addOverlay, overlayCount, canvasDimensions]);

  // Spatial manipulation functions
  const shiftPosition = useCallback(
    (deltaX: number, deltaY: number) => {
      if (!scene) return;
      scene.getEventBus().emit({
        type: LIGHTER_EVENTS.SPATIAL_SHIFT,
        detail: { deltaX, deltaY },
      });
    },
    [scene]
  );

  const resizeDimensions = useCallback(
    (deltaWidth: number, deltaHeight: number) => {
      if (!scene) return;
      scene.getEventBus().emit({
        type: LIGHTER_EVENTS.SPATIAL_RESIZE,
        detail: { deltaWidth, deltaHeight },
      });
    },
    [scene]
  );

  return (
    <div
      className={`lighter-sample-renderer ${className}`}
      style={{
        width: "100%",
        height: "80%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          border: "1px solid #ccc",
          display: "block",
          flex: 1,
        }}
      />

      <div style={{ padding: "8px", borderTop: "1px solid #ccc" }}>
        {/* Overlay creation controls */}
        <div style={{ marginBottom: "8px" }}>
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
              marginRight: "8px",
            }}
          >
            Add Random BBox
          </button>
          <button
            onClick={addRandomClassification}
            disabled={!isReady}
            style={{
              padding: "8px 16px",
              background: "#28a745",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: isReady ? "pointer" : "not-allowed",
              opacity: isReady ? 1 : 0.5,
              marginRight: "8px",
            }}
          >
            Add Random Classification
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
              marginRight: "16px",
            }}
          >
            Clear All
          </button>
          <button
            onClick={undo}
            style={{
              padding: "8px 16px",
              background: "#ffc107",
              color: "black",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              marginRight: "8px",
            }}
          >
            Undo
          </button>
          <button
            onClick={redo}
            style={{
              padding: "8px 16px",
              background: "#17a2b8",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              marginRight: "16px",
            }}
          >
            Redo
          </button>
          <span style={{ fontFamily: "monospace" }}>
            Overlays: {overlayCount} | Selected: {selectedOverlayIds.length}
          </span>
        </div>

        {/* Selection manipulation controls */}
        {selectedOverlayIds.length > 0 && (
          <div
            style={{
              padding: "8px",
              backgroundColor: "#000",
              borderRadius: "4px",
              border: "1px solid #dee2e6",
            }}
          >
            <h4
              style={{
                margin: "0 0 8px 0",
                fontSize: "14px",
                fontWeight: "bold",
              }}
            >
              Selected Overlay Controls ({selectedOverlayIds.length} selected)
            </h4>

            {/* Position controls */}
            <div style={{ marginBottom: "8px" }}>
              <label
                style={{
                  fontSize: "12px",
                  fontWeight: "bold",
                  marginRight: "8px",
                }}
              >
                Position:
              </label>
              <button onClick={() => shiftPosition(-1, 0)} style={buttonStyle}>
                ←
              </button>
              <button onClick={() => shiftPosition(1, 0)} style={buttonStyle}>
                →
              </button>
              <button onClick={() => shiftPosition(0, -1)} style={buttonStyle}>
                ↑
              </button>
              <button onClick={() => shiftPosition(0, 1)} style={buttonStyle}>
                ↓
              </button>
              <button onClick={() => shiftPosition(-10, 0)} style={buttonStyle}>
                ← 10
              </button>
              <button onClick={() => shiftPosition(10, 0)} style={buttonStyle}>
                → 10
              </button>
              <button onClick={() => shiftPosition(0, -10)} style={buttonStyle}>
                ↑ 10
              </button>
              <button onClick={() => shiftPosition(0, 10)} style={buttonStyle}>
                ↓ 10
              </button>
            </div>

            {/* Dimension controls (only for bounding boxes) */}
            {selectedBounds && (
              <div style={{ marginBottom: "8px" }}>
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: "bold",
                    marginRight: "8px",
                  }}
                >
                  Size:
                </label>
                <button
                  onClick={() => resizeDimensions(-1, 0)}
                  style={buttonStyle}
                >
                  W-
                </button>
                <button
                  onClick={() => resizeDimensions(1, 0)}
                  style={buttonStyle}
                >
                  W+
                </button>
                <button
                  onClick={() => resizeDimensions(0, -1)}
                  style={buttonStyle}
                >
                  H-
                </button>
                <button
                  onClick={() => resizeDimensions(0, 1)}
                  style={buttonStyle}
                >
                  H+
                </button>
                <button
                  onClick={() => resizeDimensions(-10, 0)}
                  style={buttonStyle}
                >
                  W-10
                </button>
                <button
                  onClick={() => resizeDimensions(10, 0)}
                  style={buttonStyle}
                >
                  W+10
                </button>
                <button
                  onClick={() => resizeDimensions(0, -10)}
                  style={buttonStyle}
                >
                  H-10
                </button>
                <button
                  onClick={() => resizeDimensions(0, 10)}
                  style={buttonStyle}
                >
                  H+10
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Styles
const buttonStyle: React.CSSProperties = {
  padding: "2px 6px",
  margin: "0 2px",
  fontSize: "11px",
  border: "1px solid #ccc",
  borderRadius: "2px",
  backgroundColor: "#000",
  cursor: "pointer",
};

const inputStyle: React.CSSProperties = {
  width: "60px",
  padding: "2px 4px",
  fontSize: "12px",
  border: "1px solid #ccc",
  borderRadius: "2px",
};
