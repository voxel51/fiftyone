import { Locator, Page, expect } from "src/oss/fixtures";
import { ModalPom } from ".";

export class ModalVideoControlsPom {
  readonly page: Page;
  readonly assert: ModalVideoControlsAsserter;
  readonly controls: Locator;
  readonly optionsPanel: Locator;
  readonly time: Locator;
  readonly playPauseButton: Locator;

  private readonly modal: ModalPom;

  constructor(page: Page, modal: ModalPom) {
    this.page = page;
    this.modal = modal;

    this.controls = this.modal.locator.getByTestId("looker-video-controls");
    this.optionsPanel = this.modal.locator.getByTestId(
      "looker-video-options-panel"
    );
    this.time = this.modal.locator.getByTestId("looker-video-time");
    this.playPauseButton = this.controls.getByTestId(
      "looker-video-play-button"
    );
  }

  private async play() {
    return this.playPauseButton.click();
  }

  private async pause() {
    return this.playPauseButton.click();
  }

  private async clickSettings() {
    return this.controls.getByTestId("looker-video-controls-settings").click();
  }

  async getCurrentTime() {
    return this.time.textContent();
  }

  async hoverLookerControls() {
    await this.controls.hover();
  }

  async clickUseFrameNumber() {
    await this.clickSettings();
    await this.optionsPanel
      .getByTestId("looker-checkbox-Use frame number")
      .click();
    await this.clickSettings();
  }

  async playUntilDuration(durationText: string) {
    await this.play();

    await this.page.waitForFunction((durationText_) => {
      const time = document.querySelector(
        "[data-cy=looker-video-time]"
      )?.textContent;
      return time.startsWith(durationText_);
    }, durationText);

    await this.pause();
  }

  async playUntilFrames(frameText: string) {
    await this.play();

    await this.page.waitForFunction((frameText_) => {
      const frames = document.querySelector(
        "[data-cy=looker-video-time]"
      )?.textContent;
      return frames.startsWith(frameText_);
    }, frameText);

    await this.pause();
  }
}

class ModalVideoControlsAsserter {
  constructor(private readonly videoControlsPom: ModalVideoControlsPom) {}

  async assertCurrentTime(time: string) {
    const currentTime = await this.videoControlsPom.getCurrentTime();
    expect(currentTime).toBe(time);
  }
}
