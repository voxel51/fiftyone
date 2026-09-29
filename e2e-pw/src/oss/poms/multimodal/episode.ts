import fs from "fs";
import path from "path";
import { Locator, Page, expect } from "src/oss/fixtures";
import { exactText } from "src/oss/utils";
import { EventCondition, EventUtils } from "src/shared/event-utils";

/**
 * Screenshot style that hides everything in the episode shell except its
 * canvases, so a capture shows rendered pixels and no DOM chrome.
 */
const CANVAS_ONLY_STYLE = fs.readFileSync(
  path.resolve(__dirname, "../../../shared/assets/canvas-only.css"),
  "utf8",
);

/** Detail of the app's e2e-only `e2e:multimodal:point-cloud-frame-rendered` */
interface PointCloudFrameDetail {
  readonly contentTimesNs: string;
  readonly pointSize: number;
  readonly renderedPointCount: number;
  readonly surface: string | null;
}

/** Detail of the app's e2e-only `e2e:multimodal:image-frame-rendered` */
interface ImageFrameDetail {
  readonly imageContentTimeNs: string | null;
  readonly pointSize: number;
  readonly projectedStreamCount: number;
}

/** The text a readout shows, with the padding spaces it renders collapsed */
const readout = (text: string) => text.replace(/\s+/g, " ").trim();

/** An `e2e:multimodal:*` ShownSignal condition on its detail */
const shown = (
  event: string,
  matches: (detail: Record<string, unknown>) => boolean,
): EventCondition => ({
  events: `e2e:multimodal:${event}`,
  predicate: (e) => matches((e.detail ?? {}) as Record<string, unknown>),
});

/**
 * Shared user-facing episode interactions for modal and Explorer MCAP hosts.
 * A step's effects (readouts, raw values, logs, pixels) are awaited through
 * {@link EpisodePom.after} with the conditions below, then read once.
 */
export class EpisodePom {
  readonly assert: EpisodeAsserter;
  readonly shell: Locator;
  readonly state: Locator;
  private inspectedStream: string | null = null;

  constructor(
    private readonly page: Page,
    readonly scope: Locator,
    private readonly eventUtils: EventUtils,
  ) {
    this.assert = new EpisodeAsserter();
    this.shell = scope.locator("[data-episode-playback-shell]");
    this.state = byDataTestId(scope, "episode-modal-state");
  }

  /**
   * Run `action` and resolve on the rendered frame of the modal 3D canvas
   * that drew the point cloud captured at `drawn.at` (a UTC playhead time).
   */
  async afterPointCloudFrame<T>(
    drawn: { at: string; pointCount: number; pointSize: number },
    action: () => Promise<T>,
  ): Promise<T> {
    const contentTimeNs = utcDateTimeToNanoseconds(drawn.at);
    return this.eventUtils.after(
      "e2e:multimodal:point-cloud-frame-rendered",
      action,
      (event) => {
        const detail = event.detail as PointCloudFrameDetail;
        return (
          detail.surface === "modal-3d" &&
          detail.contentTimesNs === contentTimeNs &&
          detail.renderedPointCount === drawn.pointCount &&
          detail.pointSize === drawn.pointSize
        );
      },
    );
  }

  /**
   * Run `action` and resolve on the rendered frame of the image tile that
   * drew the image captured at `drawn.at` with `drawn.projectedStreams`
   * point-cloud projections, at `drawn.pointSize` when given.
   */
  async afterImageFrame<T>(
    drawn: { at: string; projectedStreams: number; pointSize?: number },
    action: () => Promise<T>,
  ): Promise<T> {
    const contentTimeNs = utcDateTimeToNanoseconds(drawn.at);
    return this.eventUtils.after(
      "e2e:multimodal:image-frame-rendered",
      action,
      (event) => {
        const detail = event.detail as ImageFrameDetail;
        return (
          detail.imageContentTimeNs === contentTimeNs &&
          detail.projectedStreamCount === drawn.projectedStreams &&
          (drawn.pointSize === undefined ||
            detail.pointSize === drawn.pointSize)
        );
      },
    );
  }

  /** Run `action` and resolve once each of `conditions` is met because of it */
  async after<T>(
    conditions: readonly EventCondition[],
    action: () => Promise<T>,
  ): Promise<T> {
    return this.eventUtils.afterAll(conditions, action);
  }

