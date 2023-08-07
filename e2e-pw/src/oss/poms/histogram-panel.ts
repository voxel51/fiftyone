import { Locator, Page, expect } from "src/oss/fixtures";

export class HistogramPom {
  readonly page: Page;
  readonly locator: Locator;
  readonly assert: HistogramAsserter;

  constructor(page: Page) {
    this.page = page;
    this.assert = new HistogramAsserter(this);

    this.locator = this.page.getByTestId("distribution-container");
  }
}

class HistogramAsserter {
  constructor(private readonly histogramPom: HistogramPom) {}

  async histogramLoaded() {
    await expect(this.histogramPom.locator).toBeVisible();
  }
}
