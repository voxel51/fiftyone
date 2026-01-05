/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

// Overlay status constants
export const OVERLAY_STATUS_PENDING = "pending" as const;
export const OVERLAY_STATUS_DECODED = "decoded" as const;
export const OVERLAY_STATUS_PAINTING = "painting" as const;
export const OVERLAY_STATUS_PAINTED = "painted" as const;
export const OVERLAY_STATUS_ERROR = "error" as const;

export const OVERLAY_STATUSES = [
  OVERLAY_STATUS_PENDING,
  OVERLAY_STATUS_DECODED,
  OVERLAY_STATUS_PAINTING,
  OVERLAY_STATUS_PAINTED,
  OVERLAY_STATUS_ERROR,
] as const;

export type OverlayStatus = typeof OVERLAY_STATUSES[number];

/**
 * Manages the rendering status of overlays in a scene.
 */
export class RenderingStateManager {
  private overlayStates = new Map<string, OverlayStatus>();

  setStatus(overlayId: string, status: OverlayStatus): void {
    this.overlayStates.set(overlayId, status);
  }

  getStatus(overlayId: string): OverlayStatus {
    return this.overlayStates.get(overlayId) || OVERLAY_STATUS_PENDING;
  }

  clear(overlayId: string): void {
    this.overlayStates.delete(overlayId);
  }

  clearAll(): void {
    this.overlayStates.clear();
  }
}
