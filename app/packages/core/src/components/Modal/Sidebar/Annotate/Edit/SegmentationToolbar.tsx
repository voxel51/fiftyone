/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Segmentation toolbar built on the generic FloatingToolbar.
 * Appears when the segmentation mode is active (layers icon in Actions bar).
 * Contains tool buttons for AI Segment, pen, brush, etc.
 */

import { FloatingToolbar, Tooltip } from "@fiftyone/components";
import React from "react";
import { useSegmentationMasks } from "./useSegmentationMasks";
import { useAISegment } from "./useAISegment";
import { usePolylineTool } from "./usePolylineTool";

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

const AISegmentIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
    <title>AI Segment</title>
    {/* Four-point star / sparkle icon */}
    <path d="M12 2L13.09 8.26L18 6L15.74 10.91L22 12L15.74 13.09L18 18L13.09 15.74L12 22L10.91 15.74L6 18L8.26 13.09L2 12L8.26 10.91L6 6L10.91 8.26L12 2Z" />
  </svg>
);

const SelectIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
    <title>Select</title>
    <path d="M7 2l12 11.2-5.8.5 3.3 7.3-2.2 1-3.2-7.4L7 18.5V2z" />
  </svg>
);

const VertexIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <title>Vertex / Pen Tool</title>
    {/* Pentagon shape representing polygon drawing */}
    <polygon points="12,3 21,10 18,20 6,20 3,10" />
    {/* Vertex dots */}
    <circle cx="12" cy="3" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="21" cy="10" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="18" cy="20" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="6" cy="20" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="3" cy="10" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
    <title>Exit AI Segment</title>
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
  </svg>
);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const SegmentationToolbar: React.FC = () => {
  const { active: segmentationActive } = useSegmentationMasks();
  const {
    active: aiSegmentActive,
    enter: enterAI,
    exit: exitAI,
  } = useAISegment();
  const {
    active: polylineActive,
    enter: enterPolyline,
    exit: exitPolyline,
  } = usePolylineTool();

  const activeTool = aiSegmentActive
    ? "ai-segment"
    : polylineActive
    ? "polyline"
    : "select";

  const exitCurrentTool = () => {
    if (aiSegmentActive) exitAI();
    if (polylineActive) exitPolyline();
  };

  return (
    <FloatingToolbar
      orientation="vertical"
      defaultPosition={{ x: 4, y: 45 }}
      visible={segmentationActive}
    >
      <FloatingToolbar.Group label="Tool">
        {activeTool !== "select" ? (
          <Tooltip placement="right-center" text="Exit current tool">
            <FloatingToolbar.Action onClick={exitCurrentTool}>
              <CloseIcon />
            </FloatingToolbar.Action>
          </Tooltip>
        ) : (
          <Tooltip placement="right-center" text="Select">
            <FloatingToolbar.Action active={activeTool === "select"}>
              <SelectIcon />
            </FloatingToolbar.Action>
          </Tooltip>
        )}
        <Tooltip placement="right-center" text="AI Segment (A)">
          <FloatingToolbar.Action
            active={activeTool === "ai-segment"}
            onClick={() => {
              if (aiSegmentActive) {
                exitAI();
              } else {
                exitCurrentTool();
                enterAI();
              }
            }}
          >
            <AISegmentIcon />
          </FloatingToolbar.Action>
        </Tooltip>
        <Tooltip placement="right-center" text="Vertex / Pen Tool (V)">
          <FloatingToolbar.Action
            active={activeTool === "polyline"}
            onClick={() => {
              if (polylineActive) {
                exitPolyline();
              } else {
                exitCurrentTool();
                enterPolyline();
              }
            }}
          >
            <VertexIcon />
          </FloatingToolbar.Action>
        </Tooltip>
      </FloatingToolbar.Group>
    </FloatingToolbar>
  );
};
