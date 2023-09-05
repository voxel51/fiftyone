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
}

class ModalGroupActionsAsserter {
  constructor(private readonly groupActionsPom: ModalGroupActionsPom) {}

  async assertGroupPinnedText(text: string) {
    const pinnedText = await this.groupActionsPom.getGroupPinnedText();
    expect(pinnedText).toBe(text);
  }
}
