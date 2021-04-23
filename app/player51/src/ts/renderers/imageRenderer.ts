/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import Renderer from "./baseRenderer";

Object.assign(this, {
  initPlayerControls() {
    const self = this;

    this.parent.addEventListener("mouseenter", function () {
      self.dispatchEvent("mouseenter");
      self.player._boolHovering = true;
      if (!self._isDataLoaded) {
        return;
      }
      if (!self.player.options.thumbnail) {
        self._boolShowControls = true;
        self.setTimeout("hideControls", hideControls, 2.5 * 1000);
      }
      self.updateFromDynamicState();
    });

    this.parent.addEventListener("mousemove", function (e) {
      if (!self.player.options.thumbnail) {
        if (self.checkMouseOnControls(e)) {
          self.clearTimeout("hideControls");
        } else {
          self._boolShowControls = true;
          self.setTimeout("hideControls", hideControls, 2.5 * 1000);
        }
      }
      self.updateFromDynamicState();
    });

    this.parent.addEventListener("mouseleave", function () {
      self.dispatchEvent("mouseleave");
      self.player._boolHovering = false;
      self._boolDisableShowControls = false;
      if (!self._isDataLoaded) {
        return;
      }
      if (!self.player.options.thumbnail) {
        hideControls();
        self.clearTimeout("hideControls");
      }
      self.updateFromDynamicState();
    });
  },

  updateFromLoadingState() {
    if (this._isRendered && this._isSizePrepared) {
      if (this._isDataLoaded) {
        this._isReadyProcessFrames = true;
      }
      // If we had to download the overlay data and it is ready
      if (this._overlayData !== null && this._overlayURL !== null) {
        this._overlayCanBePrepared = true;
      }
    }

    if (this._overlayCanBePrepared) {
      this.prepareOverlay();
    }

    if (this._isOverlayPrepared) {
      this.processFrame();
    }
  },
});
