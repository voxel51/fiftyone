import { Locator, Page, expect } from "src/oss/fixtures";
import { expectScreenshot } from "src/oss/utils/screenshot";
import { ArmedEvent, EventUtils } from "src/shared/event-utils";
import { GridActionsRowPom } from "../action-row/grid-actions-row";
import { GridSliceSelectorPom } from "../action-row/grid-slice-selector";
import { GridTaggerPom } from "../action-row/tagger/grid-tagger";
import { UrlPom } from "../url";

/**
 * A grid tile is either a looker or a custom renderer (e.g. multimodal).
 * Sample-level operations address tiles; looker-specific accessors exist only
 * for looker internals (canvas screenshots, looker checkbox markup).
 */
const TILE_SELECTOR = "[data-cy=looker], [data-cy=grid-custom-renderer]";
const CUSTOM_RENDERER_TEST_ID = "grid-custom-renderer";
const LANE_SHOWN = "e2e:multimodal:grid-lane-shown";
const TILE_DRAWN = "e2e:looker:canvas-loaded";
const TILES_UPDATED = "e2e:grid:tiles-updated";
const GRID_UNMOUNT = "e2e:grid:unmount";
const GRID_MOUNT = "e2e:grid:mount";
const COUNT_SHOWN = "e2e:components:entry-count-shown";

type TileDraw = {
  sampleFilepath: string;
  sampleId: string;
  labelsPending: boolean;
  mediaPending: boolean;
  labels: string;
};

/** A draw no later draw changes: its media and labels have all painted */
export const isSettledDraw = (detail: unknown) => {
  const draw = detail as TileDraw;
  return !draw.labelsPending && !draw.mediaPending;
};

/** Each tile's drawn labels (sorted `field:label` pairs), by file name */
export type TileLabels = Record<string, string[]>;

/**
 * Track tiles' latest draws: settled once `tiles` tiles have drawn and none
 * has media, a reload or label painting still to draw
 */
class TileDraws {
  private readonly latest = new Map<string, TileDraw>();

  add(detail: unknown) {
    const draw = detail as TileDraw;
    this.latest.set(draw.sampleFilepath.split("/").pop() ?? "", draw);
  }

  clear() {
    this.latest.clear();
  }

  settled(tiles: number | null) {
    return (
      tiles !== null &&
      this.latest.size === tiles &&
      [...this.latest.values()].every(isSettledDraw)
    );
  }

  labels(): TileLabels {
    return Object.fromEntries(
      [...this.latest].map(([file, { labels }]) => [
        file,
        labels ? labels.split(",") : [],
      ]),
    );
  }
}

/** A lane showing exactly `marks` marks, all of them temporal tags */
const isTemporalTagLane = (detail: unknown, marks: number) => {
  const lane = detail as { marks: number; sources: string };
  return lane.marks === marks && lane.sources === "fiftyone:temporal-tags";
};

export class GridPom {
  readonly assert: GridAsserter;
  readonly actionsRow: GridActionsRowPom;
  readonly sliceSelector: GridSliceSelectorPom;
  readonly tagger: GridTaggerPom;
  readonly url: UrlPom;

  readonly locator: Locator;

  constructor(
    public readonly page: Page,
    private readonly eventUtils: EventUtils,
  ) {
    this.assert = new GridAsserter(this);
    this.url = new UrlPom(page, eventUtils);
    this.actionsRow = new GridActionsRowPom(page);
    this.sliceSelector = new GridSliceSelectorPom(page);
    this.tagger = new GridTaggerPom(page);

    this.locator = page.getByTestId("fo-grid");
  }

  getBackwardSection() {
    return this.locator.getByTestId("spotlight-section-backward");
  }

  getForwardSection() {
    return this.locator.getByTestId("spotlight-section-forward");
  }

  getNthTile(n: number) {
    return this.locator.locator(TILE_SELECTOR).nth(n);
  }

  getNthLooker(n: number) {
    return this.locator.getByTestId("looker").nth(n);
  }

  private async isCustomRendererTile(tile: Locator) {
    return (await tile.getAttribute("data-cy")) === CUSTOM_RENDERER_TEST_ID;
  }

  async getNthCheckbox(n: number) {
    return this.getNthLooker(n).getByTestId("looker-checkbox-input-");
  }

  async toggleSelectNthSample(n: number) {
    const tile = this.getNthTile(n);
    if (await this.isCustomRendererTile(tile)) {
      // the selection checkbox is revealed in the tile's top selection region
      await tile.hover({ position: { x: 10, y: 5 } });
      await tile.locator("[data-fo-selection-checkbox]").click();
      return;
    }
    await tile.click({ position: { x: 10, y: 5 } });
  }

