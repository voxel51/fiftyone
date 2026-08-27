import { Locator, Page, expect } from "src/oss/fixtures";
import { ModalPom } from ".";

/**
 * Video playback controls in the modal.
 *
 * Explore-mode video is a plain `<video>` docked over the shared timeline,
 * so these drive the timeline's controls row rather than an overlay the
 * media surface draws for itself.
 */
export class ModalVideoControlsPom {
  readonly page: Page;
  readonly assert: ModalVideoControlsAsserter;
  readonly controls: Locator;
  readonly time: Locator;
  readonly playPauseButton: Locator;

  private readonly modal: ModalPom;

  constructor(page: Page, modal: ModalPom) {
    this.page = page;
    this.modal = modal;
    this.assert = new ModalVideoControlsAsserter(this);

    // The playback package tags with `data-testid`; Playwright's
    // `getByTestId` is bound to `data-cy` here, so these go by selector.
    this.controls = byDataTestId(this.modal.locator, "timeline-controls-root");
    this.time = byDataTestId(this.modal.locator, "timeline-playhead-time");
    this.playPauseButton = byDataTestId(
      this.controls,
      "timeline-controls-play-pause",
    );
  }

  private async togglePlay() {
    await this.playPauseButton.click();
  }

  async getCurrentTime() {
    return this.time.textContent();
  }

  async hoverLookerControls() {
    await this.controls.hover();
  }

  /**
   * Swap the readout, and the ruler with it, between the timeline's
   * configured domain (frame numbers, when the frame rate is known) and
   * plain elapsed time. Replaces the looker's "use frame number" setting.
   */
  async toggleTimeDisplay() {
    await this.time.click();
  }

  /** Play until the readout reads `text`, then pause. */
  private async playUntilReadout(text: string, matchBeginning: boolean) {
    await this.togglePlay();

    await this.page.waitForFunction(
      ({ text_, matchBeginning_ }) => {
        const readout = document.querySelector(
          "[data-testid=timeline-playhead-time]",
        )?.textContent;
        return matchBeginning_
          ? !!readout?.startsWith(text_)
          : readout === text_;
      },
      { text_: text, matchBeginning_: matchBeginning },
    );

    await this.togglePlay();
  }

  async playUntilDuration(durationText: string) {
    await this.playUntilReadout(durationText, true);
  }

  async playUntilFrames(frameText: string, matchBeginning = false) {
    await this.playUntilReadout(frameText, matchBeginning);
  }
}

class ModalVideoControlsAsserter {
  constructor(private readonly videoControlsPom: ModalVideoControlsPom) {}

  async isCurrentTimeEqualTo(time: string) {
    const currentTime = await this.videoControlsPom.getCurrentTime();
    expect(currentTime).toBe(time);
  }

  async isTimeTextEqualTo(text: string) {
    const time = await this.videoControlsPom.time.textContent();
    expect(time).toContain(text);
  }
}

function byDataTestId(root: Locator, id: string): Locator {
  return root.locator(`[data-testid="${id}"]`);
}
