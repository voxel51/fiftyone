import { Page, expect } from "src/oss/fixtures";
import { ModalPom } from ".";
import { DynamicGroupPaginationPom } from "./dynamic-group-pagination-bar";

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
      "action-toggle-group-media-visibility"
    );
  }

  get groupMediaVisibilityPopout() {
    return this.modal.locator.getByTestId("group-media-visibility-popout");
  }

  async toggleMedia(media: "3d" | "carousel" | "viewer") {
    if (!(await this.groupMediaVisibilityPopout.isVisible())) {
      await this.toggleMediaButton.click();
    }

    switch (media) {
      case "3d":
        await this.modal.locator.getByTestId("checkbox-3D Viewer").click();
        break;
      case "carousel":
        await this.modal.locator.getByTestId("checkbox-Carousel").click();
        break;
      case "viewer":
        await this.modal.locator.getByTestId("checkbox-Viewer").click();
        break;
      default:
        throw new Error(`Unknown media type: ${media}`);
    }
  }

  async getGroupPinnedText() {
    return this.modal.locator
      .getByTestId("pinned-slice-bar-description")
      .textContent();
  }

  async selectNthItemFromCarousel(index: number) {
    return this.modal.locator
      .getByTestId("flashlight-section-horizontal")
      .nth(index)
      .click();
  }

  async setDynamicGroupsNavigationMode(
    mode: "carousel" | "pagination" | "video"
  ) {
    await this.modal.toggleDisplayOptionsButton.click();

    switch (mode) {
      case "carousel":
        await this.modal.locator
          .getByTestId("tab-option-Sequential Access")
          .click();
        break;
      case "pagination":
        await this.modal.locator
          .getByTestId("tab-option-Random Access")
          .click();
        break;
      case "video":
        await this.modal.locator.getByTestId("tab-option-Video").click();
        break;
      default:
        throw new Error(`Unknown mode: ${mode}`);
    }
    await this.modal.toggleDisplayOptionsButton.click();
  }
}

class ModalGroupActionsAsserter {
  constructor(private readonly groupActionsPom: ModalGroupActionsPom) {}

  async assertGroupPinnedText(text: string) {
    const pinnedText = await this.groupActionsPom.getGroupPinnedText();
    expect(pinnedText).toBe(text);
  }

  async assertIsCarouselVisible() {
    await expect(this.groupActionsPom.modal.carousel).toBeVisible();
  }

  async assertIsCarouselNotVisible() {
    await expect(this.groupActionsPom.modal.carousel).toBeHidden();
  }

  async assertIsPaginationBarVisible() {
    await expect(
      this.groupActionsPom.dynamicGroupPagination.locator
    ).toBeVisible();
  }

  async assertIsPaginationBarNotVisible() {
    await expect(
      this.groupActionsPom.dynamicGroupPagination.locator
    ).toBeHidden();
  }
}
