/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

export function asImageRenderer() {
  return Object.assign(this, {
    initPlayer() {
      this.checkParentandMedia();
      this.eleDivImage = document.createElement("div");
      this.eleDivImage.className = "p51-contained-image";
      this.eleImage = document.createElement("img");
      this.eleImage.className = "p51-contained-image";
      this.eleImage.setAttribute("src", this.media.src);
      this.eleImage.setAttribute("type", this.media.type);
      this.eleImage.setAttribute("loading", "lazy");
      this.eleDivImage.appendChild(this.eleImage);
      this.parent.appendChild(this.eleDivImage);
      this.initPlayerControlHTML(this.parent, false);
      this.mediaElement = this.eleImage;
      this.mediaDiv = this.eleDivImage;
      this.initCanvas();
    },

    initPlayerControls() {
      const self = this;

      // Update size
      this.eleImage.addEventListener("load", function () {
        self.updateFromLoadingState();
        self.setupCanvasContext();
        self._isDataLoaded = true;
        self.updateFromLoadingState();
        self.dispatchEvent("load");
      });

      this.eleImage.addEventListener("error", function () {
        if (self.player._boolNotFound) {
          const tmpImage = document.createElement("img");
          tmpImage.setAttribute("loading", "lazy");
          tmpImage.className = "p51-contained-image";
          tmpImage.setAttribute("src", self.player._notFoundPosterURL);
          self.parent.appendChild(tmpImage);
        }
        self.eleImage.remove();
        self.dispatchEvent("error");
      });

      const hideControls = function () {
        if (self._boolShowVideoOptions) {
          return;
        }
        self._boolShowControls = false;
        self.updateFromDynamicState();
      };

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

    updateFromDynamicState() {
      if (!this._isRendered || !this._isSizePrepared) {
        return;
      }

      this.updateControlsDisplayState();
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
}
