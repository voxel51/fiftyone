import { expect, Locator, Page } from "src/oss/fixtures";
import { ModalPom } from ".";

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/**
 * Prefix of a temporal-tag row's track id. Must match
 * `TEMPORAL_TAG_TRACK_PREFIX` in `@fiftyone/playback`, which mints these ids —
 * this package cannot import from the app workspace.
 */
const TEMPORAL_TAG_TRACK_PREFIX = "temporal-tag::";

/**
 * The video-annotation surface: the ImaVid tile, the timeline of per-instance
 * frame-label tracks and temporal-detection (TD) rows, and the playback
 * controls, composing with the shared modal POMs. Tracks expose
 * `data-track-id`: an object track's id is the engine `instanceId`, a TD
 * track's is `td-<field>-<detectionId>`.
 */
export class VideoAnnotatePom {
  readonly page: Page;
  readonly modal: ModalPom;
  readonly assert: VideoAnnotateAsserter;
  readonly surface: Locator;

  constructor(page: Page, modal: ModalPom) {
    this.page = page;
    this.modal = modal;
    this.assert = new VideoAnnotateAsserter(this);
    this.surface = page.getByTestId("video-annotation-surface");
  }

  /** The dynamic group's order-by value beside the clock, `(value)`. */
  get orderByReadout(): Locator {
    return this.page.getByTestId("timeline-order-by-readout");
  }

  /** The timeline clock; in frame display it reads `#frame / #total`. */
  get clock(): Locator {
    return this.page.locator('[data-testid="timeline-playhead-time"]');
  }

  /** Switch the clock between elapsed time and frame numbers. */
  async toggleClockDisplay() {
    await this.clock.click();
  }

  /**
   * Wait until the video-annotation surface has mounted AND the timeline
   * has committed its tracks (`data-timeline-loaded="true"` — stamped once
   * label schemas land and the frame index resolves). Track reads after
   * this are deterministic single-shots; no polling required.
   */
  async waitForSurface() {
    await expect(this.surface).toBeVisible();
    // the surface stays under an opaque cover until media, store and tracks
    // are ready; clicks before that land on the cover
    await expect(this.surface).toHaveAttribute("data-revealed", "true");
    await expect(
      this.page.locator('[data-timeline-loaded="true"]'),
    ).toBeAttached();
  }

  /** All distinct timeline track ids (object instanceIds + `td-…` rows). */
  async trackIds(): Promise<string[]> {
    const ids = await this.page
      .locator("[data-track-id]")
      .evaluateAll((els) =>
        els.map((e) => e.getAttribute("data-track-id") ?? ""),
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
      (id) => !id.startsWith("td-") && !id.includes("::"),
    );
  }

  /** Object (frame-label) track rows: not TD rows, not attribute sub-tracks. */
  get objectTracks(): Locator {
    return this.page.locator(
      '[data-track-id]:not([data-track-id^="td-"]):not([data-track-id*="::"])',
    );
  }

  /** Temporal-detection track rows (`td-…`). */
  get temporalTracks(): Locator {
    return this.page.locator('[data-track-id^="td-"]');
  }

  /** Dynamic-attribute sub-track rows under a parent object track. */
  subTracks(parentId: string): Locator {
    return this.page.locator(`[data-track-id^="${parentId}::"]`);
  }

  /**
   * Wait until at least one object track has built (timeline warmup is async),
   * then return the first object track's id. Use instead of indexing
   * `objectTrackIds()` directly right after the surface mounts.
   */
  async firstObjectTrackId(): Promise<string> {
    await expect(this.objectTracks.first()).toBeAttached();
    return (await this.objectTrackIds())[0];
  }