  /** The episode shell for `fileName` has mounted (possibly still loading) */
  shellShown(fileName: string): EventCondition {
    return shown("episode-shell", (d) => d.fileName === fileName);
  }

  /** The episode for `fileName` is ready: no source swap is in flight */
  ready(fileName: string): EventCondition {
    return shown("episode-ready", (d) => d.fileName === fileName);
  }

  /** The playback state message reads `text` */
  stateShown(text: string): EventCondition {
    return shown("episode-state", (d) => d.text === text);
  }

  /** The UTC readout shows `time` */
  utcTime(time: string): EventCondition {
    return shown("utc-time", (d) => d.text === time);
  }

  /** The UTC readout shows a time other than `current` */
  utcTimeChanged(current: string | null): EventCondition {
    return shown("utc-time", (d) => d.text !== current);
  }

  /** The playhead readout shows `text` */
  playhead(text: string): EventCondition {
    return {
      events: "e2e:playback:playhead-time",
      predicate: (e) =>
        readout((e.detail as { label: string }).label) === readout(text),
    };
  }

  /** The raw tile for `stream` shows a newly settled record ("" for none) */
  raw(stream: string, validFrom?: string): EventCondition {
    const validFromNs =
      validFrom === undefined ? undefined : utcDateTimeToNanoseconds(validFrom);
    return shown(
      "raw-shown",
      (d) =>
        d.stream === stream &&
        (validFromNs === undefined || d.validFromNs === String(validFromNs)),
    );
  }

  /** The log console, in `mode`, shows each of `texts` */
  logs(texts: readonly string[], mode: "logs" | "diagnostics" = "logs") {
    return shown("log-rows", (d) => {
      const shownTexts = String(d.texts).split("\n");
      return (
        d.mode === mode && texts.every((text) => shownTexts.includes(text))
      );
    });
  }

  /** A tile's empty state shows `message` */
  tileEmpty(message: string | RegExp): EventCondition {
    return shown("tile-empty", (d) =>
      typeof message === "string"
        ? d.message === message
        : message.test(String(d.message)),
    );
  }

  /** The image tile titled `title` shows the frame it asked for */
  imageShown(title: string): EventCondition {
    return shown("image-shown", (d) => d.title === title);
  }

  get controls(): Locator {
    return byDataTestId(this.shell, "timeline-controls-root");
  }

  get timelineRuler(): Locator {
    return byDataTestId(this.shell, "timeline-ruler");
  }

  get timestampReadout(): Locator {
    return byDataTestId(this.shell, "episode-timestamp-readout");
  }

  get timestampButton(): Locator {
    return this.shell.getByRole("button", { name: "Copy log timestamp" });
  }

  get tileTitles(): Locator {
    return byDataTestId(this.shell, "tile-header-title");
  }

  get rawTree(): Locator {
    const root = this.inspectedStream
      ? this.tile(this.inspectedStream)
      : this.shell;
    return byDataTestId(root, "episode-raw-tree");
  }

  get rawMeta(): Locator {
    const root = this.inspectedStream
      ? this.tile(this.inspectedStream)
      : this.shell;
    return root.locator("[data-cy=episode-raw-meta]");
  }

  /**
   * Run `action` (opening or loading an episode) and resolve once `fileName`
   * is ready and each of `conditions` is met
   */
  async afterReady<T>(
    fileName: string,
    action: () => Promise<T>,
    conditions: readonly EventCondition[] = [],
  ): Promise<T> {
    return this.after([this.ready(fileName), ...conditions], action);
  }

  /**
   * Verifies useful episode topology is visible before source reads recover;
   * open it with {@link shellShown}
   */
  async expectWarmBootstrapShell(
    fileName: string,
    tileTitles: readonly string[],
  ): Promise<void> {
    expect(
      await this.scope.getByText(fileName, { exact: true }).isVisible(),
    ).toBe(true);
    await this.expectTileTitles(tileTitles);
    expect(
      await byDataTestId(this.scope, "episode-preparing-scaffold").isVisible(),
    ).toBe(false);
  }

  /** Page to the adjacent sample, `fileName`, once it and `conditions` are */
  async navigateDatasetSample(
    direction: "forward" | "backward",
    fileName: string,
    conditions: readonly EventCondition[] = [],
  ): Promise<void> {
    await this.blurActiveElement();
    await this.afterReady(
      fileName,
      () =>
        this.page.keyboard.press(
          direction === "forward" ? "ArrowRight" : "ArrowLeft",
        ),
      conditions,
    );
  }

