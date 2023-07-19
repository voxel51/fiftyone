import { expect, Locator, Page } from "src/oss/fixtures";
import { GridActionsRowPom } from "../action-row/grid-actions-row";

export class GridPom {
  readonly page: Page;
  readonly actionsRow: GridActionsRowPom;
  readonly assert: GridAsserter;

  readonly grid: Locator;

  constructor(page: Page) {
    this.page = page;
    this.actionsRow = new GridActionsRowPom(page);

    this.assert = new GridAsserter(this);

    this.grid = page.getByTestId("fo-grid");
  }

  async openFirstLooker() {
    await this.grid.getByTestId("looker").first().click();
  }

  async openNthLooker(n: number) {
    await this.grid.getByTestId("looker").nth(n).click();
  }

  async getEntryCountText() {
    return this.page.getByTestId("entry-counts").textContent();
  }
}

class GridAsserter {
  constructor(private readonly gridPom: GridPom) {}

  async verifyNLookers(n: number) {
    const lookersCount = await this.gridPom.grid.getByTestId("looker").count();
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
