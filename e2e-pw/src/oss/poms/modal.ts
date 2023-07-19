import { Locator, Page } from "src/oss/fixtures";
import { Duration } from "../utils";
import { ModalSidebarPom } from "./modal-sidebar";

export class ModalPom {
  readonly page: Page;
  readonly sidebarPom: ModalSidebarPom;
  readonly modal: Locator;

  constructor(page: Page) {
    this.page = page;
    this.sidebarPom = new ModalSidebarPom(page);

    this.modal = page.getByTestId("modal");
  }

  async navigateSample(direction: "forward" | "backward") {
    const currentSampleId = await this.sidebarPom.getSampleId();

    await this.modal
      .getByTestId(`nav-${direction === "forward" ? "right" : "left"}-button`)
      .click();

    // wait for sample id to change
    await this.page.waitForFunction((currentSampleId) => {
      const sampleId = document.querySelector(
        "[data-cy=sidebar-entry-id]"
      )?.textContent;
      return sampleId !== currentSampleId;
    }, currentSampleId);

    return this.waitForSampleToLoad();
  }

  async navigateNextSample() {
    return this.navigateSample("forward");
  }

  async navigatePreviousSample() {
    return this.navigateSample("backward");
  }

  async getGroupPinnedText() {
    return this.modal.getByTestId("pinned-slice-bar-description").textContent();
  }

  getLooker3d() {
    return this.modal.getByTestId("looker3d");
  }

  async clickOnLooker3d() {
    return this.getLooker3d().click();
  }

  getLooker() {
    return this.modal.getByTestId("looker").last();
  }

  async clickOnLooker() {
    return this.getLooker().click();
  }

  getGroupContainer() {
    return this.modal.getByTestId("group-container");
  }

  getCarousel() {}

  async waitForSampleToLoad() {
    return this.page.waitForFunction(
      () => {
        const canvas = document.querySelector(
          "[data-cy=modal-looker-container] canvas"
        );

        if (!canvas) {
          return false;
        }

        return canvas.getAttribute("sample-loaded") === "true";
      },
      { timeout: Duration.Seconds(10) }
    );
  }
}
