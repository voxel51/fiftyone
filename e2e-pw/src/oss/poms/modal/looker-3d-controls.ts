import { Locator, Page } from "src/oss/fixtures";
import { ModalPom } from ".";
import { ModalLevaPom } from "./leva";

const SUCCESS_MSG = "All assets loaded successfully!";

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

  async waitForAllAssetsLoaded() {
    await this.page.waitForFunction(
      (SUCCESS_MSG_INJECTED) => {
        const logs = document.querySelector(
          "[data-cy=looker3d-logs-action-bar]"
        );
        return logs?.textContent === SUCCESS_MSG_INJECTED;
      },
      SUCCESS_MSG,
      { timeout: 10000 }
    );
    // takes a bit of time for 3d assets to mount after load
    // todo: figure out if we can emit event on canvas paint
    // eslint-disable-next-line playwright/no-wait-for-timeout
    await this.page.waitForTimeout(150);
  }

  async setTopView() {
    await this.locator.getByTestId("looker-3d-set-top-view").click();
  }

  async setEgoView() {
    await this.locator.getByTestId("looker-3d-set-ego-view").click();
  }

  async toggleGridHelper() {
    await this.locator.getByTestId("looker-3d-toggle-grid-helper").click();
  }
}