  /**
   * Dynamic-attribute sub-track ids under a parent object track, each
   * `<parentId>::<attr>`. Empty while the parent is collapsed (the default).
   */
  async subTrackIds(parentId: string): Promise<string[]> {
    return (await this.trackIds()).filter((id) =>
      id.startsWith(`${parentId}::`),
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
   * The value-segment bars within a sub-track row, one per coalesced run of an
   * equal attribute value, with the value in the bar `title`. Scoped to the
   * first row copy since a pinned row mounts in both the header and the drawer.
   */
  segmentBars(subTrackId: string): Locator {
    return this.track(subTrackId).locator(
      "[data-event-index]:not([data-resize-handle])",
    );
  }

  /** Timeline track ids for temporal-detection rows (`td-<field>-<id>`). */
  async temporalTrackIds(): Promise<string[]> {
    return (await this.trackIds()).filter((id) => id.startsWith("td-"));
  }

  /**
   * Timeline track ids for temporal-TAG rows (`temporal-tag::<value>`). Not to
   * be confused with {@link temporalTrackIds}, which is temporal detections.
   */
  async temporalTagTrackIds(): Promise<string[]> {
    return (await this.trackIds()).filter((id) =>
      id.startsWith(TEMPORAL_TAG_TRACK_PREFIX),
    );
  }

  /** The tag-mode toggle in the timeline controls (also bound to Shift+T). */
  get temporalTagModeButton(): Locator {
    return this.page.locator('[data-testid="temporal-tag-mode-button"]');
  }

  /** The create/edit popup, addressed by its dialog role. */
  temporalTagPopup(mode: "Create" | "Edit" = "Create"): Locator {
    return this.page.getByRole("dialog", { name: `${mode} temporal tag` });
  }

  /**
   * Resolves once a temporal-tag write lands, giving the caller the response
   * so it can be checked against the sample it was supposed to be scoped to.
   *
   * Deliberately matches any status: filtering to 2xx here would turn a
   * rejected write into a test timeout with nothing to read, instead of a
   * failure carrying the server's reason.
   */
  waitForTemporalTagWrite(method: "POST" | "PATCH" | "DELETE" = "POST") {
    return this.page.waitForResponse(
      (resp) =>
        resp.request().method() === method &&
        /\/dataset\/[^/]+\/sample\/[^/]+\/tags/.test(resp.url()),
    );
  }

  /**
   * Drag a range on the tag-mode overlay and save it under `label`.
   *
   * The drag only has to land somewhere in the ruler's right half; the popup's
   * nudge buttons then walk the bounds to a fixed number of steps, so the
   * persisted interval does not depend on where the pointer went and callers
   * never do pixel arithmetic to assert it.
   */
  async createTemporalTag(label: string, { nudges = 2 } = {}) {
    // Shift+T rather than clicking the toggle: on a grouped modal the media
    // canvas overlaps the controls row and swallows the click, and the hotkey
    // is the same documented affordance.
    await expect(this.temporalTagModeButton).toBeVisible();
    await this.page.keyboard.press("Shift+T");
    await expect(this.temporalTagModeButton).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const overlay = this.page.locator(
      '[data-testid="temporal-tag-range-overlay"]',
    );
    const box = await overlay.boundingBox();
    if (!box) {
      throw new Error("temporal tag range overlay is not on screen");
    }

    // Right half only: the label column occupies the left edge of the overlay.
    const y = box.y + box.height / 2;
    const from = box.x + box.width * 0.55;
    const to = box.x + box.width * 0.8;

    await this.page.mouse.move(from, y);
    await this.page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await this.page.mouse.move(from + ((to - from) * i) / 8, y);
    }
    await this.page.mouse.up();

    const popup = this.temporalTagPopup();
    await expect(popup).toBeVisible();

    // Same count on both edges keeps the interval's width fixed as well as its
    // endpoints' relationship to wherever the drag started.
    for (let i = 0; i < nudges; i++) {
      await popup.getByRole("button", { name: "Start +0.1s" }).click();
      await popup.getByRole("button", { name: "End +0.1s" }).click();
    }

    await popup.getByRole("textbox", { name: "Tag" }).fill(label);

    const written = this.waitForTemporalTagWrite("POST");
    await popup.getByRole("button", { name: "Accept" }).click();
    const response = await written;
    if (!response.ok()) {
      throw new Error(
        `temporal tag write failed: ${response.status()} ${await response.text()}`,
      );
    }
    await expect(popup).toBeHidden();

    return response;
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
   * The tracks drawer's open/close chevron, at the right end of the playback
   * controls row. A real `<button>`, so keyboard activation is native — the
   * controls row itself is deliberately not a tab stop (focusing it used to
   * ring the whole bar).
   */
  private tracksDrawerToggle(): Locator {
    return this.page
      .locator('[data-testid="timeline-controls-toggle"]')
      .first();
  }

  /**
   * Expand the tracks drawer via its chevron. It toggles, so call only from
   * the closed default.
   */
  async openTracksDrawer() {
    await this.tracksDrawerToggle().click();
  }

  /** Collapse the tracks drawer back to the closed default — see {@link openTracksDrawer}. */
  async closeTracksDrawer() {
    await this.tracksDrawerToggle().click();
  }

  /**
   * Pin an object track so its row stays in the always-visible timeline header
   * once the drawer closes. The pin button mounts only while the row renders,
   * so this opens the drawer, pins, and restores the closed default.
   */
  async pinTrack(trackId: string) {
    await this.openTracksDrawer();
    await this.page
      .locator(`[data-testid="timeline-track-pin-${trackId}"]`)
      .first()
      .click();
    await this.closeTracksDrawer();
  }

  /**
   * The track's presence interval bar (the right-click target for its context
   * menu). The bar carries `data-event-index`; its resize handles also do, so
   * exclude `data-resize-handle` to land on the bar itself.
   */
  trackBar(trackId: string): Locator {
    return this.page
      .locator(
        `[data-track-id="${trackId}"] [data-event-index]:not([data-resize-handle])`,
      )
      .first();
  }

  /**
   * Run `action` and resolve once the timeline has rendered exactly the rows
   * `ids`, in any order.
   */
  async afterTracksRendered<T>(ids: string[], action: () => Promise<T>) {
    const want = [...ids].sort().join(",");
    return this.modal.eventUtils.after(
      "video-annotation-tracks-rendered",
      action,
      (e) =>
        [...((e.detail as { ids?: string[] })?.ids ?? [])].sort().join(",") ===
        want,
    );
  }

  /** The label text in a track row's left column. */
  trackLabel(trackId: string): Locator {
    return this.track(trackId).locator("[data-track-label]");
  }

  /** Right-click a track's interval bar and read its context menu items. */
  async trackContextMenuItems(trackId: string): Promise<string[]> {
    await this.trackBar(trackId).click({ button: "right" });
    const items = this.page.getByRole("menuitem");
    await items.first().waitFor();
    return items.allTextContents();
  }

  /** The human-readable interval span shown in a track bar's `title` tooltip. */
  async trackBarTitle(trackId: string): Promise<string> {
    return (await this.trackBar(trackId).getAttribute("title")) ?? "";
  }

  /**
   * A track's presence intervals in seconds, read off its rendered lane. The
   * row must be mounted (drawer open or pinned).
   */
  async trackIntervals(
    trackId: string,
  ): Promise<Array<{ start: number; end: number }>> {
    return this.page
      .locator(`[data-track-id="${trackId}"] [data-event-kind="interval"]`)
      .evaluateAll((bars) =>
        bars.map((bar) => ({
          start: Number(bar.getAttribute("data-event-start")),
          end: Number(bar.getAttribute("data-event-end")),
        })),
      );
  }

  /**
   * Times (seconds) of a track's keyframe markers, ascending: a frame's start,
   * or the bar's end for a track's last frame. The row must be mounted.
   */
  async keyframeTimes(trackId: string): Promise<number[]> {
    const times = await this.page
      .locator(`[data-track-id="${trackId}"] [data-event-kind="point"]`)
      .evaluateAll((markers) =>
        markers.map((marker) =>
          Number(marker.getAttribute("data-event-start")),
        ),
      );
    return times.sort((a, b) => a - b);
  }

  /**
   * Drag a TD interval's END resize handle by `dxPx` pixels (positive = later),
   * resizing its `support` end. The drag uses document-level mouse listeners and
   * a 3px threshold, so move in several steps past it before releasing.
   */
  async dragTemporalIntervalEnd(trackId: string, dxPx: number) {
    const handle = this.page
      .locator(`[data-track-id="${trackId}"] [data-resize-handle="end"]`)
      .first();
    const box = await handle.boundingBox();

    if (!box) {
      throw new Error(`no end resize handle for track ${trackId}`);
    }

    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const steps = 8;

    await this.page.mouse.move(x, y);
    await this.page.mouse.down();

    for (let i = 1; i <= steps; i++) {
      await this.page.mouse.move(x + (dxPx * i) / steps, y);
    }

    await this.page.mouse.up();
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
    await this.stepAndApply(".");
  }

  /** Move the playhead back one frame (the "," Modal-context keybinding). */
  async stepBack() {
    await this.stepAndApply(",");
  }

  /** Canvas and sidebar reads are only valid once the scene shows the frame. */
  private stepAndApply(key: string) {
    return this.modal.eventUtils.after("video-annotation:frame-applied", () =>
      this.page.keyboard.press(key),
    );
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

  /** The listed label rows under a schema path (e.g. `frames.detections`). */
  labelRowsFor(path: string): Locator {
    return this.page
      .getByTestId("modal")
      .getByTestId("sidebar")
      .locator(`[data-cy^='annotate-label-'][data-cy-path='${path}']`);
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
      els.map((e) => e.getAttribute("data-cy-label") ?? ""),
    );
  }

  /**
   * The distinct field PATHS of every label row currently listed in the sidebar
   * (read off `data-cy-path`, e.g. `frames.detections`, `detections`, `events`).
   * The annotate sidebar list is gated on the per-slice schema filter, so this
   * reflects which schema paths the open slice offers for annotation.
   */
  async listedLabelPaths(): Promise<string[]> {
    const paths = await this.labelRows.evaluateAll((els) =>
      els.map((e) => e.getAttribute("data-cy-path") ?? ""),
    );
    return [...new Set(paths.filter(Boolean))];
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
    await this.modal.sampleCanvas.waitForDrawingCursor();

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
    // target the actual button by element, not by role: the toolbar slot sits
    // inside the timeline controls row, and pinning the selector to `button`
    // keeps it unambiguous regardless of what wraps it.
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
        ).__FO_PLAYWRIGHT_SCENE_OVERLAY_FIELDS?.() ?? [],
    );
  }

