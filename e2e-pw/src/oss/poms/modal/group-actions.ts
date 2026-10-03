import { Page, expect } from "src/oss/fixtures";
import { ModalPom } from ".";
import { afterPopout } from "../action-row/popout";
import { DynamicGroupPaginationPom } from "./dynamic-group-pagination-bar";

const MEDIA_CHECKBOX = {
  "3d": "checkbox-3D Viewer",
  carousel: "checkbox-Carousel",
  viewer: "checkbox-2D Viewer",
} as const;

const NAVIGATION_MODE_OPTIONS = {
  carousel: "Sequential Access",
  pagination: "Random Access",
  video: "Video",
} as const;

export class ModalGroupActionsPom {
  readonly page: Page;
  readonly modal: ModalPom;
  readonly assert: ModalGroupActionsAsserter;
  readonly dynamicGroupPagination: DynamicGroupPaginationPom;

  constructor(page: Page, modal: ModalPom) {
    this.page = page;
    this.modal = modal;
    this.dynamicGroupPagination = new DynamicGroupPaginationPom(page, modal);
    this.assert = new ModalGroupActionsAsserter(this);
  }

  get toggleMediaButton() {
    return this.modal.locator.getByTestId(
      "action-toggle-group-media-visibility",
    );
  }

  get groupMediaVisibilityPopout() {
    return this.modal.locator.getByTestId("group-media-visibility-popout");
  }

  async openMediaVisibility() {
    await afterPopout(
      this.modal.eventUtils,
      "group-media-visibility-popout",
      true,
      () => this.toggleMediaButton.click(),
    );
  }

  /** Toggle one renderer; open the popout first with `openMediaVisibility` */
  async toggleMedia(media: keyof typeof MEDIA_CHECKBOX) {
    await this.modal.locator.getByTestId(MEDIA_CHECKBOX[media]).click();
  }

  /**
   * Show one renderer, toggling it only if its checkbox is off; open the
   * popout first with `openMediaVisibility`, which renders the checkboxes
   * from the visibility state
   */
  async showMedia(media: keyof typeof MEDIA_CHECKBOX) {
    const checkbox = this.modal.locator.getByTestId(MEDIA_CHECKBOX[media]);
    if (!(await checkbox.getByRole("checkbox").isChecked())) {
      await checkbox.click();
    }
  }

  async selectNthItemFromCarousel(index: number) {
    return this.modal.locator
      .getByTestId("flashlight-section-horizontal")
      .nth(index)
      .click();
  }

  async setDynamicGroupsNavigationMode(
    mode: "carousel" | "pagination" | "video",
  ) {
    const option = this.modal.locator.getByTestId(
      `tab-option-${NAVIGATION_MODE_OPTIONS[mode]}`,
    );
    await this.modal.toggleDisplayOptionsButton.click();
    await option.click();
    await afterPopout(this.modal.eventUtils, "popout", false, () =>
      this.modal.toggleDisplayOptionsButton.click(),
    );
  }
}

class ModalGroupActionsAsserter {
  constructor(private readonly groupActionsPom: ModalGroupActionsPom) {}

  async assertIsCarouselVisible() {
    expect(await this.groupActionsPom.modal.carousel.isVisible()).toBe(true);
  }

  async assertIsCarouselNotVisible() {
    expect(await this.groupActionsPom.modal.carousel.isVisible()).toBe(false);
  }

  async assertIsPaginationBarVisible() {
    expect(
      await this.groupActionsPom.dynamicGroupPagination.locator.isVisible(),
    ).toBe(true);
  }

  async assertIsPaginationBarNotVisible() {
    expect(
      await this.groupActionsPom.dynamicGroupPagination.locator.isVisible(),
    ).toBe(false);
  }
}
