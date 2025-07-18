/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { loadOverlays } from "@fiftyone/looker/src/overlays";
import DetectionOverlay from "@fiftyone/looker/src/overlays/detection";
import * as fos from "@fiftyone/state";
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
import { useRecoilValue } from "recoil";
import {
  ImageOptions,
  ImageOverlay,
  LIGHTER_EVENTS,
  overlayFactory,
} from "../index";
import { LighterControls, useLighter, useLighterSetup } from "./index";
import { convertLegacyToLighterDetection } from "./looker-lighter-bridge";
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

  const options = useRecoilValue(
    fos.lookerOptions({ modal: true, withFilter: false })
  );

  // Setup the lighter instance
  useLighterSetup(canvasRef, options);

  // Get access to the lighter instance
  const { scene, isReady, addOverlay } = useLighter();

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

  // Spatial manipulation functions
  const shiftPosition = useCallback(
    (deltaX: number, deltaY: number) => {
      if (!scene) return;
      scene.dispatch({
        type: LIGHTER_EVENTS.SPATIAL_SHIFT,
        detail: { deltaX, deltaY },
      });
    },
    [scene]
  );

  const resizeDimensions = useCallback(
    (deltaWidth: number, deltaHeight: number) => {
      if (!scene) return;
      scene.dispatch({
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
          display: "block",
          flex: 1,
        }}
      />

      <div style={{ padding: "8px", borderTop: "1px solid #ccc" }}>
        <LighterControls />

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