  async applyEgoView(
    tileTitle: string,
  ): Promise<Readonly<Record<string, number>>> {
    const inputs = await this.openViewpointInputs(tileTitle);
    // the committed values, as the inputs reflect them in aria-valuenow
    const before = await this.readCameraPoseValues(inputs);
    await this.blurActiveElement();
    // one commit publishes the whole pose, and a valid pose can keep a
    // coordinate, so any coordinate changing means the new pose is in
    await this.eventUtils.after(
      "e2e:multimodal:camera-pose",
      () => this.page.keyboard.press("e"),
      (e) => {
        const pose = e.detail as Record<string, number>;
        return CAMERA_POSE_INPUT_NAMES.some(
          (name) => Math.abs(pose[name] - before[name]) >= 5e-7,
        );
      },
    );
    return this.readCameraPoseInputs(inputs);
  }

  async expectCameraPose(
    tileTitle: string,
    expected: Readonly<Record<string, number>>,
  ): Promise<void> {
    const matches = (pose: Readonly<Record<string, number>>) =>
      Object.entries(expected).every(
        ([name, value]) => Math.abs(pose[name] - value) < 5e-7,
      );
    // a navigation or reload restores the pose once the camera appears, on
    // its own; compared at 6-digit precision
    await this.eventUtils.untilState(
      "e2e:multimodal:camera-pose",
      async () =>
        matches(
          await this.readCameraPoseValues(
            await this.openViewpointInputs(tileTitle),
          ),
        ),
      (e) => matches(e.detail as Record<string, number>),
    );
  }

  async setSidebarToggle(
    tileTitle: string,
    accessibleName: string,
    checked: boolean,
  ): Promise<void> {
    await this.openTileSettings(tileTitle);
    const toggle = this.scope.getByRole("switch", {
      name: accessibleName,
      exact: true,
    });
    if ((await toggle.isChecked()) !== checked) await toggle.click();
    await this.expectSidebarToggle(tileTitle, accessibleName, checked);
  }

  async expectSidebarToggle(
    tileTitle: string,
    accessibleName: string,
    checked: boolean,
  ): Promise<void> {
    await this.openTileSettings(tileTitle);
    const toggle = this.scope.getByRole("switch", {
      name: accessibleName,
      exact: true,
    });
    // the setting renders from its store as the tile's settings open
    expect(await toggle.getAttribute("aria-checked")).toBe(String(checked));
  }

  /** Size the camera tile's projected points (a plain number input). */
  async setProjectionPointSize(tileTitle: string, size: number): Promise<void> {
    await this.openTileSettings(tileTitle);
    const input = this.scope.getByRole("spinbutton", {
      name: "Point size",
      exact: true,
    });
    await input.fill(String(size));
    expect(await input.inputValue()).toBe(String(size));
  }

  async setSidebarNumber(
    tileTitle: string,
    accessibleName: string,
    value: number,
  ): Promise<void> {
    await this.openTileSettings(tileTitle);
    const input = this.scope.getByRole("spinbutton", {
      name: accessibleName,
      exact: true,
    });
    await input.click();
    await input.fill(String(value));
    await input.press("Enter");
    await this.expectSidebarNumber(tileTitle, accessibleName, value);
  }

  async expectSidebarNumber(
    tileTitle: string,
    accessibleName: string,
    value: number,
  ): Promise<void> {
    await this.openTileSettings(tileTitle);
    const input = this.scope.getByRole("spinbutton", {
      name: accessibleName,
      exact: true,
    });
    expect(await input.getAttribute("aria-valuenow")).toBe(String(value));
  }

  /** The pose the inputs hold, as committed (aria-valuenow) */
  private async readCameraPoseValues(
    inputs: Locator,
  ): Promise<Readonly<Record<string, number>>> {
    const pose: Record<string, number> = {};
    for (const name of CAMERA_POSE_INPUT_NAMES) {
      pose[name] = Number(
        await inputs
          .getByRole("spinbutton", { name })
          .getAttribute("aria-valuenow"),
      );
    }
    return pose;
  }

  private async readCameraPoseInputs(
    inputs: Locator,
  ): Promise<Readonly<Record<string, number>>> {
    const pose: Record<string, number> = {};
    for (const name of CAMERA_POSE_INPUT_NAMES) {
      pose[name] = Number.parseFloat(
        await inputs.getByRole("spinbutton", { name }).inputValue(),
      );
    }
    return pose;
  }

