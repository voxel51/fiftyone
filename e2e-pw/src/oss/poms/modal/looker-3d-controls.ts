import { expect, Locator, Page } from "src/oss/fixtures";
import { exactText } from "src/oss/utils";
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

  /**
   * Wait until every scene asset has loaded and the scene has rendered with
   * its settled camera.
   */
  async waitForAllAssetsLoaded() {
    await this.locator
      .getByTestId("looker3d-logs-action-bar")
      .filter({ hasText: exactText(SUCCESS_MSG) })
      .waitFor({ state: "attached" });

    await this.modal.untilSceneReady();
  }

  /**
   * Look straight down the Z axis. Resolves once a frame has rendered the new
   * camera, so a following canvas click raycasts against the top view.
   */
  async setTopView() {
    await this.modal.eventUtils.after("looker3d-camera-look-at-settled", () =>
      this.locator.getByTestId("looker-3d-set-top-view").click(),
    );
  }

  /** Move to the ego view; resolves once a frame has rendered the new camera. */
  async setEgoView() {
    await this.modal.eventUtils.after("looker3d-camera-look-at-settled", () =>
      this.locator.getByTestId("looker-3d-set-ego-view").click(),
    );
  }

  async toggleGridHelper() {
    const toggle = this.locator.getByTestId("looker-3d-toggle-grid-helper");
    const pressed = await toggle.getAttribute("aria-pressed");
    await toggle.click();
    await this.modal.eventUtils.untilDom(
      toggle,
      (el, was) => el.getAttribute("aria-pressed") !== was,
      pressed,
    );
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
    await this.sliceSelectorCheckboxes.waitFor({ state: "detached" });
  }

  getSliceCheckbox(slice: string) {
    return this.sliceSelectorCheckboxes.getByTestId(`checkbox-${slice}`);
  }
}

class Looker3DControlsAsserter {
  constructor(private readonly looker3dControlsPom: Looker3DControlsPom) {}

  async verifySliceSelectorLabel(expectedLabel: string) {
    expect(
      await this.looker3dControlsPom.sliceSelector.textContent(),
    ).toContain(expectedLabel);
  }

  async verifySliceSelectorHidden() {
    expect(await this.looker3dControlsPom.sliceSelector.isVisible()).toBe(
      false,
    );
  }

  async verifySliceChecked(slice: string, checked = true) {
    const checkbox = this.looker3dControlsPom
      .getSliceCheckbox(slice)
      .locator('input[type="checkbox"]');

    expect(await checkbox.isChecked()).toBe(checked);
  }
}
