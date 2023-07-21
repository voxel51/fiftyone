import { Locator, Page } from "src/oss/fixtures";
import { Duration } from "../utils";
import { ModalSidebarPom } from "./modal-sidebar";

export class ModalPom {
  readonly page: Page;
  readonly sidebarPom: ModalSidebarPom;
  readonly modal: Locator;
  readonly groupCarousel: Locator;

  constructor(page: Page) {
    this.page = page;
    this.sidebarPom = new ModalSidebarPom(page);

    this.modal = page.getByTestId("modal");
    this.groupCarousel = this.modal.getByTestId("group-carousel");
  }

  async navigateSample(
    direction: "forward" | "backward",
    expectErrorInfo = false
  ) {
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

    return this.waitForSampleToLoad(expectErrorInfo);
  }

  async navigateSlice(
    groupField: string,
    slice: string,
    expectErrorInfo = false
  ) {
    const currentSlice = await this.sidebarPom.getSidebarEntryText(
      `sidebar-entry-${groupField}.name`
    );
    await this.groupCarousel
      .getByTestId("looker")
      .filter({ hasText: slice })
      .first()
      .click({ position: { x: 10, y: 60 } });

    // wait for slice to change
    await this.page.waitForFunction(
      ({ currentSlice, groupField }) => {
        const slice = document.querySelector(
          `[data-cy="sidebar-entry-${groupField}.name"]`
        )?.textContent;
        return slice !== currentSlice;
      },
      { currentSlice, groupField }
    );
    return this.waitForSampleToLoad(expectErrorInfo);
  }

  async close() {
    return this.page.press("body", "Escape");
  }

  async navigateNextSample(expectErrorInfo = false) {
    return this.navigateSample("forward", expectErrorInfo);
  }

  async navigatePreviousSample(expectErrorInfo = false) {
    return this.navigateSample("backward", expectErrorInfo);
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

  async waitForSampleToLoad(expectErrorInfo = false) {
    return this.page.waitForFunction(
      (expectErrorInfo) => {
        const selector = `[data-cy=modal-looker-container] ${
          expectErrorInfo ? "canvas" : "[data-cy=looker-error-info]"
        }`;

        const element = document.querySelector(selector);

        if (!element) {
          return false;
        }

        if (expectErrorInfo) {
          return true;
        }

        return element.getAttribute("sample-loaded") === "true";
      },
      expectErrorInfo,
      { timeout: Duration.Seconds(10) }
    );
  }
}