  private async openViewpointInputs(tileTitle: string): Promise<Locator> {
    await this.openTileSettings(tileTitle);
    const viewpoint = this.scope.getByRole("button", { name: /^Viewpoint/ });
    if ((await viewpoint.getAttribute("aria-expanded")) !== "true") {
      await viewpoint.click();
    }
    expect(await viewpoint.getAttribute("aria-expanded")).toBe("true");
    return this.scope;
  }

  private async openTileSettings(tileTitle: string): Promise<void> {
    await this.tileTitle(tileTitle).first().click();
    await this.scope.getByRole("tab", { name: tileTitle, exact: true }).click();
  }

  async expectFileName(fileName: string): Promise<void> {
    expect(
      await this.scope.getByText(fileName, { exact: true }).isVisible(),
    ).toBe(true);
  }

  async expectTileTitles(
    present: readonly string[],
    absent: readonly string[] = [],
  ): Promise<void> {
    for (const title of present) {
      expect(await this.tileTitle(title).first().isVisible()).toBe(true);
    }
    for (const title of absent) {
      expect(await this.tileTitle(title).count()).toBe(0);
    }
  }

  async expectTileTitleCount(title: string, count: number): Promise<void> {
    expect(await this.tileTitle(title).count()).toBe(count);
  }

  async addTile(type: string, title: string): Promise<void> {
    await this.shell
      .getByRole("button", { name: "Layout", exact: true })
      .click();
    // the layout adds the tile, and its header, in the click's render
    await this.page.locator(`[data-testid="episode-add-tile-${type}"]`).click();
    expect(await this.tileTitle(title).count()).toBeGreaterThan(0);
  }

  async selectMessageSource(
    currentTitle: string,
    nextTitle: string,
  ): Promise<void> {
    await this.openTileSettings(currentTitle);
    const source = this.scope.getByRole("radio", {
      name: nextTitle,
      exact: true,
    });
    await this.after([this.raw(nextTitle)], () => source.check());
    this.inspectedStream = nextTitle;
  }

  async closeTile(title: string): Promise<void> {
    const initial = await this.tileTitle(title).count();
    if (initial === 0) {
      throw new Error(`No episode tile with title: ${title}`);
    }
    const remaining = initial - 1;
    await this.tile(title)
      .first()
      .getByRole("button", { name: "Close", exact: true })
      .click();
    expect(await this.tileTitle(title).count()).toBe(remaining);
    if (remaining === 0 && this.inspectedStream === title) {
      this.inspectedStream = null;
    }
  }

  async fullscreenTile(title: string): Promise<void> {
    await this.tile(title)
      .first()
      .getByRole("button", { name: "Fullscreen", exact: true })
      .click();
    await this.expectTileFullscreen(title);
  }

  /** Leave fullscreen; the layout swaps the button in the click's render */
  async exitTileFullscreen(title: string): Promise<void> {
    const tile = this.tile(title).first();
    await tile
      .getByRole("button", { name: "Exit fullscreen", exact: true })
      .click();
    expect(
      await tile
        .getByRole("button", { name: "Fullscreen", exact: true })
        .count(),
    ).toBe(1);
  }

  async expectTileFullscreen(title: string): Promise<void> {
    expect(
      await this.tile(title)
        .first()
        .getByRole("button", { name: "Exit fullscreen", exact: true })
        .count(),
    ).toBe(1);
  }

  async expectTileCount(count: number): Promise<void> {
    expect(await this.shell.locator(".mosaic-window").count()).toBe(count);
  }

  tile(title: string): Locator {
    return this.shell.locator(".mosaic-window").filter({
      has: this.page
        .locator('[data-testid="tile-header-title"]')
        .filter({ hasText: exactText(title) }),
    });
  }

  image(title: string): Locator {
    return this.tile(title).getByRole("img", { name: "Image" });
  }

  async selectImageSource(
    currentTitle: string,
    nextTitle: string,
  ): Promise<void> {
    await this.tileTitle(currentTitle).first().click();
    await this.scope.locator('[aria-label="Source"]').click();
    await this.after([this.imageShown(nextTitle)], () =>
      this.page.getByRole("option", { name: nextTitle, exact: true }).click(),
    );
  }