  /**
   * The live geometry of the overlays the canvas is painting, as the OVERLAY
   * holds it — deliberately not what the engine stores. Reads the
   * `__FO_PLAYWRIGHT_SCENE_OVERLAY_GEOMETRY` affordance; use it to catch a
   * projection that updated the store but never reached the canvas.
   */
  async canvasOverlayGeometry(): Promise<
    Array<{
      id: string;
      field: string;
      type: string;
      points?: [number, number][];
    }>
  > {
    return this.page.evaluate(
      () =>
        (
          window as unknown as {
            __FO_PLAYWRIGHT_SCENE_OVERLAY_GEOMETRY?: () => Array<{
              id: string;
              field: string;
              type: string;
              points?: [number, number][];
            }>;
          }
        ).__FO_PLAYWRIGHT_SCENE_OVERLAY_GEOMETRY?.() ?? [],
    );
  }

  /** The vertices of the single polyline overlay on the canvas, if any. */
  async canvasPolylinePoints(): Promise<[number, number][] | undefined> {
    const overlays = await this.canvasOverlayGeometry();

    return overlays.find((o) => o.type === "PolylineOverlay")?.points;
  }
}

class VideoAnnotateAsserter {
  constructor(private readonly va: VideoAnnotatePom) {}

  /** The order-by readout shows `text`, e.g. `(30)`. */
  async orderByReadout(text: string) {
    await expect(this.va.orderByReadout).toHaveText(text);
  }

