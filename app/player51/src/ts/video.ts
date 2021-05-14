/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

export function asVideo() {
  return Object.assign(this, {
    /**
     * Play the video
     */
    play(): void {
      this.renderer._boolPlaying = true;
      this.renderer.updateFromDynamicState();
    },

    /**
     * Pause the video
     */
    pause(): void {
      this.renderer._boolPlaying = false;
      this.renderer.updateFromDynamicState();
    },

    /**
     * Reset the video time to the provided fragment
     */
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