  async expectPaused(): Promise<void> {
    expect(
      await this.shell
        .getByRole("button", { name: "Play", exact: true })
        .count(),
    ).toBe(1);
    expect(
      await this.shell
        .getByRole("button", { name: "Pause", exact: true })
        .count(),
    ).toBe(0);
  }

  async expectTileEmpty(
    title: string,
    message: string | RegExp,
  ): Promise<void> {
    const tile = this.tile(title);
    const empty = byDataTestId(tile, "episode-tile-empty-state");
    expect(await empty.filter({ hasText: message }).count()).toBe(1);
    expect(await this.image(title).count()).toBe(0);
  }

  async expectPlayhead(text: string): Promise<void> {
    const shownText = await byDataTestId(
      this.controls,
      "timeline-playhead-time",
    ).textContent();
    expect(readout(shownText ?? "")).toBe(readout(text));
  }

  async expectUtcTime(time: string): Promise<void> {
    expect(await this.timestampButton.textContent()).toBe(time);
    const timezone = byDataTestId(
      this.timestampReadout,
      "episode-timezone-picker",
    ).getByRole("combobox");
    expect(await timezone.inputValue()).toBe("UTC");
  }

  /**
   * Run `seek` (a seek or scrub toward `time`) and check it lands on `time`,
   * or at most `maxStepMs` before it and one step forward reaches it: a seek
   * snaps to the sampling grid, which may sit just before the target
   */
  async seekToUtcTime(
    time: string,
    maxStepMs: number,
    seek: () => Promise<unknown>,
    conditions: readonly EventCondition[] = [],
  ): Promise<void> {
    const targetMs = utcDateTimeToMilliseconds(time);
    if (targetMs === null) {
      throw new Error(`invalid UTC episode timestamp: ${time}`);
    }
    const inRange = (text: string | null) => {
      const currentMs = text ? utcDateTimeToMilliseconds(text) : null;
      if (currentMs === null) return false;
      const delta = targetMs - currentMs;
      return delta >= 0 && delta <= maxStepMs;
    };

    // a coarse ruler seek can land on the time already shown, which moves
    // nothing; only a seek that moved the playhead re-renders the readout
    const before = await this.timestampButton.textContent();
    const changed = this.utcTimeChanged(before);
    const readout = await this.eventUtils.arm(
      changed.events,
      changed.predicate,
    );
    try {
      let moved = true;
      await this.after(
        [
          {
            events: "e2e:playback:seek-applied",
            predicate: (e) => {
              moved = (e.detail as { moved: boolean }).moved;
              return true;
            },
          },
          ...conditions,
        ],
        seek,
      );
      if (moved) await readout.received;
    } finally {
      await readout.dispose();
    }
    const current = await this.timestampButton.textContent();
    expect(
      inRange(current),
      `readout ${current} should be within ${maxStepMs}ms before ${time}`,
    ).toBe(true);
    if (current !== time) {
      await this.after([this.utcTime(time)], () => this.stepForward());
    }
    await this.expectUtcTime(time);
  }

  async expectNoUtcTime(): Promise<void> {
    expect(await this.timestampReadout.count()).toBe(0);
  }

  async stepForward(): Promise<void> {
    await this.shell.getByRole("button", { name: "Step forward" }).click();
  }

  async stepBack(): Promise<void> {
    await this.shell.getByRole("button", { name: "Step back" }).click();
  }

  async setSamplingRate(rateHz: number): Promise<void> {
    await this.scope.getByRole("tab", { name: "Scene", exact: true }).click();
    const playback = this.scope.getByRole("button", { name: /Playback/ });
    if ((await playback.getAttribute("aria-expanded")) !== "true") {
      await playback.click();
    }
    const preset = this.scope.getByRole("combobox", {
      name: "Data sampling preset",
    });
    const customRate = this.scope.getByRole("spinbutton", {
      name: "Custom data sampling rate",
    });
    if (!(await preset.inputValue()).startsWith("Custom")) {
      // choose by keyboard: focus stays on the input, so the list (which
      // opens on focus) closes on the choice instead of reopening
      await preset.click();
      await preset.press("End");
      await preset.press("Enter");
    }
    await customRate.click();
    await customRate.fill(String(rateHz));
    await customRate.press("Enter");
    await this.eventUtils.after(
      "e2e:multimodal:sampling-rate",
      () =>
        this.scope.getByRole("button", { name: "Apply sampling rate" }).click(),
      (e) => (e.detail as { rateHz: number }).rateHz === rateHz,
    );
    await playback.click();
    expect(await playback.textContent()).toContain(`Custom · ${rateHz} Hz`);
  }

