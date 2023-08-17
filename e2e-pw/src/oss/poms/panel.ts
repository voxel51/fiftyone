import { Locator, Page, expect } from "src/oss/fixtures";

export type PanelName = "Samples" | "Histograms" | "Embeddings" | "OperatorIO";
export class PanelPom {
  readonly page: Page;
  readonly locator: Locator;
  readonly assert: PanelAsserter;

  constructor(page: Page) {
    this.page = page;
    this.assert = new PanelAsserter(this);

    this.locator = this.page.getByTestId("panel-container");
  }

  get newPanelBtn() {
    return this.locator.getByTitle("New panel");
  }

  get histogramDistributionContainer() {
    return this.page.getByTestId("distribution-container");
  }

  get errorBoundary() {
    return this.page.getByTestId("error-boundary");
  }

  getPanelOption(panelName: PanelName) {
    return this.locator.getByTestId(`new-panel-option-${panelName}`);
  }

  getTab(name: PanelName) {
    return this.locator.getByTestId(`panel-tab-${name.toLocaleLowerCase()}`);
  }

  async open(panelName: PanelName) {
    await this.newPanelBtn.click();
    await this.getPanelOption(panelName).click();
  }

  async bringPanelToForeground(panelName: PanelName) {
    await this.getTab(panelName).click();
  }
}

class PanelAsserter {
  constructor(private readonly panelPom: PanelPom) {}

  async isHistogramLoaded() {
    await expect(this.panelPom.histogramDistributionContainer).toBeVisible();
  }

  async hasError() {
    await expect(this.panelPom.errorBoundary).toBeVisible();
  }
}
