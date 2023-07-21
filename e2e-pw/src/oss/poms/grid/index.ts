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
    await this.grid
      .getByTestId("looker")
      .first()
      .click({ position: { x: 10, y: 60 } });
  }

  async openNthLooker(n: number) {
    await this.grid.getByTestId("looker").nth(n).click();
  }

  async getEntryCountText() {
    return this.page.getByTestId("entry-counts").textContent();
  }

  async selectSlice(slice: string) {
    await this.page.getByTestId("selector-slice").fill(slice);
    await this.page.getByTestId("selector-slice").press("Enter");
  }
}

class GridAsserter {
  constructor(private readonly gridPom: GridPom) {}

  async verifyNLookers(n: number) {
    const lookersCount = await this.gridPom.grid.getByTestId("looker").count();
    expect(lookersCount).toBe(n);
  }

  async waitForEntryCountTextToEqual(predicate: string) {
    return this.gridPom.page.waitForFunction(
      (predicate_) => {
        return (
          document.querySelector("[data-cy='entry-counts']").textContent ===
          predicate_
        );
      },
      predicate,
      { timeout: 2000 }
    );
  }
}
