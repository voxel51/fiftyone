import { Locator, Page, expect } from "src/oss/fixtures";
import { ModalPom } from "../modal";

export class ModalPanelPom {
  readonly page: Page;
  readonly modal: ModalPom;
  readonly locator: Locator;
  readonly assert: ModalPanelAsserter;
  readonly selectionCount: Locator;

  constructor(page: Page, modal: ModalPom) {
    this.page = page;
    this.modal = modal;

    this.assert = new ModalPanelAsserter(this);

    this.locator = this.modal.locator;
  }

  get availableTabs() {
    return this.locator
      .getByTestId(/panel-tab-.*/)
      .locator("p")
      .allInnerTexts();
  }

  getTab(name: string) {
    return this.locator.getByTestId(`panel-tab-${name.toLocaleLowerCase()}`);
  }

  getContent(name: string) {
    return this.modal.locator.getByTestId(`panel-content-${name}`);
  }

  async bringPanelToForeground(panelName: string) {
    await this.getTab(panelName).click();
  }
}

class ModalPanelAsserter {
  constructor(private readonly panelPom: ModalPanelPom) {}

  async verifyAvailableTabs(expectedTabs: string[]) {
    const availableTabs = await this.panelPom.availableTabs;
    expect(availableTabs).toEqual(expectedTabs);
  }
}