  /** The clock shows `text`. */
  async clock(text: string) {
    await expect(this.va.clock).toHaveText(text);
  }

  /** Assert the number of object (frame-label) tracks on the timeline. */
  async objectTrackCount(expected: number) {
    await expect(this.va.objectTracks).toHaveCount(expected);
  }

  /** Assert the number of temporal-detection rows on the timeline. */
  async temporalTrackCount(expected: number) {
    await expect(this.va.temporalTracks).toHaveCount(expected);
  }

  /** Assert a track row's left-column label. */
  async trackLabel(trackId: string, text: string) {
    expect(await this.va.trackLabel(trackId).textContent()).toBe(text);
  }

  /** Assert a track's context menu lists exactly `items`, in order. */
  async trackContextMenuItems(trackId: string, items: string[]) {
    expect(await this.va.trackContextMenuItems(trackId)).toEqual(items);
  }

  /** Assert a track's interval bars have no resize handles. */
  async trackNotResizable(trackId: string) {
    expect(
      await this.va.track(trackId).locator("[data-resize-handle]").count(),
    ).toBe(0);
  }

  /** Assert a track with the given id is present on the timeline. */
  async hasTrack(trackId: string, present = true) {
    const track = this.va.track(trackId);
    return present
      ? await expect(track).toBeAttached()
      : await expect(track).toHaveCount(0);
  }

