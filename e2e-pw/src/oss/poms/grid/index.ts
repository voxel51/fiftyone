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
      // the selection checkbox is revealed on tile hover
      await tile.hover();
      await tile.getByRole("checkbox").click();
      return;
    }
    await tile.click({ position: { x: 10, y: 5 } });
  }

  async toggleSelectFirstSample() {
    await this.toggleSelectNthSample(0);
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
    const unmount = await this.eventUtils.arm("e2e:grid:unmount");
    const mount = await this.eventUtils.arm("grid-mount");
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
   * Run `action` and resolve once `count` distinct tiles have drawn their
   * canvas because of it
   */
  async afterTilesDrawn<T>(
    count: number,
    action: () => Promise<T>,
  ): Promise<T> {
    const drawn = new Set<string>();
    return this.eventUtils.after("e2e:looker:canvas-loaded", action, (e) => {
      drawn.add((e.detail as { sampleId: string }).sampleId);
      return drawn.size === count;
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
   * Run `action` and resolve once the entry counts it reloads have rendered
   * loaded: the element count, and with `groups` the group count too
   */
  async afterEntryCounts<T>(
    action: () => Promise<T>,
    kind: "groups" | "elements" = "elements",
  ): Promise<T> {
    const pending = new Set(
      kind === "groups" ? ["grid-elements", "grid-groups"] : ["grid-elements"],
    );
    return this.eventUtils.after(
      "e2e:components:entry-count-shown",
      action,
      (e) => {
        pending.delete((e.detail as { signal: string }).signal);
        return pending.size === 0;
      },
    );
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
  async hasScreenshot(
    name: string,
    options: { target?: Locator; mask?: Locator[] } = {},
  ) {
    const target = options.target ?? this.gridPom.getForwardSection();
    await expectScreenshot(target, name, { mask: options.mask });
  }

  async isTileCountEqualTo(n: number) {
    const tileCount = await this.gridPom.locator.locator(TILE_SELECTOR).count();
    expect(tileCount).toBe(n);
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
    const action = this.gridPom.actionsRow.gridActionsRow.getByTestId(
      "action-manage-selected",
    );

    if (n === 0) {
      expect(await action.isVisible()).toBe(false);
      return;
    }

    expect(await action.first().textContent()).toBe(String(n));
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
