import { Locator, Page } from "src/oss/fixtures";
import { ModalPom } from ".";
import { ModalLevaPom } from "./leva";

export class Looker3DControlsPom {
  readonly page: Page;
  readonly modal: ModalPom;
  readonly leva: ModalLevaPom;
  readonly locator: Locator;

  constructor(page: Page, modal: ModalPom) {
    this.page = page;
    this.modal = modal;
    this.locator = modal.locator.getByTestId("looker3d-action-bar");

    this.leva = new ModalLevaPom(page);
  }

  async toggleRenderPreferences() {
    await this.locator
      .getByTestId("toggle-looker-3d-render-preferences")
      .click();
  }
}
