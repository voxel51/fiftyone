import { Locator, Page, expect } from "src/oss/fixtures";

export type PanelName = "Samples" | "Histograms" | "Embeddings" | "OperatorIO";
export class PanelPom {
  readonly page: Page;
  readonly locator: Locator;
  readonly assert: PanelAsserter;
  readonly selectionCount: Locator;

  constructor(page: Page) {
    this.page = page;
    this.assert = new PanelAsserter(this);

    this.locator = this.page.getByTestId("panel-container");
    this.selectionCount = this.page.getByTestId("selection-count-container");
  }

  get errorBoundary() {
    return this.page.getByTestId("error-boundary");
  }

  get newPanelBtn() {
    return this.locator.getByTitle("New panel");
  }

  get closePanelBtn() {
    return this.locator.getByTitle("Close");
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

  async close() {
    await this.closePanelBtn.click();
  }

  async bringPanelToForeground(panelName: PanelName) {
    await this.getTab(panelName).click();
  }
}

class PanelAsserter {
  constructor(private readonly panelPom: PanelPom) {}

  async hasError() {
    await expect(this.panelPom.errorBoundary).toBeVisible();
  }
}
