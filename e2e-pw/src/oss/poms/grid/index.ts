import { Locator, Page, expect } from "src/oss/fixtures";
import { EventUtils } from "src/shared/event-utils";
import { GridActionsRowPom } from "../action-row/grid-actions-row";
import { GridSliceSelectorPom } from "../action-row/grid-slice-selector";
import { GridTaggerPom } from "../action-row/tagger/grid-tagger";
import { UrlPom } from "../url";

export class GridPom {
  readonly assert: GridAsserter;
  readonly actionsRow: GridActionsRowPom;
  readonly sliceSelector: GridSliceSelectorPom;
  readonly tagger: GridTaggerPom;
  readonly url: UrlPom;

  readonly locator: Locator;

  constructor(
    public readonly page: Page,
    private readonly eventUtils: EventUtils
  ) {
    this.assert = new GridAsserter(this);
    this.url = new UrlPom(page, eventUtils);
    this.actionsRow = new GridActionsRowPom(page, eventUtils);
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

  getNthLooker(n: number) {
    return this.locator.getByTestId("looker").nth(n);
  }

  async getNthCheckbox(n: number) {
    return this.getNthLooker(n).getByTestId("looker-checkbox-input-");
  }

  async toggleSelectNthSample(n: number) {
    await this.getNthLooker(n).click({ position: { x: 10, y: 5 } });
  }

  async toggleSelectFirstSample() {
    await this.toggleSelectNthSample(0);
  }

  async openNthSample(n: number) {
    await this.getNthLooker(n).click({ position: { x: 10, y: 80 } });
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

  async selectSlice(slice: string) {
    await this.sliceSelector.selectSlice(slice);
  }

  /**
   * @deprecated Use `getWaitForGridRefreshPromise` instead.
   */
  async waitForGridToLoad() {
    return this.page.waitForSelector("[data-cy=looker]", {
      timeout: 2000,
    });
  }

  async getWaitForGridRefreshPromise() {
    const refreshStartPromise =
      this.eventUtils.getEventReceivedPromiseForPredicate("grid-unmount");
    const refreshEndPromise =
      this.eventUtils.getEventReceivedPromiseForPredicate("grid-mount");
    return Promise.all([refreshStartPromise, refreshEndPromise]);
  }

  async run<T>(wrap: () => Promise<T>): Promise<T> {
    const promise = this.getWaitForGridRefreshPromise();
    const result = await wrap();
    await promise;
    return result;
  }
}

class GridAsserter {
  constructor(private readonly gridPom: GridPom) {}

  async isLookerCountEqualTo(n: number) {
    const lookersCount = await this.gridPom.locator
      .getByTestId("looker")
      .count();
    expect(lookersCount).toBe(n);
  }

  async isNthSampleSelected(n: number) {
    const checkbox = await this.gridPom.getNthCheckbox(n);
    await expect(checkbox).toBeChecked();
  }

  async nthSampleHasTagValue(
    n: number,
    tagName: string,
    expectedTagValue: string
  ) {
    const tagElement = this.gridPom
      .getNthLooker(n)
      .getByTestId(`tag-${tagName}`);
    await expect(tagElement).toHaveText(expectedTagValue);
  }

  async isSelectionCountEqualTo(n: number) {
    const action = this.gridPom.actionsRow.gridActionsRow.getByTestId(
      "action-manage-selected"
    );

    if (n === 0) {
      await expect(action).toBeHidden();
      return;
    }

    await expect(action.first()).toHaveText(String(n));
  }

  async isEntryCountTextEqualTo(text: string) {
    return this.gridPom.page.waitForFunction(
      (text_) => {
        return (
          document.querySelector("[data-cy='entry-counts']").textContent ===
          text_
        );
      },
      text,
      { timeout: 2000 }
    );
  }
}
