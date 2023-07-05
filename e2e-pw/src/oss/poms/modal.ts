import { expect, Locator, Page, test } from "src/oss/fixtures";

export class ModalPom {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  getModal() {
    return this.page.getByTestId("modal");
  }

  async navigateNextSample() {
    await this.page.getByTestId("nav-right-button").click();
  }
  async navigatePreviousSample() {
    await this.page.getByTestId("nav-left-button").click();
  }

  async getGroupPinnedText() {
    return this.page.getByTestId("pinned-slice-bar-description").textContent();
  }

  getLooker3d() {
    return this.getModal().getByTestId("looker3d");
  }

  async clickOnLooker3d() {
    return this.getLooker3d().click();
  }

  getLooker() {
    return this.getModal().getByTestId("looker").last();
  }

  async clickOnLooker() {
    return this.getLooker().click();
  }

  getGroupContainer() {
    return this.getModal().getByTestId("group-container");
  }

  getCarousel() {}
}