  async toggleSelectFirstSample() {
    await this.toggleSelectNthSample(0);
  }

  async addNthSampleToBucket(n: number, bucketName: string) {
    const tile = this.getNthTile(n);
    const box = await tile.boundingBox();
    if (!box) throw new Error(`grid tile ${n} has no bounds`);
    // Bucket chips appear when hovering near the tile's top edge.
    await tile.hover({
      position: { x: box.width / 2, y: Math.min(20, box.height / 8) },
    });
    await this.page
      .getByRole("button", { name: `Add to ${bucketName}` })
      .click();
  }

  async openNthSample(n: number) {
    const tile = this.getNthTile(n);
    if (await this.isCustomRendererTile(tile)) {
      // Hover reveals whatever affordances the tile only shows on hover.
      await tile.hover();
      // Only a renderer whose own surface consumes the click offers an explicit
      // open button — a point-cloud preview orbits its camera on drag, so it
      // suppresses grid activation and needs one. Every other custom-rendered
      // tile opens by being clicked, the same as an ordinary looker.
      const openButton = tile.getByRole("button", {
        name: "Open sample modal",
      });
      if ((await openButton.count()) > 0) {
        await openButton.click();
        return;
      }
    }
    await tile.click({ position: { x: 10, y: 80 } });
  }

  async openFirstSample() {
    return this.openNthSample(0);
  }

  /**
   * Temporal-tag marks drawn on the tiles' interval lanes. One per interval on
   * a tagged sample; tiles whose sample carries no tag draw no lane at all.
   */
  temporalTagMarks(): Locator {
    return this.page.locator(
      '[data-testid="episode-grid-overlay"] [data-source="fiftyone:temporal-tags"]',
    );
  }

  async temporalTagMarkCount(): Promise<number> {
    return this.temporalTagMarks().count();
  }

  /**
   * Run `action` and resolve once a tile's interval lane draws `marks`
   * temporal-tag marks because of it
   */
  async afterTemporalTagMarks<T>(
    marks: number,
    action: () => Promise<T>,
  ): Promise<T> {
    return this.eventUtils.after(LANE_SHOWN, action, (e) =>
      isTemporalTagLane(e.detail, marks),
    );
  }

  /**
   * Resolve once a tile's interval lane has drawn `marks` temporal-tag marks,
   * which it does on its own as the page loads
   */
  async untilTemporalTagMarks(marks: number) {
    await this.eventUtils.untilState(
      LANE_SHOWN,
      async () =>
        (await this.eventUtils.recorded(LANE_SHOWN)).some((detail) =>
          isTemporalTagLane(detail, marks),
        ),
      (e) => isTemporalTagLane(e.detail, marks),
    );
  }

  /**
   * The first mark's position on its lane, as the percentages the lane lays it
   * out with — the tag's own time over the lane's time axis.
   */
  async temporalTagMarkGeometry(): Promise<{ left: number; width: number }> {
    const mark = this.temporalTagMarks().first();
    const [left, width] = await Promise.all([
      mark.evaluate((el) => Number.parseFloat((el as HTMLElement).style.left)),
      mark.evaluate((el) => Number.parseFloat((el as HTMLElement).style.width)),
    ]);

    return { left, width };
  }

  async getEntryCountText() {
    return this.page.getByTestId("entry-counts").textContent();
  }

  async scrollBottom() {
    return this.getForwardSection()
      .locator("div")
      .last()
      .scrollIntoViewIfNeeded();
  }

  async scrollTop() {
    return this.getBackwardSection()
      .locator("div")
      .first()
      .scrollIntoViewIfNeeded();
  }

  /** Reload the page, resolving once the reloaded grid has a tile ready */
  async reload() {
    await this.eventUtils.afterNavigation(
      [
        "e2e:looker:canvas-loaded",
        "e2e:looker:error-shown",
        "e2e:grid:custom-renderer-mounted",
      ],
      () => this.page.reload(),
    );
  }

  async selectSlice(slice: string) {
    if ((await this.sliceSelector.activeSlice()) === slice) return;

    // a slice change remounts the grid and recounts its entries
    await this.afterEntryCounts(() =>
      this.run(() => this.sliceSelector.selectSlice(slice)),
    );
  }

  /**
   * Install counters for grid lifecycle events at document start — arm
   * BEFORE navigating to the page. Counting from document start makes the
   * baseline exact: initial page load contributes one mount and no unmount,
   * and each grid refresh thereafter contributes one unmount and one mount.
   * Arming after load instead would race the initial mount event, which
   * dispatches from an effect and can land after the tiles are visible.
   */
  async armLifecycleCounters() {
    return {
      mounts: await this.eventUtils.initCounter("grid-mount"),
      unmounts: await this.eventUtils.initCounter("e2e:grid:unmount"),
    };
  }

