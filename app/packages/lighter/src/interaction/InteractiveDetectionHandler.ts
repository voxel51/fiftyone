/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { editing } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/state";

import { AnnotationLabel } from "@fiftyone/state";
import { objectId } from "@fiftyone/utilities";
import { atom, getDefaultStore } from "jotai";
import { BoundingBoxOverlay } from "../overlay/BoundingBoxOverlay";
import { OverlayFactory } from "../overlay/OverlayFactory";
import { useLighter } from "../react";
import type { Point } from "../types";
import type { InteractionHandler } from "./InteractionManager";

const INTERACTIVE_DETECTION_HANDLER_ID = "interactive-detection-handler";

const MIN_PIXELS = 2;

/**
 * Interactive detection handler for creating bounding box annotations.
 */
export class InteractiveDetectionHandler implements InteractionHandler {
  readonly id = INTERACTIVE_DETECTION_HANDLER_ID;
  readonly cursor = "crosshair";

  private isDragging = false;
  private startPoint?: Point;
  private currentBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  private tempOverlay?: BoundingBoxOverlay;

  constructor(
    private sampleId: string,
    private maybeField: string,
    private addOverlay: ReturnType<typeof useLighter>["addOverlay"],
    private removeOverlay: ReturnType<typeof useLighter>["removeOverlay"],
    private overlayFactory: OverlayFactory,
    private onInteractionEnd: (tempOverlay: BoundingBoxOverlay) => void
  ) {}

  containsPoint(): boolean {
    return true;
  }

  onPointerDown(point: Point, event: PointerEvent): boolean {
    this.startPoint = point;
    this.isDragging = true;
    this.currentBounds = {
      x: point.x,
      y: point.y,
      width: 0,
      height: 0,
    };

    // Create temporary overlay for live preview
    this.createTempOverlay(event);

    return true;
  }

  onDrag(point: Point, event: PointerEvent): boolean {
    if (!this.isDragging || !this.startPoint) return false;

    // Calculate bounds from start point to current point
    const x = Math.min(this.startPoint.x, point.x);
    const y = Math.min(this.startPoint.y, point.y);
    const width = Math.abs(point.x - this.startPoint.x);
    const height = Math.abs(point.y - this.startPoint.y);

    this.currentBounds = { x, y, width, height };

    this.updateTempOverlayBounds(event);

    return true;
  }

  onPointerUp(_point: Point, _event: PointerEvent): boolean {
    if (!this.isDragging || !this.startPoint || !this.tempOverlay) {
      this.cleanupTempOverlay();
      this.isDragging = false;
      return false;
    }

    const tempBounds = this.tempOverlay.getAbsoluteBounds();

    // Only create detection if we have a meaningful size
    const minSize = MIN_PIXELS;
    if (
      !this.currentBounds ||
      tempBounds.width < minSize ||
      tempBounds.height < minSize
    ) {
      this.isDragging = false;
      this.cleanupTempOverlay();
      return true;
    }

    // Remove temporary overlay first

    // Show the interactive input modal for label name and field selection
    const id = objectId();
    getDefaultStore().set(
      editing,
      atom<AnnotationLabel>({
        id,
        data: {
          id,
          bounding_box: [
            this.currentBounds.x,
            this.currentBounds.y,
            this.currentBounds.width,
            this.currentBounds.height / 2,
          ],
          tags: [],
        },
        type: "Detection",
      })
    );

    return true;
  }

  /**
   * Creates the temporary overlay for live preview during drag.
   */
  private createTempOverlay(event: PointerEvent): void {
    if (!this.currentBounds) return;

    const canvas = event.target as HTMLCanvasElement;
    if (!canvas) return;

    const canvasRect = canvas.getBoundingClientRect();

    // Convert absolute coordinates to relative coordinates [0,1]
    const relativeX = this.currentBounds.x / canvasRect.width;
    const relativeY = this.currentBounds.y / canvasRect.height;
    const relativeWidth = this.currentBounds.width / canvasRect.width;
    const relativeHeight = this.currentBounds.height / canvasRect.height;

    // Create temporary overlay for live preview
    this.tempOverlay = this.overlayFactory.create("bounding-box", {
      field: this.maybeField,
      sampleId: this.sampleId,
      label: {
        id: `temp-detection-${Math.random().toString(36).substring(2, 9)}`,
        tags: [],
        bounding_box: [relativeX, relativeY, relativeWidth, relativeHeight],
      },
      relativeBounds: {
        x: relativeX,
        y: relativeY,
        width: relativeWidth,
        height: relativeHeight,
      },
      draggable: false,
      selectable: false,
    });

    // Add temporary overlay without undo tracking
    this.addOverlay(this.tempOverlay, false);
  }

  /**
   * Updates the bounds of the temporary overlay for live preview during drag.
   */
  private updateTempOverlayBounds(_event: PointerEvent): void {
    if (!this.tempOverlay || !this.currentBounds) return;

    console.log("Update temp overlay bounds", this.currentBounds);
    this.tempOverlay.setBounds({
      x: this.currentBounds.x,
      y: this.currentBounds.y,
      width: this.currentBounds.width,
      height: this.currentBounds.height,
    });
  }

  /**
   * Cleans up the temporary overlay.
   */
  private cleanupTempOverlay(): void {
    if (this.tempOverlay) {
      this.removeOverlay(this.tempOverlay.id);
      this.tempOverlay = undefined;
    }
  }

  cleanup(): void {
    this.cleanupTempOverlay();
  }
}
