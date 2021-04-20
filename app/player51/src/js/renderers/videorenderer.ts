import { parseMediaFragmentsUri } from "../mediafragments.js";

export { asVideoRenderer };

const secondsToHhmmss = function (number) {
  let str = "";
  if (number == 0) {
    str = "00";
  } else if (number < 10) {
    str += "0" + number;
  } else {
    str = `${number}`;
  }
  return str;
};

const renderTime = ({ decimals = 1, duration, numSeconds }) => {
  const renderHours = Math.floor(duration / 3600) > 0;
  let hours = 0;
  if (renderHours) {
    hours = Math.floor(numSeconds / 3600);
  }
  numSeconds = numSeconds % 3600;
  const minutes = Math.floor(numSeconds / 60);
  const seconds = numSeconds % 60;

  const mmss =
    secondsToHhmmss(minutes) + ":" + secondsToHhmmss(seconds.toFixed(decimals));

  if (renderHours) {
    return secondsToHhmmss(hours) + ":" + mmss;
  }
  return mmss;
};

function asVideoRenderer(options) {
  const state = {
    boolAutoplay: false,
    boolLoop: false,
    boolPlaying: false,
    boolManualSeek: false,
    boolSingleFrame: false,
    overlayCanBePrepared: false, // need to wait for video metadata
    isVideoMetadataLoaded: false,
    hasMediaFragment: false,
    mfBeginT: null, // Time
    mfEndT: null,
    mfBeginF: null, // Frame
    mfEndF: null,
    lockToMF: false,
    frameDuration: 1 / options.fps,
    frameRate: options.fps,
  };

  const handleKeyboardEvent = (e) => {
    Renderer.prototype._handleKeyboardEvent.call(this, e);
    if (e.keyCode === 32) {
      // space
      this._boolPlaying = !this._boolPlaying;
      this.updateFromDynamicState();
      return true;
    }
    // navigating frame-by-frame with arrow keys
    if (this.eleVideo.paused && (e.keyCode === 37 || e.keyCode === 39)) {
      if (e.keyCode === 37) {
        // left arrow
        this.eleVideo.currentTime = Math.max(
          0,
          this.computeFrameTime() - this.frameDuration
        );
      } else {
        // right arrow
        this.eleVideo.currentTime = Math.min(
          this.eleVideo.duration,
          this.computeFrameTime() + this.frameDuration
        );
      }
      this.updateStateFromTimeChange();
      return true;
    }
  };

  const renderer = Object.assign(this, {
    initPlayer() {
      this.checkParentandMedia();
      this.checkBorderBox();
      this.eleDivVideo = document.createElement("div");
      this.eleDivVideo.className = "p51-contained-video";
      this.eleVideo = document.createElement("video");
      this.eleVideo.className = "p51-contained-video";
      this.eleVideo.setAttribute("preload", "metadata");
      this.eleVideo.setAttribute("src", this.media.src);
      this.eleVideo.muted = true; // this works whereas .setAttribute does not

      this.eleDivVideo.appendChild(this.eleVideo);
      this.parent.appendChild(this.eleDivVideo);

      // Video controls
      this.initPlayerControlHTML(this.eleDivVideo);
      this.mediaElement = this.eleVideo;
      this.mediaDiv = this.eleDivVideo;
      this.initCanvas();
    },

    initPlayerControls() {
      this.checkPlayer();

      if (this.player._boolHasPoster) {
        this.eleVideo.setAttribute("poster", this.player._loadingPosterURL);
        if (this.player._boolForcedSize) {
          const sizeStyleString =
            "width:" +
            this.player._forcedWidth +
            "px; height:" +
            this.player._forcedHeight +
            "px;";
          this.eleVideo.setAttribute("style", sizeStyleString);
          this.eleDivVideo.setAttribute("style", sizeStyleString);
          this.parent.setAttribute("style", sizeStyleString);
        }
      }

      // after the DOM elements are created then we initialize other variables that
      // will be needed during playback
      const self = this;

      this.eleVideo.addEventListener("loadedmetadata", function () {
        self._isVideoMetadataLoaded = true;
        self.setupCanvasContext();
        self.updateFromLoadingState();
      });

      this.eleVideo.addEventListener("loadeddata", function () {
        self._isDataLoaded = true;

        // Handles the case that we have a poster frame to indicate the video is
        // loading and now we can show the video.  But when we are not autoplay.
        // We need to set the state to playing if we are set to autoplay
        //  (the player itself will handle the autoplaying)
        if (self._boolAutoplay) {
          self._boolPlaying = true;
        } else if (self._hasMediaFragment) {
          self.eleVideo.currentTime = self._mfBeginT;
          self._frameNumber = self._mfBeginF;
        } else {
          self.eleVideo.currentTime = 0;
          self._frameNumber = 1;
        }

        self.updateFromLoadingState();

        if (self._boolSingleFrame) {
          self.eleVideo.currentTime = self._mfBeginT;
          self._frameNumber = self._mfBeginF;
        }

        // so that we see overlay and time stamp now that we are ready
        if (!self._boolAutoplay) {
          self.processFrame();
        }

        self.dispatchEvent("load");
      });

      this.eleVideo.addEventListener("ended", function () {
        if (self._boolLoop) {
          self.eleVideo.play();
        } else {
          self._boolPlaying = false;
          self.updateFromDynamicState();
        }
      });

      this.eleVideo.addEventListener("pause", function () {
        self.checkForFragmentReset(self.computeFrameNumber());
        if (
          self._boolPlaying &&
          !self._lockToMF &&
          !self._boolManualSeek &&
          !self.eleVideo.ended
        ) {
          self.eleVideo.play();
        }
      });

      // Update the seek bar as the video plays
      this.eleVideo.addEventListener("timeupdate", function () {
        // Calculate the slider value
        const value =
          (self.seekBarMax / self.eleVideo.duration) *
          self.eleVideo.currentTime;
        // Update the slider value
        self.eleSeekBar.value = value;
        self.dispatchEvent("timeupdate", {
          data: {
            frame_number: self.computeFrameNumber(),
          },
        });
      });

      this.eleVideo.addEventListener(
        "play",
        function () {
          self.timerCallback();
        },
        false
      );

      this.eleVideo.addEventListener("seeked", function () {
        self.updateStateFromTimeChange();
      });

      this.eleVideo.addEventListener("error", function () {
        if (self.player._boolNotFound) {
          self.eleVideo.setAttribute("poster", self.player._notFoundPosterURL);
        } else {
          self.eleVideo.remove();
        }
        self.dispatchEvent("error");
      });

      // Event listener for the play/pause button
      this.elePlayPauseButton.addEventListener("click", function (e) {
        e.stopPropagation();
        self._boolPlaying = !self._boolPlaying;
        self.updateFromDynamicState();
      });

      // Event listener for the seek bar
      this.eleSeekBar.addEventListener("change", function () {
        // Calculate the new time
        const time =
          self.eleVideo.duration *
          (self.eleSeekBar.valueAsNumber / self.seekBarMax);
        // Update the video time
        self.eleVideo.currentTime = self.clampTimeToFrameStart(time);
        // Unlock the fragment so the user can browse the whole video
        self._lockToMF = false;
        self._boolSingleFrame = false;
        self.updateStateFromTimeChange();
      });

      // Pause the video when the seek handle is being dragged
      this.eleSeekBar.addEventListener("mousedown", function () {
        if (!self.player.options.thumbnail) {
          self._boolManualSeek = true;
          // Unlock the fragment so the user can browse the whole video
          self._lockToMF = false;
          // We need to manually control the video-play state
          // And turn it back on as needed.
          self.eleVideo.pause();
        }
      });

      // Play the video when the seek handle is dropped
      this.eleSeekBar.addEventListener("mouseup", function (e) {
        self._boolManualSeek = false;
        if (self._boolPlaying && self.eleVideo.paused) {
          // Calculate the new time
          const seekRect = self.eleSeekBar.getBoundingClientRect();
          const time =
            self.eleVideo.duration *
            ((e.clientX - seekRect.left) / seekRect.width);
          // Update the video time
          self.eleVideo.currentTime = self.clampTimeToFrameStart(time);
          self.eleSeekBar.value =
            (time / self.eleVideo.duration) * self.seekBarMax;
          self.eleVideo.play();
        }
      });

      const hideControls = function () {
        if (self._boolShowVideoOptions) {
          return;
        }
        self._boolShowControls = false;
        self.updateFromDynamicState();
      };

      this.parent.addEventListener("mouseenter", function () {
        // Two different behaviors.
        // 1.
        // 1.  Regular Mode: show controls.
        // 2.  Thumbnail Mode: play video
        // 3.  Single Frame Mode: annotate
        self.player._boolHovering = true;
        if (!self._isDataLoaded) {
          return;
        }

        const eventArgs = { cancelable: true, data: { player: self.player } };
        self.dispatchEvent("mouseenter", eventArgs);
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
        self.player._boolHovering = false;
        self._boolDisableShowControls = false;
        if (!self._isDataLoaded) {
          return;
        }

        const eventArgs = { cancelable: true, data: { player: self.player } };
        if (!self.dispatchEvent("mouseleave", eventArgs)) {
          return;
        } else if (self.player.options.thumbnail) {
          self._boolPlaying = false;
          // clear things we do not want to render any more
          self.clearCanvas();
        } else {
          hideControls();
          self.clearTimeout("hideControls");
        }
        self.updateFromDynamicState();
      });
    },

    determineMediaDimensions() {
      this.mediaHeight = this.mediaElement.videoHeight;
      this.mediaWidth = this.mediaElement.videoWidth;
    },
  });

  renderer.setMediaFragment();
  return renderer;
}

