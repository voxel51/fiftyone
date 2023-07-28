import { Page } from "src/oss/fixtures";

export class PanelPom {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  container() {
    return this.page.getByTestId("panel-container");
  }

  newPanelBtn() {
    return this.page.getByTitle("New panel");
  }

  tab(name: string = "samples") {
    // return this.page.getByTestId(`panel-tab-${name}`);
    if (name === "samples") {
      return this.page.getByRole("button", { name: "Samples", exact: true });
    }
  }

  histogramOption() {
    return this.page.getByText("Histograms", { exact: true });
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
}
