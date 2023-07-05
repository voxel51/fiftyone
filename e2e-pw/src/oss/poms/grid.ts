import { expect, Locator, Page } from "src/oss/fixtures";

export class GridPom {
  readonly page: Page;
  readonly assert: GridAsserter;

  constructor(page: Page) {
    this.page = page;
    this.assert = new GridAsserter(this);
  }

  async getGrid(): Promise<Locator> {
    return this.page.getByTestId("fo-grid");
  }

  async openFirstLooker() {
    await this.page.getByTestId("looker").first().click();
    // eslint-disable-next-line playwright/no-wait-for-timeout
    await this.page.waitForTimeout(500);
  }

  async openNthLooker(n: number) {
    await this.page.getByTestId("looker").nth(n).click();
  }
}

class GridAsserter {
  constructor(private readonly grid: GridPom) {}

  async verifyNLookers(n: number) {
    const lookersCount = await this.grid.page.getByTestId("looker").count();
    expect(lookersCount).toBe(n);
  }
}
