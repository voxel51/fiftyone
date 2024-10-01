import { Locator, Page, expect } from "src/oss/fixtures";
import { ModalPom } from ".";

export class ModalImaAsVideoControlsPom {
  readonly page: Page;
  readonly assert: ModalImaAsVideoControlsAsserter;
  readonly controls: Locator;
  readonly optionsPanel: Locator;
  readonly time: Locator;
  readonly playPauseButton: Locator;
  readonly speedButton: Locator;
  readonly timelineId: string;

  private readonly modal: ModalPom;

  constructor(page: Page, modal: ModalPom) {
    this.page = page;
    this.modal = modal;
    this.assert = new ModalImaAsVideoControlsAsserter(this);

    this.controls = this.modal.locator.getByTestId("imavid-timeline-controls");
    this.time = this.modal.locator.getByTestId("imavid-status-indicator");
    this.playPauseButton = this.controls.getByTestId("imavid-playhead");
    this.speedButton = this.controls.getByTestId("imavid-speed");
  }

  private async getTimelineIdForLocator(imaVidLocator: Locator) {
    const timelineId = await imaVidLocator.getAttribute("data-timeline-name");
    if (!timelineId) {
      throw new Error("Could not find timeline id for an imaVid locator");
    }
    return timelineId;
  }

  private async togglePlay() {
    let currentPlayHeadStatus = await this.playPauseButton.getAttribute(
      "data-playhead-state"
    );
    const original = currentPlayHeadStatus;

    // keep pressing space until play head status changes
    while (currentPlayHeadStatus === original) {
      await this.playPauseButton.click();
      currentPlayHeadStatus = await this.playPauseButton.getAttribute(
        "data-playhead-state"
      );
    }
  }

  async getCurrentFrameStatus() {
    return this.time.first().textContent();
  }

  async hoverLookerControls() {
    await this.controls.first().hover();
  }

  async playUntilFrames(frameText: string, matchBeginning = false) {
    await this.togglePlay();

    await this.page.waitForFunction(
      ({ frameText_, matchBeginning_ }) => {
        const frameTextDom = document.querySelector(
          `[data-cy=imavid-status-indicator]`
        )?.textContent;
        if (matchBeginning_) {
          return frameTextDom?.startsWith(frameText_);
        }
        return frameTextDom === frameText_;
      },
      { frameText_: frameText, matchBeginning_: matchBeginning }
    );
    await this.togglePlay();
  }

  async setSpeedTo(config: "low" | "middle" | "high") {
    await this.speedButton.hover();
    const speedSliderInputRange = this.speedButton
      .first()
      .locator("input[type=range]");
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

class ModalImaAsVideoControlsAsserter {
  constructor(private readonly videoControlsPom: ModalImaAsVideoControlsPom) {}

  async isCurrentTimeEqualTo(time: string) {
    const currentTime = await this.videoControlsPom.getCurrentFrameStatus();
    expect(currentTime).toBe(time);
  }

  async isTimeTextEqualTo(text: string) {
    const time = await this.videoControlsPom.time.textContent();
    expect(time).toContain(text);
  }
}