VideoRenderer.prototype.updateFromDynamicState = function () {
  if (!this._isRendered || !this._isSizePrepared) {
    return;
  }
  if (this.options.fps && this.frameRate !== this.options.fps) {
    this.frameRate = this.options.fps;
    this.frameDuration = 1 / this.frameRate;
  }
  if (this._boolAutoplay) {
    this._boolAutoplay = false;
    this._boolPlaying = true;
  }
  if (this._boolPlaying) {
    if (
      this.eleVideo.paused &&
      !this._boolSingleFrame &&
      !this._boolManualSeek &&
      this._isOverlayPrepared
    ) {
      this.eleVideo.play();
    }
  } else {
    if (!this.eleVideo.paused && !this._boolSingleFrame) {
      this.eleVideo.pause();
      this.eleVideo.currentTime = this.clampTimeToFrameStart();
      this._updateFrame();
    }
  }
  this.updatePlayButton(this._boolPlaying);
  this.updateControlsDisplayState();
  this.processFrame();
};

/**
 * This function is a controller
 * The loading state of the player has changed and various settings have to be
 * toggled.
 *
 * @member updateFromLoadingState
 */
VideoRenderer.prototype.updateFromLoadingState = function () {
  if (this._isRendered && this._isSizePrepared) {
    if (this._isDataLoaded) {
      this._isReadyProcessFrames = true;
    }
    // prepare overlay once video and labels are loaded
    if (this._overlayData !== null && this._isVideoMetadataLoaded) {
      this._overlayCanBePrepared = true;
    }
  }

  if (this._overlayCanBePrepared) {
    this.prepareOverlay();
  }

  if (this._isOverlayPrepared) {
    if (
      (!isFinite(this.frameRate) || !isFinite(this.frameDuration)) &&
      isFinite(this.eleVideo.duration)
    ) {
      // FPS wasn't provided, so guess it from the labels. If we don't have
      // labels either, we can't determine anything, so fall back to FPS = 30.
      const numFrames =
        Object.keys(this.frameOverlay).length || this.eleVideo.duration * 30;
      this.frameRate = numFrames / this.eleVideo.duration;
      this.frameDuration = 1 / this.frameRate;
    }
  }
};

