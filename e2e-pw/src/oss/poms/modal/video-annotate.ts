import { expect, Locator, Page } from "src/oss/fixtures";
import { ModalPom } from ".";

/**
 * The video-annotation surface: the ImaVid media tile, the timeline of
 * per-instance frame-label tracks + temporal-detection (TD) interval rows, and
 * the playback controls (from `@fiftyone/playback`). Composes with the shared
 * modal POMs (`modal.sidebar.annotate` / `modal.sidebar.edit` /
 * `modal.sampleCanvas`) — only the video-specific timeline/playback affordances
 * live here.
 *
 * Timeline tracks expose `data-track-id`: an object track's id is the engine
 * `instanceId`; a TD track's id is `td-<field>-<detectionId>`.
 */
export class VideoAnnotatePom {
  readonly page: Page;
  readonly modal: ModalPom;
  readonly assert: VideoAnnotateAsserter;
  readonly topBar: Locator;
  readonly statusSlot: Locator;

  constructor(page: Page, modal: ModalPom) {
    this.page = page;
    this.modal = modal;
    this.assert = new VideoAnnotateAsserter(this);
    this.topBar = page.getByTestId("video-annotation-top-bar");
    this.statusSlot = page.getByTestId("video-annotation-status-slot");
  }

  /** Wait until the video-annotation surface (top bar) has mounted. */
  async waitForSurface() {
    await expect(this.topBar).toBeVisible();
  }

  /** All distinct timeline track ids (object instanceIds + `td-…` rows). */
  async trackIds(): Promise<string[]> {
    const ids = await this.page
      .locator("[data-track-id]")
      .evaluateAll((els) =>
        els.map((e) => e.getAttribute("data-track-id") ?? "")
      );
    return Array.from(new Set(ids.filter(Boolean)));
  }

  /** Timeline track ids for object (frame-label) tracks — the engine instanceIds. */
  async objectTrackIds(): Promise<string[]> {
    return (await this.trackIds()).filter((id) => !id.startsWith("td-"));
  }

  /** Timeline track ids for temporal-detection rows (`td-<field>-<id>`). */
  async temporalTrackIds(): Promise<string[]> {
    return (await this.trackIds()).filter((id) => id.startsWith("td-"));
  }

  /** A timeline track row by its id (object instanceId or `td-…`). */
  track(trackId: string): Locator {
    return this.page.locator(`[data-track-id="${trackId}"]`).first();
  }

  /** Click a timeline track row (selects it via engine interaction). */
  async clickTrack(trackId: string) {
    await this.track(trackId).click();
  }

  /**
   * The track's presence interval bar (the right-click target for its context
   * menu). The bar carries `data-event-index`; its resize handles also do, so
   * exclude `data-resize-handle` to land on the bar itself.
   */
  trackBar(trackId: string): Locator {
    return this.page
      .locator(
        `[data-track-id="${trackId}"] [data-event-index]:not([data-resize-handle])`
      )
      .first();
  }

  /**
   * Right-click a track's interval bar and choose "Delete track" from the
   * timeline context menu — removes the whole track (every frame's label),
   * unlike the per-frame sidebar/keyboard delete.
   */
  async deleteTrackViaContextMenu(trackId: string) {
    await this.trackBar(trackId).click({ button: "right" });
    await this.page.getByRole("menuitem", { name: "Delete track" }).click();
  }

  /**
   * Advance the playhead one frame. Uses the Modal-context "." keybinding
   * (`KnownCommands.ModalStepForward`) rather than the icon button, which is
   * the robust path while the ImaVid buffer settles.
   */
  async stepForward() {
    await this.page.keyboard.press(".");
  }

  /** Move the playhead back one frame (the "," Modal-context keybinding). */
  async stepBack() {
    await this.page.keyboard.press(",");
  }

  /** Toggle playback (play/pause) via the timeline control. */
  async togglePlay() {
    await this.page.getByTestId("timeline-controls-play-pause").click();
  }

  /**
   * The annotate-sidebar label rows currently listed (engine-presence derived:
   * the current frame's labels + in-support temporal detections). Each row is a
   * `[data-cy^=annotate-label-]` with `data-cy-label` / `data-cy-frame`.
   */
  get labelRows(): Locator {
    return this.page
      .getByTestId("modal")
      .getByTestId("sidebar")
      .locator("[data-cy^='annotate-label-']");
  }

  /** A listed label row by its class text (e.g. "approach", "vehicle"). */
  labelRow(labelText: string): Locator {
    return this.page
      .getByTestId("modal")
      .getByTestId("sidebar")
      .locator(`[data-cy^='annotate-label-'][data-cy-label='${labelText}']`);
  }

  /** The class texts of every label row currently listed in the sidebar. */
  async listedLabels(): Promise<string[]> {
    return this.labelRows.evaluateAll((els) =>
      els.map((e) => e.getAttribute("data-cy-label") ?? "")
    );
  }

  /** Select a listed label row by its class text (opens its editor). */
  async selectLabel(labelText: string) {
    await this.labelRow(labelText).first().click();
  }

  /**
   * The engine instanceId of a listed label row (read off its
   * `data-cy=annotate-label-<id>`). For a temporal detection this is the bare
   * `_id` — the same id the timeline encodes as `td-<field>-<id>`.
   */
  async labelRowId(labelText: string): Promise<string> {
    const cy = await this.labelRow(labelText).first().getAttribute("data-cy");
    return (cy ?? "").replace(/^annotate-label-/, "");
  }

  /**
   * Create a temporal detection at the current playhead via the "New TD"
   * toolbar action (a 1-second support window starting at the playhead frame).
   */
  async createTemporalDetection() {
    // target the actual button — the timeline-controls wrapper is also a
    // role="button" whose accessible name bubbles up "New TD".
    await this.page.locator('button[aria-label="New TD"]').click();
  }
}

class VideoAnnotateAsserter {
  constructor(private readonly va: VideoAnnotatePom) {}

  /** Assert the number of object (frame-label) tracks on the timeline. */
  async objectTrackCount(expected: number) {
    await expect
      .poll(async () => (await this.va.objectTrackIds()).length)
      .toBe(expected);
  }

  /** Assert the number of temporal-detection rows on the timeline. */
  async temporalTrackCount(expected: number) {
    await expect
      .poll(async () => (await this.va.temporalTrackIds()).length)
      .toBe(expected);
  }

  /** Assert a track with the given id is present on the timeline. */
  async hasTrack(trackId: string, present = true) {
    await expect
      .poll(async () => (await this.va.trackIds()).includes(trackId))
      .toBe(present);
  }

  /** Assert a label (by class text) is / isn't listed in the annotate sidebar. */
  async labelListed(labelText: string, listed = true) {
    await expect
      .poll(async () => (await this.va.listedLabels()).includes(labelText))
      .toBe(listed);
  }

  /** Assert the number of label rows currently listed in the annotate sidebar. */
  async listedLabelCount(expected: number) {
    await expect
      .poll(async () => (await this.va.listedLabels()).length)
      .toBe(expected);
  }
}
