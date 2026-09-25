import { Locator, Page, expect } from "src/oss/fixtures";
import { escapeRegExp } from "src/oss/utils";
import { ModalPom } from ".";

export class ModalImaAsVideoControlsPom {
  readonly page: Page;
  readonly assert: ModalImaAsVideoControlsAsserter;
  readonly controls: Locator;
  readonly lookerControls: Locator;
  readonly optionsPanel: Locator;
  readonly playPauseButton: Locator;
  readonly settingsButton: Locator;
  readonly speedButton: Locator;
  readonly time: Locator;
  readonly timelineId: string;

  private readonly modal: ModalPom;

  constructor(page: Page, modal: ModalPom) {
    this.page = page;
    this.modal = modal;
    this.assert = new ModalImaAsVideoControlsAsserter(this);

    this.controls = this.modal.locator.getByTestId("imavid-timeline-controls");
    this.lookerControls = this.modal.locator.getByTestId("looker-controls");
    this.optionsPanel = this.controls.getByTestId("looker-options-panel");
    this.playPauseButton = this.controls.getByTestId("imavid-playhead");
    this.settingsButton = this.lookerControls.getByTestId(
      "looker-controls-settings",
    );
    this.speedButton = this.controls.getByTestId("imavid-speed");
    this.time = this.modal.locator.getByTestId("imavid-status-indicator");
  }

  private async getTimelineIdForLocator(imaVidLocator: Locator) {
    const timelineId = await imaVidLocator.getAttribute("data-timeline-name");
    if (!timelineId) {
      throw new Error("Could not find timeline id for an imaVid locator");
    }
    return timelineId;
  }

  // only the paused and playing states render an icon with a click handler
  private async waitUntilClickable() {
    await this.page
      .locator(
        '[data-cy=imavid-playhead][data-playhead-state="paused"], [data-cy=imavid-playhead][data-playhead-state="playing"]',
      )
      .first()
      .first()
      .waitFor({ state: "attached" });
  }

  public async togglePlay() {
    await this.waitUntilClickable();

    // a short clip can play through and pause again before a DOM read, so
    // wait on the event the icon's handler dispatches
    const state = await this.playPauseButton.getAttribute(
      "data-playhead-state",
    );
    await this.modal.eventUtils.after(
      state === "paused" ? "play" : "pause",
      () => this.playPauseButton.click(),
    );
  }

  async getCurrentFrameStatus() {
    return this.time.first().textContent();
  }

  async hoverLookerControls() {
    await this.controls.first().hover();
  }

  async waitUntilFrameTextIs(frameText: string, matchBeginning = false) {
    await this.page
      .locator("[data-cy=imavid-status-indicator]")
      .filter({
        hasText: new RegExp(
          `^${escapeRegExp(frameText)}${matchBeginning ? "" : "$"}`,
        ),
      })
      .first()
      .first()
      .waitFor({ state: "attached" });
  }

  /**
   * Play until the status shows `frameText`, then pause; resolves with the
   * frame the pause lands on, which a draw in flight can carry past it
   */
  async playUntilFrames(frameText: string, matchBeginning = false) {
    await this.togglePlay();
    await this.waitUntilFrameTextIs(frameText, matchBeginning);
    let landed = 0;
    await this.modal.eventUtils.after(
      "e2e:playback:paused",
      () => this.togglePlay(),
      (e) => {
        landed = (e.detail as { frameNumber: number }).frameNumber;
        return true;
      },
    );
    return landed;
  }

  async toggleSettings() {
    await this.settingsButton.click();
  }

  async setLooping(isLooping: boolean) {
    const loopLabel = this.modal.locator.getByTestId(
      "looker-checkbox-Loop video",
    );
    const loopInput = loopLabel.getByTestId("looker-checkbox-input-Loop video");

    const loopInputChecked = await loopInput.isEnabled();

    if (isLooping !== loopInputChecked) {
      await loopLabel.click();
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
