import { expect, Locator, Page } from "src/oss/fixtures";

export class GridPom {
  readonly page: Page;
  readonly assert: GridAsserter;

  readonly grid: Locator;

  constructor(page: Page) {
    this.page = page;
    this.assert = new GridAsserter(this);

    this.grid = page.getByTestId("fo-grid");
  }

  async openFirstLooker() {
    await this.grid.getByTestId("looker").first().click();
  }

  async openNthLooker(n: number) {
    await this.grid.getByTestId("looker").nth(n).click();
  }
}

class GridAsserter {
  constructor(private readonly gridPom: GridPom) {}

  async verifyNLookers(n: number) {
    const lookersCount = await this.gridPom.grid.getByTestId("looker").count();
    expect(lookersCount).toBe(n);
  }
}
