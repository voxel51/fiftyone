import { Locator, Page, expect } from "src/oss/fixtures";

export type GridPanelName =
  | "Samples"
  | "Histograms"
  | "Embeddings"
  | "OperatorIO"
  | string;
export class GridPanelPom {
  readonly page: Page;
  readonly locator: Locator;
  readonly assert: GridPanelAsserter;
  readonly selectionCount: Locator;

  constructor(page: Page) {
    this.page = page;
    this.assert = new GridPanelAsserter(this);

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

  getPanelOption(name: GridPanelName) {
    return this.locator.getByTestId(`new-panel-option-${name}`);
  }

  getTab(name: GridPanelName) {
    return this.locator.getByTestId(`panel-tab-${name.toLocaleLowerCase()}`);
  }

  getContent(name: GridPanelName) {
    return this.page.getByTestId(`panel-content-${name}`);
  }

  async open(panelName: GridPanelName) {
    await this.newPanelBtn.click();
    await this.getPanelOption(panelName).click();
  }

  async close() {
    await this.closePanelBtn.click();
  }

  async bringPanelToForeground(panelName: GridPanelName) {
    await this.getTab(panelName).click();
  }
}

class GridPanelAsserter {
  constructor(private readonly panelPom: GridPanelPom) {}

  async hasError() {
    await expect(this.panelPom.errorBoundary).toBeVisible();
  }
}
