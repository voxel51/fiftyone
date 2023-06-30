import { expect, Locator, Page, test } from "src/oss/fixtures";

export class GridPom {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async getGrid(): Promise<Locator> {
    return this.page.getByTestId("fo-grid");
  }

  async assertHasNLookers(n: number) {
    const lookersCount = await this.page.getByTestId("looker").count();
    expect(lookersCount).toBe(n);
  }
}
