import { Locator, Page, expect } from "src/oss/fixtures";
import { ModalPom } from ".";

export class ModalVideoControlsPom {
  readonly page: Page;
  readonly assert: ModalVideoControlsAsserter;
  readonly controls: Locator;
  readonly optionsPanel: Locator;
  readonly time: Locator;
  readonly playPauseButton: Locator;
  readonly speedButton: Locator;

  private readonly modal: ModalPom;

  constructor(page: Page, modal: ModalPom) {
    this.page = page;
    this.modal = modal;
    this.assert = new ModalVideoControlsAsserter(this);

    this.controls = this.modal.locator.getByTestId("looker-video-controls");
    this.optionsPanel = this.modal.locator.getByTestId(
      "looker-video-options-panel"
    );
    this.time = this.modal.locator.getByTestId("looker-video-time");
    this.playPauseButton = this.controls.getByTestId(
      "looker-video-play-button"
    );
    this.speedButton = this.controls.getByTestId("looker-video-speed-button");
  }

  private async togglePlay() {
    // this is to clear popups, if any
    this.controls.click();
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
    await this.togglePlay();

    await this.page.waitForFunction((durationText_) => {
      const time = document.querySelector(
        "[data-cy=looker-video-time]"
      )?.textContent;
      return time.startsWith(durationText_);
    }, durationText);

    await this.togglePlay();
  }

  async playUntilFrames(frameText: string) {
    await this.togglePlay();

    await this.page.waitForFunction((frameText_) => {
      const frames = document.querySelector(
        "[data-cy=looker-video-time]"
      )?.textContent;
      return frames.startsWith(frameText_);
    }, frameText);

    await this.togglePlay();
  }

  async setSpeedTo(config: "low" | "middle" | "high") {
    await this.speedButton.hover();
    const speedSliderInputRange = this.speedButton.locator("input[type=range]");
    const sliderBoundingBox = await speedSliderInputRange.boundingBox();

    if (!sliderBoundingBox) {
      throw new Error("Could not find speed slider bounding box");
    }

    const sliderWidth = sliderBoundingBox.width;

    switch (config) {
      case "low":
        await this.page.mouse.click(
          sliderBoundingBox.x + sliderWidth * 0.05,
          sliderBoundingBox.y
        );
        break;
      case "middle":
        await this.page.mouse.click(
          sliderBoundingBox.x + sliderWidth * 0.5,
          sliderBoundingBox.y
        );
        break;
      case "high":
        await this.page.mouse.click(
          sliderBoundingBox.x + sliderWidth * 0.95,
          sliderBoundingBox.y
        );
        break;
    }
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
