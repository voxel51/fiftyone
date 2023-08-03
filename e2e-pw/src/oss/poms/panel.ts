import { Locator, Page, expect } from "src/oss/fixtures";

export class PanelPom {
  readonly page: Page;
  readonly locator: Locator;
  readonly assert: PanelAsserter;

  constructor(page: Page) {
    this.page = page;
    this.assert = new PanelAsserter(this);

    this.locator = this.page.getByTestId("panel-container");
  }

  newPanelBtn() {
    return this.locator.getByTitle("New panel");
  }

  tab(name: string = "samples") {
    return this.locator.getByTestId(`panel-tab-${name}`);
  }

  histogramOption() {
    return this.locator.getByTestId("new-panel-option-Histograms");
  }

  distributionContainer() {
    return this.locator.getByTestId("distribution-container");
  }

  async openNew(option = "histograms") {
    await this.newPanelBtn().click();

    if (option === "histograms") {
      await this.histogramOption().click();
    }
  }

  async open(option = "samples") {
    await this.tab(option).first().click();
  }

  errorBoundary() {
    return this.locator.getByTestId("error-boundary");
  }
}

class PanelAsserter {
  constructor(private readonly panelPom: PanelPom) {}

  async histogramLoaded() {
    await expect(this.panelPom.distributionContainer()).toBeVisible();
  }

  async hasError() {
    await expect(this.panelPom.errorBoundary()).toBeVisible();
  }
}