VideoRenderer.prototype._updateFrame = function () {
  let cfn = this.computeFrameNumber();
  // check if we have a media fragment and should be looping
  // if so, reset the playing location appropriately
  cfn = this.checkForFragmentReset(cfn);
  if (cfn !== this._frameNumber && !this.eleVideo.seeking) {
    this._frameNumber = cfn;
    this.processFrame();
  }
};

/**
 * Draws custom case objects onto a frame.
 *
 * @member customDraw
 * @param {context} context
 */
VideoRenderer.prototype.customDraw = function (context) {
  // @todo double-buffering
  // @todo give a css class to the frame number so its positioning and format
  // can be controlled easily from the css
  if (this.player.boolDrawFrameNumber) {
    context.fillText(this._frameNumber || 0, 15, 30, 70);
  }

  let hhmmss;

  if (this.overlayOptions.showFrameCount) {
    const frame = this.currentFrameStamp();
    const total = this.totalFrameStamp();
    this.updateTimeStamp(`${frame} / ${total}`);
  } else {
    hhmmss = this.currentTimestamp();
    const duration = this.durationStamp();
    this.updateTimeStamp(`${hhmmss} / ${duration}`);
  }

  if (this.player.boolDrawTimestamp) {
    // @todo better handling of the context paintbrush styles
    // working on a new way of forcing certain font sizes
    let fontheight = 24;
    const fhInWindow = fontheight / this.canvasMultiplier;
    if (fhInWindow < 12) {
      fontheight = 8 * this.canvasMultiplier;
    }
    fontheight = this.checkFontHeight(fontheight);
    context.font = `${fontheight}px Arial, sans-serif`;
    if (hhmmss === undefined) {
      hmmss = this.currentTimestamp();
    }
    const tw = context.measureText(hhmmss).width;
    const pad = 4;
    const pad2 = 2; // pad divided by 2
    const w = tw + pad + pad;
    const h = fontheight + pad + pad;
    const x = 10;
    const y = this.canvasHeight - 10 - pad - pad - fontheight;

    context.fillStyle = this.metadataOverlayBGColor;
    context.fillRect(x, y, w, h);

    context.fillStyle = this.colorGenerator.white;
    context.fillText(hhmmss, x + pad, y + pad + fontheight - pad2, tw + 8);
  }
};

