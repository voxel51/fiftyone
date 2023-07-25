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
    allowErrorInfo = false
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

    return this.waitForSampleToLoad(allowErrorInfo);
  }

  async scrollCarousel(left: number = null) {
    await this.groupCarousel.getByTestId("flashlight").evaluate((e, left) => {
      e.scrollTo({ left: left ?? e.scrollWidth });
    }, left);
  }

  async navigateSlice(
    groupField: string,
    slice: string,
    allowErrorInfo = false
  ) {
    const currentSlice = await this.sidebarPom.getSidebarEntryText(
      `sidebar-entry-${groupField}.name`
    );
    const lookers = this.groupCarousel.getByTestId("looker");
    const looker = lookers.filter({ hasText: slice }).first();
    await looker.click({ position: { x: 10, y: 60 } });

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
    return this.waitForSampleToLoad(allowErrorInfo);
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

  async waitForSampleToLoad(allowErrorInfo = false) {
    return this.page.waitForFunction(
      (allowErrorInfo) => {
        if (
          allowErrorInfo &&
          document.querySelector(
            "[data-cy=modal-looker-container] [data-cy=looker-error-info]"
          )
        ) {
          return true;
        }

        return (
          document
            .querySelector(`[data-cy=modal-looker-container] canvas`)
            ?.getAttribute("sample-loaded") === "true"
        );
      },
      allowErrorInfo,
      { timeout: Duration.Seconds(10) }
    );
  }
}
