import { expect, Locator, Page } from "src/oss/fixtures";
import { GridActionsRowPom } from "../action-row/grid-actions-row";
import { GridSliceSelectorPom } from "../action-row/grid-slice-selector";

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

  async getNthLooker(n: number) {
    return this.locator.getByTestId("looker").nth(n);
  }

  async openFirstLooker() {
    await this.locator.getByTestId("looker").first().click();
  }

  async openNthLooker(n: number) {
    await this.locator.getByTestId("looker").nth(n).click();
  }

  async getEntryCountText() {
    return this.page.getByTestId("entry-counts").textContent();
  }
}

class GridAsserter {
  constructor(private readonly gridPom: GridPom) {}

  async assertNLookers(n: number) {
    const lookersCount = await this.gridPom.locator
      .getByTestId("looker")
      .count();
    expect(lookersCount).toBe(n);
  }

  async waitForEntryCountTextToEqual(text: string) {
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
