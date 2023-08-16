import { Locator, Page, expect } from "src/oss/fixtures";
import { ModalPom } from ".";

export class Modal3dControlsPom {
  readonly page: Page;
  readonly assert: Modal3dControlsAsserter;
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
}
class Modal3dControlsAsserter {
  constructor(private readonly videoControlsPom: Modal3dControlsPom) {}

  async assertSlice(time: string) {
    const currentTime = await this.videoControlsPom.getCurrentTime();
    expect(currentTime).toBe(time);
  }
}
