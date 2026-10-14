import { Locator, Page } from "src/oss/fixtures";
import type { EventCondition } from "src/shared/event-utils";
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

  /** The playhead readout shows `text` */
  playhead(text: string): EventCondition {
    return {
      events: "e2e:playback:playhead-time",
      predicate: (e) =>
        readout((e.detail as { label: string }).label) === readout(text),
    };
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

  /** Play through `durationText`, then pause before reading the canvas. */
  async playUntilDuration(durationText: string) {
    const [minutes, seconds] = durationText.split(":").map(Number);
    const target = minutes * 60 + seconds;
    await this.afterReadout(
      (shown) => {
        const [current] = shown.split(" / ");
        const [currentMinutes, currentSeconds] = current.split(":").map(Number);
        // Playback can advance several frames between React commits. The
        // first rendered time at or beyond the target proves it played;
        // requiring one exact intermediate label can miss that frame forever.
        return currentMinutes * 60 + currentSeconds >= target;
      },
      () => this.togglePlay(),
    );
    await this.togglePlay();
  }
}

function byDataTestId(root: Locator, id: string): Locator {
  return root.locator(`[data-testid="${id}"]`);
}
