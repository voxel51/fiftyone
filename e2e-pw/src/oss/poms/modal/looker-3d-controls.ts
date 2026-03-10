import { expect, Locator, Page } from "src/oss/fixtures";
import { ModalPom } from ".";
import { ModalLevaPom } from "./leva";

const SUCCESS_MSG = "All assets loaded successfully!";

export class Looker3DControlsPom {
  readonly page: Page;
  readonly modal: ModalPom;
  readonly leva: ModalLevaPom;
  readonly locator: Locator;
  readonly assert: Looker3DControlsAsserter;

  constructor(page: Page, modal: ModalPom) {
    this.page = page;
    this.modal = modal;
    this.locator = modal.locator.getByTestId("looker3d-action-bar");

    this.leva = new ModalLevaPom(page);
    this.assert = new Looker3DControlsAsserter(this);
  }

  get sliceSelector() {
    return this.locator.getByTestId("looker3d-select-slices");
  }

  get sliceSelectorCheckboxes() {
    return this.locator.getByTestId("looker3d-slice-checkboxes");
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

  async openSliceSelector() {
    await this.sliceSelector.click();
    await this.sliceSelectorCheckboxes.waitFor({ state: "visible" });
  }

  async closeSliceSelector() {
    if ((await this.sliceSelectorCheckboxes.count()) === 0) {
      return;
    }

    await this.modal.clickOnLooker3d();
    await expect(this.sliceSelectorCheckboxes).toHaveCount(0);
  }

  async getSliceSelectorLabel() {
    const text = await this.sliceSelector.textContent();
    return text?.replace(/\s+/g, " ").trim() ?? "";
  }

  getSliceCheckbox(slice: string) {
    return this.sliceSelectorCheckboxes.getByTestId(`checkbox-${slice}`);
  }

  async isSliceChecked(slice: string) {
    return this.getSliceCheckbox(slice)
      .locator('input[type="checkbox"]')
      .isChecked();
  }
}

class Looker3DControlsAsserter {
  constructor(private readonly looker3dControlsPom: Looker3DControlsPom) {}

  async verifySliceSelectorLabel(expectedLabel: string) {
    await expect(this.looker3dControlsPom.sliceSelector).toContainText(
      expectedLabel
    );
  }

  async verifySliceSelectorHidden() {
    await expect(this.looker3dControlsPom.sliceSelector).toHaveCount(0);
  }

  async verifySliceChecked(slice: string, checked = true) {
    const checkbox = this.looker3dControlsPom
      .getSliceCheckbox(slice)
      .locator('input[type="checkbox"]');

    if (checked) {
      await expect(checkbox).toBeChecked();
      return;
    }

    await expect(checkbox).not.toBeChecked();
  }
}
