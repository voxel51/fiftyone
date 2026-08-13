import { Locator, Page, expect } from "src/oss/fixtures";
import { Duration } from "src/oss/utils";

const READY_TIMEOUT = Duration.Seconds(30);

/** Shared user-facing episode interactions for modal and Explorer MCAP hosts. */
export class EpisodePom {
  readonly shell: Locator;
  readonly state: Locator;
  private inspectedStream: string | null = null;

  constructor(
    private readonly page: Page,
    readonly scope: Locator,
  ) {
    this.shell = scope.locator("[data-episode-playback-shell]");
    this.state = byDataTestId(scope, "episode-modal-state");
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

  async waitForReady(fileName: string): Promise<void> {
    await expect(this.shell).toBeVisible({ timeout: READY_TIMEOUT });
    await expect(this.scope.getByText(fileName, { exact: true })).toBeVisible({
      timeout: READY_TIMEOUT,
    });
    await expect
      .poll(
        () => this.shell.getAttribute("data-episode-source-transitioning"),
        {
          timeout: READY_TIMEOUT,
        },
      )
      .toBeNull();
    await expect(
      byDataTestId(this.scope, "episode-preparing-scaffold"),
    ).toBeHidden();
  }

  async navigateDatasetSample(
    direction: "forward" | "backward",
    fileName: string,
  ): Promise<void> {
    await this.blurActiveElement();
    await this.page.keyboard.press(
      direction === "forward" ? "ArrowRight" : "ArrowLeft",
    );
    await this.waitForReady(fileName);
  }

  async applyEgoView(
    tileTitle: string,
  ): Promise<Readonly<Record<string, number>>> {
    const inputs = await this.openViewpointInputs(tileTitle);
    const previousPose = await this.readCameraPoseInputs(inputs);
    await this.blurActiveElement();
    await this.page.keyboard.press("e");
    await expect
      .poll(() => this.readCameraPoseInputs(inputs), {
        timeout: READY_TIMEOUT,
      })
      .not.toEqual(previousPose);
    return this.readCameraPoseInputs(inputs);
  }

  async expectCameraPose(
    tileTitle: string,
    expected: Readonly<Record<string, number>>,
  ): Promise<void> {
    const inputs = await this.openViewpointInputs(tileTitle);
    for (const [name, value] of Object.entries(expected)) {
      const input = inputs.getByRole("spinbutton", { name });
      await expect
        .poll(() => input.inputValue().then(Number.parseFloat), {
          timeout: READY_TIMEOUT,
        })
        .toBeCloseTo(value, 6);
    }
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
    await this.tileTitle(tileTitle).click();
    const panelTab = this.scope.getByRole("tab", {
      name: tileTitle,
      exact: true,
    });
    await expect(panelTab).toBeVisible({ timeout: READY_TIMEOUT });
    await panelTab.click();

    const viewpoint = this.scope.getByRole("button", { name: /^Viewpoint/ });
    if ((await viewpoint.getAttribute("aria-expanded")) !== "true") {
      await viewpoint.click();
    }
    await expect(viewpoint).toHaveAttribute("aria-expanded", "true");
    return this.scope;
  }

  async expectFileName(fileName: string): Promise<void> {
    await expect(this.scope.getByText(fileName, { exact: true })).toBeVisible();
  }

  async expectTileTitles(
    present: readonly string[],
    absent: readonly string[] = [],
  ): Promise<void> {
    for (const title of present) {
      await expect(this.tileTitle(title).first()).toBeVisible();
    }
    for (const title of absent) {
      await expect(this.tileTitle(title)).toHaveCount(0);
    }
  }

  async expectTileTitleCount(title: string, count: number): Promise<void> {
    await expect(this.tileTitle(title)).toHaveCount(count);
  }

  async addTile(type: string, title: string): Promise<void> {
    await this.shell
      .getByRole("button", { name: "Layout", exact: true })
      .click();
    await this.page.locator(`[data-testid="episode-add-tile-${type}"]`).click();
    await expect(this.tileTitle(title)).toBeVisible({ timeout: READY_TIMEOUT });
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
    const source = this.scope.locator('[aria-label="Source"]');
    await expect(source).toBeVisible({ timeout: READY_TIMEOUT });
    await source.click();
    await this.page
      .getByRole("option", { name: nextTitle, exact: true })
      .click();
    await expect(this.tileTitle(nextTitle).first()).toBeVisible({
      timeout: READY_TIMEOUT,
    });
  }

  async expectPaused(): Promise<void> {
    await expect(
      this.shell.getByRole("button", { name: "Play", exact: true }),
    ).toBeVisible({ timeout: READY_TIMEOUT });
    await expect(
      this.shell.getByRole("button", { name: "Pause", exact: true }),
    ).toHaveCount(0);
  }

  async expectTileEmpty(
    title: string,
    message: string | RegExp,
  ): Promise<void> {
    const tile = this.tile(title);
    const empty = byDataTestId(tile, "episode-tile-empty-state");
    await expect(empty).toContainText(message, { timeout: READY_TIMEOUT });
    await expect(this.image(title)).toHaveCount(0);
  }

  async expectPlayhead(text: string): Promise<void> {
    await expect(this.controls.getByText(text, { exact: true })).toBeVisible({
      timeout: READY_TIMEOUT,
    });
  }

  async expectUtcTime(time: string): Promise<void> {
    await expect(this.timestampButton).toHaveText(time, {
      timeout: READY_TIMEOUT,
    });
    const timezone = byDataTestId(
      this.timestampReadout,
      "episode-timezone-picker",
    ).getByRole("combobox");
    await expect(timezone).toHaveValue("UTC");
  }

  async expectUtcTimeAfterAtMostOneForwardStep(
    time: string,
    maxStepMs: number,
  ): Promise<void> {
    const targetMs = utcDateTimeToMilliseconds(time);
    if (targetMs === null) {
      throw new Error(`invalid UTC episode timestamp: ${time}`);
    }
    await expect
      .poll(
        async () => {
          const current = await this.timestampButton.textContent();
          if (!current) return false;
          const currentMs = utcDateTimeToMilliseconds(current);
          if (currentMs === null) return false;
          const delta = targetMs - currentMs;
          return delta >= 0 && delta <= maxStepMs;
        },
        { timeout: READY_TIMEOUT },
      )
      .toBe(true);
    if ((await this.timestampButton.textContent()) !== time) {
      await this.stepForward();
    }
    await this.expectUtcTime(time);
  }

  async expectNoUtcTime(): Promise<void> {
    await expect(this.timestampReadout).toHaveCount(0);
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
    if (!(await preset.inputValue()).startsWith("Custom")) {
      await preset.click();
      const customOption = this.page.getByRole("option", {
        name: "Custom…",
        exact: true,
      });
      await customOption.click();
      // The portalled select may retain focus after its state changes. Close
      // it explicitly before interacting with the number field underneath.
      await this.page.keyboard.press("Escape");
      await expect(customOption).toBeHidden();
    }
    const customRate = this.scope.getByRole("spinbutton", {
      name: "Custom data sampling rate",
    });
    await customRate.click();
    await customRate.fill(String(rateHz));
    await customRate.press("Enter");
    await this.scope
      .getByRole("button", { name: "Apply sampling rate" })
      .click();
    await playback.click();
    await expect(playback).toContainText(`Custom · ${rateHz} Hz`, {
      timeout: READY_TIMEOUT,
    });
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
    for (const stream of present) {
      await expect(
        this.scope.getByRole("button", {
          name: `Inspect ${stream}`,
          exact: true,
        }),
      ).toBeVisible();
    }
    for (const stream of absent) {
      await expect(
        this.scope.getByRole("button", {
          name: `Inspect ${stream}`,
          exact: true,
        }),
      ).toHaveCount(0);
    }
  }

  async expectRawSelectionCleared(): Promise<void> {
    const clearedTile = this.shell
      .locator("[data-cy=episode-raw-tile]")
      .filter({ hasText: "Choose a stream in the panel settings" });
    await expect(clearedTile).toBeVisible({ timeout: READY_TIMEOUT });
    await expect(byDataTestId(clearedTile, "episode-raw-tree")).toHaveCount(0);
  }

  async inspectStream(stream: string): Promise<void> {
    await this.openStreams();
    await this.scope
      .getByRole("button", { name: "Inspect " + stream, exact: true })
      .click();
    this.inspectedStream = stream;
    await expect(this.rawTree).toBeVisible({ timeout: READY_TIMEOUT });
  }

  async focusRawTile(stream: string): Promise<void> {
    this.inspectedStream = stream;
    await expect(this.rawTree).toBeVisible({ timeout: READY_TIMEOUT });
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
    await expect(renderedValue).toHaveText(expected, {
      timeout: READY_TIMEOUT,
    });
  }

  async expectRawMeta(value: string | RegExp): Promise<void> {
    await expect(this.rawMeta).toContainText(value, { timeout: READY_TIMEOUT });
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
    await logs.getByRole("button", { name: view, exact: true }).click();
    for (const text of present) {
      await expect(logs.getByText(text, { exact: true })).toBeVisible({
        timeout: READY_TIMEOUT,
      });
    }
    for (const text of absent) {
      await expect(logs.getByText(text, { exact: true })).toHaveCount(0);
    }
    await logs
      .getByRole("button", { name: "Exit fullscreen", exact: true })
      .click();
  }

  async expectLog(text: string): Promise<void> {
    await this.expectLogs([text]);
  }

  async expectUnsupported(streamCount = 1): Promise<void> {
    await expect(
      this.state.getByText(
        "No previewable streams in this recording (" +
          streamCount +
          " streams found)",
        { exact: true },
      ),
    ).toBeVisible({ timeout: READY_TIMEOUT });
  }

  async expectNoViewerError(): Promise<void> {
    await expect(this.scope.getByText(/Failed to read recording/)).toHaveCount(
      0,
    );
    await expect(this.scope.locator("[data-cy=error-boundary]")).toHaveCount(0);
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

const CAMERA_POSE_INPUT_NAMES = [
  "Position X",
  "Position Y",
  "Position Z",
  "Target X",
  "Target Y",
  "Target Z",
] as const;

function byDataTestId(root: Locator, id: string): Locator {
  return root.locator('[data-testid="' + id + '"]');
}

function exactText(value: string): RegExp {
  return new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
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