  async seekToFraction(fraction: number): Promise<void> {
    if (fraction < 0 || fraction > 1) {
      throw new Error("timeline fraction must be between zero and one");
    }
    const box = await this.timelineLaneBox();
    const laneOffset = fraction === 1 ? box.width - 0.01 : box.width * fraction;
    await this.page.mouse.click(box.x + laneOffset, box.y + box.height / 2);
  }

  async scrubToFraction(fraction: number): Promise<void> {
    if (fraction < 0 || fraction > 1) {
      throw new Error("timeline fraction must be between zero and one");
    }
    const box = await this.timelineLaneBox();
    const y = box.y + box.height / 2;
    const handle = await byDataTestId(
      this.timelineRuler,
      "timeline-playhead-handle",
    ).boundingBox();
    if (!handle) throw new Error("timeline playhead handle has no layout box");
    await this.page.mouse.move(
      handle.x + handle.width / 2,
      handle.y + handle.height / 2,
    );
    await this.page.mouse.down();
    await this.page.mouse.move(box.x + box.width * fraction, y, { steps: 8 });
    await this.page.mouse.up();
  }

  private async timelineLaneBox(): Promise<{
    readonly height: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  }> {
    const ruler = await this.timelineRuler.boundingBox();
    if (!ruler) throw new Error("timeline ruler has no layout box");
    const spacerLocator = byDataTestId(
      this.timelineRuler,
      "timeline-ruler-label-spacer",
    );
    const spacer = (await spacerLocator.count())
      ? await spacerLocator.boundingBox()
      : null;
    const labelWidth = spacer?.width ?? 0;
    return {
      height: ruler.height,
      width: ruler.width - labelWidth,
      x: ruler.x + labelWidth,
      y: ruler.y,
    };
  }

  async openStreams(): Promise<void> {
    await this.scope.getByRole("tab", { name: "Topics", exact: true }).click();
  }

  async expectStreams(
    present: readonly string[],
    absent: readonly string[] = [],
  ): Promise<void> {
    await this.openStreams();
    const inspect = (stream: string) =>
      this.scope.getByRole("button", {
        name: `Inspect ${stream}`,
        exact: true,
      });
    for (const stream of present) {
      expect(await inspect(stream).isVisible()).toBe(true);
    }
    for (const stream of absent) {
      expect(await inspect(stream).count()).toBe(0);
    }
  }

  /** A raw tile has lost its stream; wait with {@link raw}("") first */
  async expectRawSelectionCleared(): Promise<void> {
    const clearedTile = this.shell
      .locator("[data-cy=episode-raw-tile]")
      .filter({ hasText: "Choose a stream in the panel settings" });
    expect(await clearedTile.count()).toBe(1);
    expect(await byDataTestId(clearedTile, "episode-raw-tree").count()).toBe(0);
  }

  async inspectStream(stream: string): Promise<void> {
    await this.openStreams();
    // an episode's layout restores its raw tiles, and inspecting a stream
    // already shown only focuses its tile, which sends nothing
    if (
      (await byDataTestId(this.tile(stream), "episode-raw-tree").count()) > 0
    ) {
      this.inspectedStream = stream;
      return;
    }
    await this.after([this.raw(stream)], () =>
      this.scope
        .getByRole("button", { name: "Inspect " + stream, exact: true })
        .click(),
    );
    this.inspectedStream = stream;
  }

  /** Read from the raw tile already showing `stream` */
  focusRawTile(stream: string): void {
    this.inspectedStream = stream;
  }

  rawField(path: string): Locator {
    return byDataTestId(this.rawTree, "episode-raw-node-" + path);
  }

  async expectRawField(
    path: string,
    value: number | string | RegExp,
  ): Promise<void> {
    const segments = path.split(".");
    for (let depth = 1; depth < segments.length; depth++) {
      const parentPath = segments.slice(0, depth).join(".");
      const toggle = byDataTestId(
        this.rawTree,
        "episode-raw-toggle-" + parentPath,
      );
      if (
        (await toggle.count()) > 0 &&
        (await toggle.getAttribute("aria-expanded")) === "false"
      ) {
        await toggle.click();
      }
    }
    const renderedValue = this.rawField(path).locator("span").last();
    const expected =
      typeof value === "number"
        ? String(value)
        : typeof value === "string"
          ? JSON.stringify(value)
          : value;
    const text = (await renderedValue.textContent()) ?? "";
    if (typeof expected === "string") {
      expect(text).toBe(expected);
    } else {
      expect(text).toMatch(expected);
    }
  }