/**
 * This is called periodically when the video is playing.  It checks if the
 * video playing has encountered a new frame and, if so, draws the overlays for
 * that frame.
 *
 * @member timerCallback
 */
VideoRenderer.prototype.timerCallback = function () {
  if (this.eleVideo.paused || this.eleVideo.ended) {
    this._updateFrame();
    return;
  }
  this.updateStateFromTimeChange();
  // if we are manually seeking right now, then do not set the manual callback
  if (!this._boolManualSeek) {
    requestAnimationFrame(this.timerCallback.bind(this));
  } else {
    /* eslint-disable-next-line no-console */
    console.log("NOT SETTING TIME CALLBACK");
  }
};

/**
 * Sets media fragment variables.
 *
 * @member setMediaFragment
 */
VideoRenderer.prototype.setMediaFragment = function () {
  // when we have a media fragment passed in, by
  // default, we force the player to stay within that fragment.  If the video is
  // looping, for example, then it will always go to the beginning of the
  // fragment.  However, as soon as the user scrubs the video, we turn off the
  // importance of the fragment so that the user can watch the whole video.
  const mfParse = parseMediaFragmentsUri(this.media.src);
  if (typeof mfParse.hash.t !== "undefined") {
    this._mfBeginT = mfParse.hash.t[0].startNormalized;
    this._mfEndT = mfParse.hash.t[0].endNormalized;
    this._mfBeginF = this.computeFrameNumber(this._mfBeginT);
    this._mfEndF = this.computeFrameNumber(this._mfEndT);
    this._hasMediaFragment = true;
    this._lockToMF = true;
    if (this._mfBeginF === this._mfEndF) {
      this._boolSingleFrame = true;
    }
  }
};

VideoRenderer.prototype.checkForFragmentReset = function (fn) {
  if (!this._hasMediaFragment || !this._boolPlaying || !this._lockToMF) {
    return fn;
  }

  if (fn >= this._mfEndF || this.eleVideo.ended) {
    if (this._boolLoop) {
      this.eleVideo.currentTime = this._mfBeginT;
      fn = this._mfBeginF;
    } else {
      this._boolPlaying = false;
    }
  }

  return fn;
};

VideoRenderer.prototype.computeFrameNumber = function (time) {
  if (typeof time === "undefined") {
    time = this.eleVideo.currentTime;
  }
  // account for exact end of video
  if (this.eleVideo && time === this.eleVideo.duration) {
    time -= this.frameDuration / 2;
  }
  const frameNumber = time * this.frameRate + this.frameZeroOffset;
  return Math.floor(frameNumber);
};

VideoRenderer.prototype.computeFrameTime = function (frameNumber) {
  if (typeof frameNumber === "undefined") {
    frameNumber = this.computeFrameNumber();
  }
  frameNumber -= this.frameZeroOffset;
  // offset by 1/100 of a frame to avoid browser issues where being *exactly*
  // on a frame boundary sometimes renders the previous frame
  return (frameNumber + 0.01) * this.frameDuration;
};

VideoRenderer.prototype.clampTimeToFrameStart = function (time) {
  if (typeof time === "undefined") {
    time = this.eleVideo.currentTime;
  }
  if (!isFinite(this.frameRate)) {
    return time;
  }
  return this.computeFrameTime(this.computeFrameNumber(time));
};

VideoRenderer.prototype.currentFrameStamp = function () {
  return this._renderFrameCount(this.computeFrameNumber());
};

VideoRenderer.prototype.totalFrameStamp = function () {
  return this._renderFrameCount(this.getTotalFrameCount());
};

VideoRenderer.prototype.getTotalFrameCount = function () {
  if (this.totalFrameCount === undefined) {
    this.totalFrameCount = this.computeFrameNumber(this.eleVideo.duration);
  }
  return this.totalFrameCount;
};

VideoRenderer.prototype._renderFrameCount = function (numFrames) {
  if (this._totalFramesLen === undefined) {
    this._totalFramesLen = this.getTotalFrameCount().toString().length;
  }
  let frameStr = numFrames.toString();
  while (frameStr.length < this._totalFramesLen) {
    frameStr = "0" + frameStr;
  }
  return frameStr;
};

VideoRenderer.prototype.durationStamp = function () {
  return renderTime({
    numSeconds: this.eleVideo.duration,
    duration: this.eleVideo.duration,
  });
};

VideoRenderer.prototype.currentTimestamp = function () {
  return this._renderTime({
    numSeconds: this.eleVideo.currentTime,
    duration: this.eleVideo.duration,
  });
};
