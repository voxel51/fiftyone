import { Locator, Page } from "src/oss/fixtures";
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
  readonly controls: Locator;
  readonly playPauseButton: Locator;

  private readonly modal: ModalPom;

  constructor(page: Page, modal: ModalPom) {
    this.modal = modal;

    // The playback package tags with `data-testid`; Playwright's
    // `getByTestId` is bound to `data-cy` here, so these go by selector.
    this.controls = byDataTestId(this.modal.locator, "timeline-controls-root");
    this.playPauseButton = byDataTestId(
      this.controls,
      "timeline-controls-play-pause",
    );
  }

  private async togglePlay() {
    await this.playPauseButton.click();
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
}

function byDataTestId(root: Locator, id: string): Locator {
  return root.locator(`[data-testid="${id}"]`);
}