  async expectRawMeta(value: string | RegExp): Promise<void> {
    const text = (await this.rawMeta.textContent()) ?? "";
    if (typeof value === "string") {
      expect(text).toContain(value);
    } else {
      expect(text).toMatch(value);
    }
  }

  async expectLogs(
    present: readonly string[],
    absent: readonly string[] = [],
  ): Promise<void> {
    await this.expectConsoleRows("Logs", present, absent);
  }

  async expectDiagnostics(
    present: readonly string[],
    absent: readonly string[] = [],
  ): Promise<void> {
    await this.expectConsoleRows("Diagnostics", present, absent);
  }

  private async expectConsoleRows(
    view: "Diagnostics" | "Logs",
    present: readonly string[],
    absent: readonly string[],
  ): Promise<void> {
    const logs = this.tile("Logs / Diagnostics");
    await logs.getByRole("button", { name: "Fullscreen", exact: true }).click();
    const viewButton = logs.getByRole("button", { name: view, exact: true });
    // switching the view renders its rows; a view already showing had its
    // rows waited on by the step that loaded them
    if ((await viewButton.getAttribute("aria-pressed")) !== "true") {
      await this.after(
        [this.logs(present, view === "Logs" ? "logs" : "diagnostics")],
        () => viewButton.click(),
      );
    }
    for (const text of present) {
      expect(
        await logs.getByText(text, { exact: true }).first().isVisible(),
      ).toBe(true);
    }
    for (const text of absent) {
      expect(await logs.getByText(text, { exact: true }).count()).toBe(0);
    }
    await logs
      .getByRole("button", { name: "Exit fullscreen", exact: true })
      .click();
  }

  async expectLog(text: string): Promise<void> {
    await this.expectLogs([text]);
  }

  /** The unsupported-recording message; open with {@link stateShown} */
  async expectUnsupported(streamCount = 1): Promise<void> {
    expect(
      await this.state
        .getByText(unsupportedText(streamCount), { exact: true })
        .isVisible(),
    ).toBe(true);
  }

  async expectNoViewerError(): Promise<void> {
    expect(await this.scope.getByText(/Failed to read recording/).count()).toBe(
      0,
    );
    expect(await this.scope.locator("[data-cy=error-boundary]").count()).toBe(
      0,
    );
  }

  private tileTitle(title: string): Locator {
    return this.tileTitles.filter({ hasText: exactText(title) });
  }

  private async blurActiveElement(): Promise<void> {
    await this.page.evaluate(() =>
      (document.activeElement as HTMLElement | null)?.blur(),
    );
  }
}

class EpisodeAsserter {
  /**
   * One capture of `target`'s area showing only the episode shell's canvases.
   * A page clip, since the style hides `target` itself and an element capture
   * waits for it to be visible.
   */
  async hasCanvasScreenshot(target: Locator, name: string): Promise<void> {
    const clip = await target.boundingBox();
    expect(clip).not.toBeNull();
    expect(
      await target.page().screenshot({ clip: clip!, style: CANVAS_ONLY_STYLE }),
    ).toMatchSnapshot(name, { maxDiffPixelRatio: 0, threshold: 0 });
  }
}

const CAMERA_POSE_INPUT_NAMES = [
  "Position X",
  "Position Y",
  "Position Z",
  "Target X",
  "Target Y",
  "Target Z",
] as const;

/** The playback state message for a recording with nothing to preview */
export const unsupportedText = (streamCount: number) =>
  `No previewable streams in this recording (${streamCount} streams found)`;

function byDataTestId(root: Locator, id: string): Locator {
  return root.locator('[data-testid="' + id + '"]');
}

function utcDateTimeToNanoseconds(value: string): string {
  const milliseconds = utcDateTimeToMilliseconds(value);
  if (milliseconds === null) throw new Error(`Not a UTC date-time: ${value}`);
  return (BigInt(milliseconds) * 1_000_000n).toString();
}

function utcDateTimeToMilliseconds(value: string): number | null {
  const match =
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d{3})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hours, minutes, seconds, milliseconds] = match;
  return Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
    Number(seconds),
    Number(milliseconds),
  );
}
