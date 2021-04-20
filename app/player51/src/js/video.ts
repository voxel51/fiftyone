export { Video };

function Video() {
  return Object.assign(this, {
    boolDrawFrameNumber: false,
    boolDrawTimestamp: false,

    loop(boolLoop = true) {
      this.renderer._boolLoop = boolLoop;
    },

    play() {
      this.renderer._boolPlaying = true;
      this.renderer.updateFromDynamicState();
    },

    pause() {
      this.renderer._boolPlaying = false;
      this.renderer.updateFromDynamicState();
    },

    autoplay(boolAutoplay = true) {
      if (this.renderer._boolSingleFrame && boolAutoplay) {
        boolAutoplay = false;
        this.renderer._boolPlaying = true;
      }
      this.renderer._boolAutoplay = boolAutoplay;
      this.renderer.updateFromDynamicState();
    },

    resetToFragment() {
      if (!this.renderer._hasMediaFragment || !this.renderer._isRendered) {
        return false;
      }
      this.renderer.eleVideo.currentTime = this.renderer._mfBeginT;
      this.renderer._lockToMF = true;

      this.renderer.updateFromDynamicState();
      return true;
    },
  });
}
