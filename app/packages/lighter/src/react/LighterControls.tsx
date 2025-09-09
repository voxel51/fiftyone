/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import React, { useCallback } from "react";
import {
  BoundingBoxOptions,
  BoundingBoxOverlay,
} from "../overlay/BoundingBoxOverlay";
import {
  ClassificationOptions,
  ClassificationOverlay,
} from "../overlay/ClassificationOverlay";
import { useLighter } from "./useLighter";

/**
 * Example component that demonstrates using the useLighter hook from anywhere in the app.
 * This component can be placed anywhere in the component tree and will still have access
 * to the current lighter instance.
 */
export const LighterControls: React.FC = () => {
  const {
    scene,
    isReady,
    addOverlay,
    removeOverlay,
    undo,
    redo,
    canUndo,
    canRedo,
    overlayFactory,
  } = useLighter();

  const addRandomBoundingBox = useCallback(() => {
    if (!isReady || !overlayFactory) return;

    const relativeBounds = [0.1, 0.1, 0.1, 0.1];
    const id = `bbox-${Date.now()}`;

    const bbox = overlayFactory.create<BoundingBoxOptions, BoundingBoxOverlay>(
      "bounding-box",
      {
        label: {
          id,
          label: id,
          tags: [],
          bounding_box: relativeBounds,
        },
        relativeBounds: {
          x: relativeBounds[0],
          y: relativeBounds[1],
          width: relativeBounds[2],
          height: relativeBounds[3],
        },
        draggable: true,
        selectable: true,
      }
    );

    addOverlay(bbox);
  }, [addOverlay, isReady, overlayFactory]);

  const addRandomClassification = useCallback(() => {
    if (!isReady || !overlayFactory) return;

    const id = `classification-${Date.now()}`;

    const classification = overlayFactory.create<
      ClassificationOptions,
      ClassificationOverlay
    >("classification", {
      label: {
        id,
        label: id,
        tags: [],
      },
      confidence: Math.random(),
      position: { x: 0.5, y: 0.5 },
      showConfidence: true,
      selectable: true,
    });

    addOverlay(classification);
  }, [addOverlay, isReady, overlayFactory]);

  if (!isReady) {
    return (
      <div style={{ padding: "8px", color: "#666" }}>
        Lighter is not ready yet...
      </div>
    );
  }

  return (
    <div style={{ padding: "8px", borderTop: "1px solid #ccc" }}>
      <div style={{ marginBottom: "2px" }}>
        <button
          onClick={addRandomBoundingBox}
          style={{
            padding: "8px 16px",
            background: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            marginRight: "8px",
          }}
        >
          Add Random BBox
        </button>
        <button
          onClick={addRandomClassification}
          style={{
            padding: "8px 16px",
            background: "#28a745",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            marginRight: "8px",
          }}
        >
          Add Random Classification
        </button>

        <button
          onClick={undo}
          disabled={!canUndo()}
          style={{
            padding: "8px 16px",
            background: "#ffc107",
            color: "black",
            border: "none",
            borderRadius: "4px",
            cursor: canUndo() ? "pointer" : "not-allowed",
            opacity: canUndo() ? 1 : 0.5,
            marginRight: "8px",
          }}
        >
          Undo
        </button>
        <button
          onClick={redo}
          disabled={!canRedo()}
          style={{
            padding: "8px 16px",
            background: "#17a2b8",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: canRedo() ? "pointer" : "not-allowed",
            opacity: canRedo() ? 1 : 0.5,
            marginRight: "8px",
          }}
        >
          Redo
        </button>
      </div>
    </div>
  );
};