  /**
   * Arm listeners for a full grid refresh (unmount then remount). Await the
   * arming BEFORE the action that refreshes the grid, then await the handle's
   * `received` after it.
   */
  private async armGridRefresh(): Promise<ArmedEvent> {
    // only the mount that follows the teardown counts; the old grid's own
    // mount can still be on its way when the action starts
    let unmounted = false;
    const unmount = await this.eventUtils.arm("e2e:grid:unmount", () => {
      unmounted = true;
      return true;
    });
    const mount = await this.eventUtils.arm("grid-mount", () => unmounted);
    return new ArmedEvent(
      Promise.all([unmount.received, mount.received]).then(
        (): void => undefined,
      ),
      async () => {
        await Promise.all([unmount.dispose(), mount.dispose()]);
      },
    );
  }

  /**
   * Resolve once the tile of `fileName` has settled a draw, which it does on
   * its own after the page loads. `fileName` must back only one tile, since
   * any tile of it resolves the wait
   */
  async untilTileDrawn(fileName: string) {
    const isTile = (detail: unknown) =>
      String(
        (detail as { sampleFilepath?: string } | undefined)?.sampleFilepath,
      ).endsWith(`/${fileName}`) && isSettledDraw(detail);
    await this.eventUtils.untilState(
      "e2e:looker:canvas-loaded",
      async () =>
        (await this.eventUtils.recorded("e2e:looker:canvas-loaded")).some(
          isTile,
        ),
      (e) => isTile(e.detail),
    );
  }

  /**
   * Run `action` and resolve once `count` distinct tiles' latest draws because
   * of it have settled
   */
  async afterTilesDrawn<T>(
    count: number,
    action: () => Promise<T>,
  ): Promise<T> {
    const settled = new Map<string, boolean>();
    return this.eventUtils.after("e2e:looker:canvas-loaded", action, (e) => {
      settled.set((e.detail as TileDraw).sampleId, isSettledDraw(e.detail));
      return [...settled.values()].filter(Boolean).length === count;
    });
  }

  /**
   * Run `action`, which changes the shown tiles' options in place, and resolve
   * with each updated tile's labels once the grid's update pass is done and
   * every updated tile's draws have settled
   */
  async afterTilesUpdated(action: () => Promise<unknown>): Promise<TileLabels> {
    const draws = new TileDraws();
    let tiles: number | null = null;
    await this.eventUtils.after(
      [TILES_UPDATED, TILE_DRAWN],
      action,
      ({ event, detail }) => {
        if (event === TILES_UPDATED) {
          tiles = (detail as { tiles: number }).tiles;
        } else {
          draws.add(detail);
        }
        return draws.settled(tiles);
      },
    );
    return draws.labels();
  }

  /**
   * Run `action`, which refreshes the grid, and resolve with each new tile's
   * labels once the remounted grid's tiles have settled. Only draws after the
   * old grid unmounts count, so the old tiles' draws cannot satisfy the wait.
   * Entry counts that change go through {@link afterEntryCounts}
   */
  async afterGridRefreshed(
    action: () => Promise<unknown>,
  ): Promise<TileLabels> {
    const draws = new TileDraws();
    let unmounted = false;
    let tiles: number | null = null;
    await this.eventUtils.after(
      [GRID_UNMOUNT, GRID_MOUNT, TILE_DRAWN],
      action,
      ({ event, detail }) => {
        if (event === GRID_UNMOUNT) {
          unmounted = true;
          tiles = null;
          draws.clear();
          return false;
        }
        if (!unmounted) return false;
        if (event === GRID_MOUNT) {
          tiles = (detail as { tiles: number }).tiles;
        } else {
          draws.add(detail);
        }
        return draws.settled(tiles);
      },
    );
    return draws.labels();
  }

  /**
   * Run `action` and resolve once `count` custom-renderer tiles have mounted
   * because of it; they mount after the grid does
   */
  async afterRendererTilesMounted<T>(
    count: number,
    action: () => Promise<T>,
  ): Promise<T> {
    let mounted = 0;
    return this.eventUtils.after(
      "e2e:grid:custom-renderer-mounted",
      action,
      () => ++mounted === count,
    );
  }

  /** How many tile tag renders the document has recorded so far */
  async tagsRenderedMark(): Promise<number> {
    return (await this.eventUtils.recorded("e2e:looker:tags-rendered")).length;
  }

