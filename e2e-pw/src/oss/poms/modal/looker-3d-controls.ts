import { expect, Locator, Page } from "src/oss/fixtures";
import { ModalPom } from ".";
import { ModalLevaPom } from "./leva";

const SLICE_SELECTOR = "e2e:looker3d:slice-selector";

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
   * Run `action` and resolve once the scene it (re)mounts has loaded every
   * asset and rendered with its settled camera
   */
  async afterAllAssetsLoaded<T>(action: () => Promise<T>): Promise<T> {
    return this.modal.afterSceneReady(action);
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
    const on = (await toggle.getAttribute("aria-pressed")) === "true";
    await this.modal.eventUtils.after(
      "e2e:looker3d:grid-toggled",
      () => toggle.click(),
      (e) => (e.detail as { on: boolean }).on !== on,
    );
  }

  async openSliceSelector() {
    await this.afterSliceSelector(true, () => this.sliceSelector.click());
  }

  async closeSliceSelector() {
    if ((await this.sliceSelectorCheckboxes.count()) === 0) {
      return;
    }

    await this.afterSliceSelector(false, () => this.modal.clickOnLooker3d());
  }

  private afterSliceSelector<T>(open: boolean, action: () => Promise<T>) {
    return this.modal.eventUtils.after(
      SLICE_SELECTOR,
      action,
      (e) => (e.detail as { open: boolean }).open === open,
    );
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
