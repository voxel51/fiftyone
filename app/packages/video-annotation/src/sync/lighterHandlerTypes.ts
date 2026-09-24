/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { useLighterEventHandler } from "@fiftyone/lighter";
import type { useDetectionMode } from "../../../core/src/components/Modal/Sidebar/Annotate/Edit/useDetectionMode";
import type { usePolylineMode } from "../../../core/src/components/Modal/Sidebar/Annotate/Edit/usePolylineMode";
import type { useSegmentationMode } from "../../../core/src/components/Modal/Sidebar/Annotate/Edit/useSegmentationMode";

/** Registers a handler for a Lighter event on the bridged scene's channel. */
export type RegisterLighterHandler = ReturnType<typeof useLighterEventHandler>;

/** The create modes the top hook resolves once and injects into sub-hooks. */
export type DetectionMode = ReturnType<typeof useDetectionMode>;
export type SegmentationMode = ReturnType<typeof useSegmentationMode>;
export type PolylineMode = ReturnType<typeof usePolylineMode>;
