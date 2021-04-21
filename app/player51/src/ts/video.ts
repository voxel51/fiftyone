/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

export function Video() {
  return Object.assign(this, {
    boolDrawFrameNumber: false,
    boolDrawTimestamp: false,

    loop(boolLoop: boolean = true): void {
      this.renderer._boolLoop = boolLoop;
    },

    play(): void {
      this.renderer._boolPlaying = true;
      this.renderer.updateFromDynamicState();
    },

    pause(): void {
      this.renderer._boolPlaying = false;
      this.renderer.updateFromDynamicState();
    },

    autoplay(boolAutoplay: boolean = true): void {
      if (this.renderer._boolSingleFrame && boolAutoplay) {
        boolAutoplay = false;
        this.renderer._boolPlaying = true;
      }
      this.renderer._boolAutoplay = boolAutoplay;
      this.renderer.updateFromDynamicState();
    },

    resetToFragment(): boolean {
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
