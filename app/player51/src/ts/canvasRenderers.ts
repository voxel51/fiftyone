/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

class CanvasRenderer {
  constructor() {}

  render(state) {
    if (!this._isReadyProcessFrames) {
      return;
    }
    clearCanvas(this.eleCanvas, this.canvasWidth, this.canvasHeight);
    const context = this.setupCanvasContext();
    this.customDraw(context);
    if (this._isOverlayPrepared) {
      if (this._frameNumber in this._overlays) {
        // Hover Focus setting

        let overlays = this._getOrderedOverlays(this._focusPos);
        if (this.overlayOptions.action === "hover") {
          this.setFocus(overlays[0]);
        }

        const len = overlays.length;
        // draw items without focus first, if settings allow
        if (this._renderRest()) {
          for (let i = len - 1; i > 0; i--) {
            overlays[i].draw(context, this.canvasWidth, this.canvasHeight);
          }
        }
        overlays[0] &&
          overlays[0].draw(context, this.canvasWidth, this.canvasHeight);
      }
    }
  }
}
