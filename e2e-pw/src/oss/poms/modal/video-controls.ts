import { Locator, Page, expect } from "src/oss/fixtures";
import { escapeRegExp } from "src/oss/utils";
import { ModalPom } from ".";

/** The readout's text, with the padding spaces it renders collapsed */
const readout = (text: string) => text.replace(/\s+/g, " ").trim();

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

  /**
   * Play until the readout leaves the value it is showing now, then pause.
   * Mode-agnostic: the readout is frame numbers when the frame rate is known
   * and elapsed time when it is not, and callers that only need playback to
   * have moved should not have to care which.
   */
  async playUntilAdvanced() {
    // the readout always renders a reading, so any other one has advanced
    const start = readout((await this.time.textContent()) ?? "");
    await this.afterReadout(
      (text) => text !== start,
      () => this.togglePlay(),
    );
    await this.togglePlay();
  }

  /** Play until the readout reads `text`, then pause. */
  private async playUntilReadout(text: string, matchBeginning: boolean) {
    const pattern = new RegExp(
      `^${escapeRegExp(text)}${matchBeginning ? "" : "$"}`,
    );
    await this.afterReadout(
      (shown) => pattern.test(shown),
      () => this.togglePlay(),
    );
    await this.togglePlay();
  }

  /** Run `action` and resolve once the playhead readout satisfies `shows` */
  private afterReadout<T>(
    shows: (text: string) => boolean,
    action: () => Promise<T>,
  ): Promise<T> {
    return this.modal.eventUtils.after(
      "e2e:playback:playhead-time",
      action,
      (e) => shows(readout((e.detail as { label: string }).label)),
    );
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
