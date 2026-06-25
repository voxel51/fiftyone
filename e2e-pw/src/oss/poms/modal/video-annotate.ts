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

  /**
   * Timeline track ids for object (frame-label) tracks — the engine
   * instanceIds. Excludes TD rows (`td-…`) and dynamic-attribute sub-tracks
   * (`<parentId>::<attr>`), so a count reflects distinct tracked instances.
   */
  async objectTrackIds(): Promise<string[]> {
    return (await this.trackIds()).filter(
      (id) => !id.startsWith("td-") && !id.includes("::")
    );
  }

  /**
   * Wait until at least one object track has built (timeline warmup is async),
   * then return the first object track's id. Use instead of indexing
   * `objectTrackIds()` directly right after the surface mounts.
   */
  async firstObjectTrackId(): Promise<string> {
    await expect
      .poll(async () => (await this.objectTrackIds()).length)
      .toBeGreaterThan(0);
    return (await this.objectTrackIds())[0];
  }

  /**
   * Dynamic-attribute sub-track ids under a parent object track, each
   * `<parentId>::<attr>`. Empty while the parent is collapsed (the default).
   */
  async subTrackIds(parentId: string): Promise<string[]> {
    return (await this.trackIds()).filter((id) =>
      id.startsWith(`${parentId}::`)
    );
  }

  /**
   * Expand / collapse a parent track's dynamic-attribute sub-tracks. The
   * chevron carries `data-testid`; this suite maps `getByTestId` to `data-cy`,
   * so target the attribute directly.
   */
  async toggleTrackExpansion(parentId: string) {
    await this.page
      .locator(`[data-testid="timeline-track-expand-${parentId}"]`)
      .first()
      .click();
  }

  /**
   * The value-segment bars within a sub-track row — one per coalesced run of an
   * equal attribute value. The bar `title` carries the value (e.g. "off").
   * Scoped to the first row copy (`track` uses `.first()`), since a pinned row
   * mounts in both the timeline header and the drawer body on this base.
   */
  segmentBars(subTrackId: string): Locator {
    return this.track(subTrackId).locator(
      "[data-event-index]:not([data-resize-handle])"
    );
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
   * Right-click a track's interval bar and choose "Split at playhead" — re-keys
   * the frames at/after the current playhead onto a fresh instance (a distinct
   * object), splitting the track in two in one engine transaction.
   */
  async splitTrackViaContextMenu(trackId: string) {
    await this.trackBar(trackId).click({ button: "right" });
    await this.page
      .getByRole("menuitem", { name: "Split at playhead" })
      .click();
  }

  /**
   * Seek the playhead by clicking the timeline ruler at `fraction` of its
   * width — a real timeline seek that lands mid-clip (unlike clicking a track
   * row, which jumps the playhead to that track's start frame).
   */
  async seekToRulerFraction(fraction: number) {
    // the ruler uses `data-testid` (not the suite's `data-cy` testid attr), so
    // address it explicitly; `.first()` covers the pinned + drawer layouts
    const ruler = this.page.locator('[data-testid="timeline-ruler"]').first();
    const box = await ruler.boundingBox();

    if (!box) {
      throw new Error("timeline ruler is not visible");
    }

    await ruler.click({
      position: { x: box.width * fraction, y: box.height / 2 },
    });
  }

  /** Click the toolbar "Split" button (enabled with exactly one track selected). */
  async clickSplitToolbarButton() {
    await this.page.locator('button[aria-label="Split"]').click();
  }

  /** Click the toolbar "Merge" button (enabled with exactly two tracks selected). */
  async clickMergeToolbarButton() {
    await this.page.locator('button[aria-label="Merge"]').click();
  }

  /**
   * Right-click the source track's interval bar and choose "Merge into
   * <targetLabel>" — re-keys the source's frames onto the target instance
   * (target-wins on overlapping frames); the source track ceases to exist.
   */
  async mergeTrackViaContextMenu(sourceTrackId: string, targetLabel: string) {
    await this.trackBar(sourceTrackId).click({ button: "right" });
    await this.page
      .getByRole("menuitem", { name: `Merge into ${targetLabel}` })
      .click();
  }

  /** Undo the last annotation edit (the ModalAnnotate undo keybinding). */
  async undo() {
    await this.page.keyboard.press("ControlOrMeta+z");
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
   * Draw a polyline by clicking each vertex on the canvas (polyline mode must
   * already be active). The first click seeds a new polyline via the creation
   * handler; each subsequent click extends it from the nearest endpoint.
   *
   * @param vertices Container-relative [0, 1] points, one per vertex.
   */
  async drawPolyline(vertices: Array<[number, number]>) {
    for (const [x, y] of vertices) {
      await this.modal.sampleCanvas.click(x, y);
    }
  }

  /**
   * Paint a mask brush stroke on the canvas (segmentation mode + the Brush tool
   * must already be active). With nothing selected the stroke's first move
   * creates a fresh masked detection, then paints onto it.
   *
   * @param path Container-relative [0, 1] points; the first is the press point,
   *   the rest are drag positions before release.
   */
  async paintMaskStroke(path: Array<[number, number]>) {
    const [first, ...rest] = path;
    await this.modal.sampleCanvas.move(first[0], first[1]);
    await this.modal.sampleCanvas.down();

    for (const [x, y] of rest) {
      await this.modal.sampleCanvas.move(x, y);
    }

    await this.modal.sampleCanvas.up();
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

  /**
   * The distinct fields of the overlays currently rendered on the canvas.
   * Canvas overlays are PIXI (not DOM), so this reads the scene through the
   * `__FO_PLAYWRIGHT_SCENE_OVERLAY_FIELDS` e2e affordance the surface exposes —
   * the only handle a spec has on what the canvas is actually painting.
   */
  async canvasOverlayFields(): Promise<string[]> {
    return this.page.evaluate(
      () =>
        (
          window as unknown as {
            __FO_PLAYWRIGHT_SCENE_OVERLAY_FIELDS?: () => string[];
          }
        ).__FO_PLAYWRIGHT_SCENE_OVERLAY_FIELDS?.() ?? []
    );
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

  /** Assert whether the canvas currently renders any overlay for `field`. */
  async canvasRendersField(field: string, rendered = true) {
    await expect
      .poll(async () => (await this.va.canvasOverlayFields()).includes(field))
      .toBe(rendered);
  }
}
