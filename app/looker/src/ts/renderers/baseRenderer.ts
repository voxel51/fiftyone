function processFrame() {
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

function handleMouseEvent(e) {
  const eventType = e.type.toLowerCase();

  const [x, y] = this._computeEventCoordinates(e);
  const pointY = Math.floor((y / this.canvasHeight) * this.height);
  const pointX = Math.floor((x / this.canvasWidth) * this.width);

  const pausedOrImage = !this.eleVideo || this.eleVideo.paused;

  const notThumbnail = !this.player.options.thumbnail;

  const topObj = fm && fm[0] && fm[0].containsPoint(x, y) > 0 ? fm[0] : null;
  if (eventType === "click" && topObj && topObj.isSelectable(x, y)) {
    this.dispatchEvent("select", {
      data: topObj.getSelectData(x, y),
    });
  }
  let processFrame = topObj && this.setFocus(topObj, { x, y });

  if (pausedOrImage && notThumbnail && (mousemove || rotation)) {
    let result = topObj ? topObj.getPointInfo(x, y) : [];
    if (!Array.isArray(result)) {
      result = [result];
    }

    this.overlayOptions.showTooltip &&
      this.dispatchEvent("tooltipinfo", {
        data: {
          overlays: result,
          point: [pointX, pointY],
        },
      });
  }

  processFrame && this.processFrame();
}
