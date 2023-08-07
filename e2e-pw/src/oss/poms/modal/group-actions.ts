import { Page, expect } from "src/oss/fixtures";
import { ModalPom } from ".";

export class ModalGroupActionsPom {
  readonly page: Page;
  readonly modal: ModalPom;
  readonly assert: ModalGroupActionsAsserter;

  constructor(page: Page, modal: ModalPom) {
    this.page = page;
    this.modal = modal;
    this.assert = new ModalGroupActionsAsserter(this);
  }

  async getGroupPinnedText() {
    return this.modal.locator
      .getByTestId("pinned-slice-bar-description")
      .textContent();
  }

  getGroupContainer() {
    return this.modal.locator.getByTestId("group-container");
  }

  async selectNthItemFromCarousel(index: number) {
    return this.modal.locator
      .getByTestId("flashlight-section-horizontal")
      .nth(index)
      .click();
  }
}

class ModalGroupActionsAsserter {
  constructor(private readonly groupActionsPom: ModalGroupActionsPom) {}

  async assertGroupPinnedText(text: string) {
    const pinnedText = await this.groupActionsPom.getGroupPinnedText();
    expect(pinnedText).toBe(text);
  }
}