  /** Assert the sub-track rows under a parent, by attribute name. */
  async subTracks(parentId: string, attrs: string[]) {
    await expect(this.va.subTracks(parentId)).toHaveCount(attrs.length);
    for (const attr of attrs) {
      await expect(this.va.track(`${parentId}::${attr}`)).toBeAttached();
    }
  }

  /**
   * Assert a track's interval bar is (not) actionable, which is what clicks and
   * context menus depend on rather than mere visibility. A closed drawer keeps
   * the bar mounted but non-interactive; pinning or opening the drawer makes it
   * clickable.
   */
  async trackBarActionable(trackId: string, actionable = true) {
    const bar = this.va.trackBar(trackId);
    if (actionable) {
      await bar.click({ trial: true });
      return;
    }

    // the bar must stay mounted and on-screen — otherwise a failed hit-test
    // would prove "gone", not "non-actionable"
    await expect(bar).toBeVisible();

    const hit = await bar.evaluate((el) => {
      const { left, top, width, height } = el.getBoundingClientRect();
      const target = document.elementFromPoint(
        left + width / 2,
        top + height / 2,
      );
      return !!target && el.contains(target);
    });
    expect(
      hit,
      "expected the track bar to be non-actionable while the drawer is closed",
    ).toBe(false);
  }

  /** Assert a label (by class text) is / isn't listed in the annotate sidebar. */
  async labelListed(labelText: string, listed = true) {
    const row = this.va.labelRow(labelText);
    return listed
      ? await expect(row.first()).toBeVisible()
      : await expect(row).toHaveCount(0);
  }

  /** Assert the number of label rows currently listed in the annotate sidebar. */
  async listedLabelCount(expected: number) {
    await expect(this.va.labelRows).toHaveCount(expected);
  }

  /** Assert the sidebar lists (or does not list) any label under `path`. */
  async listsPath(path: string, listed = true) {
    const rows = this.va.labelRowsFor(path);
    return listed
      ? await expect(rows).not.toHaveCount(0)
      : await expect(rows).toHaveCount(0);
  }

  /**
   * Assert whether the canvas currently renders any overlay for `field`. The
   * surface mirrors its PIXI overlays' fields onto `data-cy-scene-overlay-fields`
   * (space separated), since the overlays themselves have no DOM.
   */
  async canvasRendersField(field: string, rendered = true) {
    const pattern = new RegExp(`(^| )${escapeRegExp(field)}( |$)`);
    return rendered
      ? await expect(this.va.surface).toHaveAttribute(
          "data-cy-scene-overlay-fields",
          pattern,
        )
      : await expect(this.va.surface).not.toHaveAttribute(
          "data-cy-scene-overlay-fields",
          pattern,
        );
  }

  /** Assert whether the canvas renders the overlay with `id`. */
  async canvasRendersOverlay(id: string, rendered = true) {
    const pattern = new RegExp(`(^| )${escapeRegExp(id)}( |$)`);
    return rendered
      ? await expect(this.va.surface).toHaveAttribute(
          "data-cy-scene-overlay-ids",
          pattern,
        )
      : await expect(this.va.surface).not.toHaveAttribute(
          "data-cy-scene-overlay-ids",
          pattern,
        );
  }

  /** Assert the surface shows the sample with `sampleId`. */
  async showsSample(sampleId: string) {
    await expect(this.va.surface).toHaveAttribute(
      "data-cy-sample-id",
      sampleId,
    );
  }
}
