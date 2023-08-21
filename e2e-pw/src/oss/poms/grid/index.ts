import { expect, Locator, Page } from "src/oss/fixtures";
import { GridActionsRowPom } from "../action-row/grid-actions-row";
import { GridSliceSelectorPom } from "../action-row/grid-slice-selector";
import { Duration } from "src/oss/utils";

export class GridPom {
  readonly page: Page;
  readonly actionsRow: GridActionsRowPom;
  readonly sliceSelector: GridSliceSelectorPom;
  readonly assert: GridAsserter;

  readonly locator: Locator;

  constructor(page: Page) {
    this.page = page;
    this.actionsRow = new GridActionsRowPom(page);
    this.sliceSelector = new GridSliceSelectorPom(page);

    this.assert = new GridAsserter(this);

    this.locator = page.getByTestId("fo-grid");
  }

  get firstFlashlightSection() {
    return this.locator.getByTestId("flashlight-section").first();
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
    await this.getNthLooker(n).click({ position: { x: 10, y: 50 } });
  }

  async openFirstSample() {
    return this.openNthSample(0);
  }

  async getEntryCountText() {
    return this.page.getByTestId("entry-counts").textContent();
  }

  async getNthFlashlightSection(n: number) {
    return this.page.getByTestId("flashlight-section").nth(0);
  }

  async selectSlice(slice: string) {
    await this.page.getByTestId("selector-slice").fill(slice);
    await this.page.getByTestId("selector-slice").press("Enter");
  }

  async waitForGridToLoad() {
    return this.page.waitForSelector("[data-cy=looker]", {
      timeout: 2000,
    });
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
    const isChecked = await checkbox.isChecked();
    expect(isChecked).toBe(true);
  }

  async isSelectionCountEqualTo(n: number) {
    const action = this.gridPom.actionsRow.gridActionsRow.getByTestId(
      "action-manage-selected"
    );

    if (n === 0) {
      await expect(action).toBeHidden();
      return;
    }

    const count = await action.first().textContent();

    expect(count).toBe(String(n));
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
