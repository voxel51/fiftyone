import type { LabelMask, Overlay } from "../overlays/base";
import DetectionOverlay from "../overlays/detection";
import HeatmapOverlay from "../overlays/heatmap";
import SegmentationOverlay from "../overlays/segmentation";
import type { BaseState, Buffers } from "../state";

export const hasFrame = (buffers: Buffers, frameNumber: number) => {
  return buffers.some(
    ([start, end]) => start <= frameNumber && frameNumber <= end
  );
};

export const retrieveTransferables = <State extends BaseState>(
  overlays?: Overlay<State>[]
) => {
  // collect any mask targets array buffer that overlays might have
  // we'll transfer that to the worker instead of copying it
  const transferables: Transferable[] = [];

  for (const overlay of overlays ?? []) {
    let overlayData: LabelMask = null;

    if (
      overlay instanceof DetectionOverlay ||
      overlay instanceof SegmentationOverlay
    ) {
      overlayData = overlay.label.mask;
    } else if (overlay instanceof HeatmapOverlay) {
      overlayData = overlay.label.map;
    }

    const buffer = overlayData?.data?.buffer;
    const bitmap = overlayData?.bitmap;

    if (buffer) {
      // check for detached buffer (happens if user is switching colors too fast)
      // note: ArrayBuffer.prototype.detached is a new browser API
      if (typeof buffer.detached !== "undefined") {
        if (buffer.detached) {
          // most likely sample is already being processed, skip update
          return [];
        }

        transferables.push(buffer);
      } else if (buffer.byteLength) {
        // hope we don't run into this edge case (old browser)
        // sometimes detached buffers have bytelength > 0
        // if we run into this case, we'll just attempt to transfer the buffer
        // might get a DataCloneError if user is switching colors too fast
        transferables.push(buffer);
      }
    }

    if (bitmap?.width || bitmap?.height) {
      transferables.push(bitmap);
    }
  }

  return transferables;
};
