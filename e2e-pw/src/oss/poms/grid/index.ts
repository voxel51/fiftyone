import { Locator, Page, expect } from "src/oss/fixtures";
import { Duration } from "src/oss/utils";
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
      // the open button is revealed on tile hover
      await tile.hover();
      await tile.getByRole("button", { name: "Open sample modal" }).click();
      return;
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
    const forwardSectionDiv = this.getForwardSection().locator("div").last();
    await forwardSectionDiv.waitFor({ state: "visible" });
    return forwardSectionDiv.scrollIntoViewIfNeeded({
      timeout: Duration.Seconds(20),
    });
  }

  async scrollTop() {
    const backwardSectionDiv = this.getBackwardSection().locator("div").first();
    await backwardSectionDiv.waitFor({ state: "visible" });
    return backwardSectionDiv.scrollIntoViewIfNeeded({
      timeout: Duration.Seconds(20),
    });
  }

  async selectSlice(slice: string) {
    if (await this.page.getByTestId("modal").isVisible()) {
      // Defensive, no-op-ish cleanup to dismiss any open thing before interacting with the grid slice selector.
      await this.page.click("body", { position: { x: 0, y: 0 } });
    }

    await this.sliceSelector.selectSlice(slice);
  }

  /**
   * @deprecated Use `armGridRefresh` instead.
   */
  async waitForGridToLoad() {
    return this.page.waitForSelector(TILE_SELECTOR, {
      timeout: 2000,
    });
  }

  /**
   * Install counters for grid lifecycle events. Counting starts at creation —
   * arm BEFORE the actions whose grid refreshes should be counted, then
   * assert on the counters' `read()` after them. Each grid refresh
   * contributes one unmount and one mount; extra counts indicate a redundant
   * teardown.
   */
  async armLifecycleCounters() {
    return {
      mounts: await this.eventUtils.counter("grid-mount"),
      unmounts: await this.eventUtils.counter("grid-unmount"),
    };
  }

  /**
   * Arm listeners for a full grid refresh (unmount then remount). Await the
   * arming BEFORE the action that refreshes the grid, then await the handle's
   * `received` after it.
   */
  async armGridRefresh(): Promise<ArmedEvent> {
    const unmount = await this.eventUtils.arm("grid-unmount");
    const mount = await this.eventUtils.arm("grid-mount");
    return new ArmedEvent(
      Promise.all([unmount.received, mount.received]).then(
        (): void => undefined,
      ),
    );
  }

  async run<T>(wrap: () => Promise<T>): Promise<T> {
    const refresh = await this.armGridRefresh();
    const result = await wrap();
    await refresh.received;
    return result;
  }
}

class GridAsserter {
  constructor(private readonly gridPom: GridPom) {}

  async isTileCountEqualTo(n: number) {
    const tileCount = await this.gridPom.locator.locator(TILE_SELECTOR).count();
    expect(tileCount).toBe(n);
  }

  async isNthSampleSelected(n: number) {
    const checkbox = await this.gridPom.getNthCheckbox(n);
    await expect(checkbox).toBeChecked();
  }

  async nthSampleHasTagValue(
    n: number,
    tagName: string,
    expectedTagValue: string,
  ) {
    const tagElement = this.gridPom.getNthTile(n).getByTestId(`tag-${tagName}`);
    await expect(tagElement).toHaveText(expectedTagValue);
  }

  async isSelectionCountEqualTo(n: number) {
    const action = this.gridPom.actionsRow.gridActionsRow.getByTestId(
      "action-manage-selected",
    );

    if (n === 0) {
      await expect(action).toBeHidden();
      return;
    }

    await expect(action.first()).toHaveText(String(n));
  }

  async isEntryCountTextEqualTo(text: string) {
    const entryCounts = this.gridPom.page.getByTestId("entry-counts");
    const normalize = (value: string | null) =>
      (value ?? "").replace(/\s+/g, " ").trim();

    await expect(entryCounts).toBeVisible({ timeout: Duration.Seconds(20) });
    await expect
      .poll(async () => normalize(await entryCounts.textContent()), {
        timeout: Duration.Seconds(20),
      })
      .toBe(normalize(text));
  }
}