  /**
   * Resolve once the tile of `filepath` has rendered its tags after `mark`
   * (from {@link tagsRenderedMark}); tiles render as they scroll into view
   */
  async untilTagsRenderedSince(mark: number, filepath: string) {
    const isTile = (detail: unknown) =>
      (detail as { sampleFilepath?: string } | undefined)?.sampleFilepath ===
      filepath;
    await this.eventUtils.untilState(
      "e2e:looker:tags-rendered",
      async () =>
        (await this.eventUtils.recorded("e2e:looker:tags-rendered"))
          .slice(mark)
          .some(isTile),
      (e) => isTile(e.detail),
    );
  }

  /**
   * {@link afterTagsRendered} for tiles addressed by file name rather than
   * full filepath
   */
  async afterTagsRenderedNamed<T>(
    fileNames: string[],
    action: () => Promise<T>,
  ): Promise<T> {
    const pending = new Set(fileNames);
    return this.eventUtils.after("e2e:looker:tags-rendered", action, (e) => {
      const { sampleFilepath } = e.detail as { sampleFilepath: string };
      pending.delete(sampleFilepath.split("/").pop() ?? "");
      return pending.size === 0;
    });
  }

  /**
   * Run `action` and resolve once the tiles of every one of `filepaths` have
   * redrawn their tag bubbles because of it
   */
  async afterTagsRendered<T>(
    filepaths: string[],
    action: () => Promise<T>,
  ): Promise<T> {
    const pending = new Set(filepaths);
    return this.eventUtils.after("e2e:looker:tags-rendered", action, (e) => {
      pending.delete((e.detail as { sampleFilepath: string }).sampleFilepath);
      return pending.size === 0;
    });
  }

  /**
   * Run `action` and resolve once the entry counts it changes have rendered
   * loaded: the element count, and with `groups` the group count too. The
   * counts signal only when their text changes, so `action` must change it
   */
  async afterEntryCounts<T>(
    action: () => Promise<T>,
    kind: "groups" | "elements" = "elements",
  ): Promise<T> {
    const pending = new Set(
      kind === "groups" ? ["grid-elements", "grid-groups"] : ["grid-elements"],
    );
    return this.eventUtils.after(COUNT_SHOWN, action, (e) => {
      pending.delete((e.detail as { signal: string }).signal);
      return pending.size === 0;
    });
  }

  async run<T>(wrap: () => Promise<T>): Promise<T> {
    const refresh = await this.armGridRefresh();
    try {
      const result = await wrap();
      await refresh.received;
      return result;
    } finally {
      await refresh.dispose();
    }
  }
}

class GridAsserter {
  constructor(private readonly gridPom: GridPom) {}

  /**
   * One capture of `target` (the forward section by default); draw it first
   * with {@link GridPom.afterTilesDrawn}
   */
  async hasScreenshot(name: string, options: { target?: Locator } = {}) {
    const target = options.target ?? this.gridPom.getForwardSection();
    await expectScreenshot(target, name);
  }

  async isTileCountEqualTo(n: number) {
    expect(await this.gridPom.locator.locator(TILE_SELECTOR).count()).toBe(n);
  }

  async isNthSampleSelected(n: number) {
    const checkbox = await this.gridPom.getNthCheckbox(n);
    expect(await checkbox.isChecked()).toBe(true);
  }

  async nthSampleHasTagValue(
    n: number,
    tagName: string,
    expectedTagValue: string,
  ) {
    const tagElement = this.gridPom.getNthTile(n).getByTestId(`tag-${tagName}`);
    expect(await tagElement.textContent()).toBe(expectedTagValue);
  }

  async nthSampleHasNoTag(n: number, tagName: string) {
    const tagElement = this.gridPom.getNthTile(n).getByTestId(`tag-${tagName}`);
    expect(await tagElement.isVisible()).toBe(false);
  }

  async isSelectionCountEqualTo(n: number) {
    const tray = this.gridPom.page.getByRole("region", { name: "Selection" });

    if (n === 0) {
      expect(await tray.textContent()).toContain(
        "Act on all samples in the grid",
      );
      return;
    }

    expect(await tray.textContent()).toMatch(
      new RegExp(
        `${n.toLocaleString()}\\s*sample${n === 1 ? "" : "s"} selected`,
      ),
    );
  }

  /**
   * One read of the entry counts; the loader and {@link GridPom.run} wait for
   * them to load, other causes go through {@link GridPom.afterEntryCounts}
   */
  async isEntryCountTextEqualTo(text: string) {
    const counts = await this.gridPom.page
      .getByTestId("entry-counts")
      .textContent();
    expect(counts?.replace(/\s+/g, " ").trim()).toBe(text);
  }
}
