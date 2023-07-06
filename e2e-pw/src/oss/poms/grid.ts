import { expect, Locator, Page } from "src/oss/fixtures";
import { Duration } from "../utils";

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
    await this.waitForSampleToLoad();
  }

  async openNthLooker(n: number) {
    await this.page.getByTestId("looker").nth(n).click();
    await this.waitForSampleToLoad();
  }

  async waitForSampleToLoad() {
    return this.page.waitForFunction(
      () => {
        const canvas = document.querySelector(
          "[data-cy=modal-looker-container] canvas"
        );

        if (!canvas) {
          return false;
        }

        return canvas.getAttribute("sample-loaded") === "true";
      },
      { timeout: Duration.Seconds(10) }
    );
  }
}

class GridAsserter {
  constructor(private readonly grid: GridPom) {}

  async verifyNLookers(n: number) {
    const lookersCount = await this.grid.page.getByTestId("looker").count();
    expect(lookersCount).toBe(n);
  }
}
