import { expect, Locator, Page } from "src/oss/fixtures";
import { Duration } from "../../utils";
import { ModalGroupActionsPom } from "./group-actions";
import { ModalSidebarPom } from "./modal-sidebar";
import { ModalVideoControlsPom } from "./video-controls";

export class ModalPom {
  readonly page: Page;
  readonly groupCarousel: Locator;
  readonly assert: ModalAsserter;
  readonly sidebar: ModalSidebarPom;
  readonly locator: Locator;
  readonly group: ModalGroupActionsPom;
  readonly video: ModalVideoControlsPom;

  constructor(page: Page) {
    this.page = page;
    this.assert = new ModalAsserter(this);
    this.locator = page.getByTestId("modal");
    this.groupCarousel = this.locator.getByTestId("group-carousel");
    this.sidebar = new ModalSidebarPom(page);
    this.group = new ModalGroupActionsPom(page, this);
    this.video = new ModalVideoControlsPom(page, this);
  }

  async toggleSelection() {
    await this.getLooker().hover();
    await this.locator.getByTestId("selectable-bar").click();
  }

  async navigateSample(
    direction: "forward" | "backward",
    allowErrorInfo = false
  ) {
    const currentSampleId = await this.sidebar.getSampleId();
    await this.locator
      .getByTestId(`nav-${direction === "forward" ? "right" : "left"}-button`)
      .click();

    // wait for sample id to change
    await this.page.waitForFunction((currentSampleId) => {
      const sampleId = document.querySelector(
        "[data-cy=sidebar-entry-id]"
      )?.textContent;
      return sampleId !== currentSampleId;
    }, currentSampleId);

    return this.waitForSampleLoadDomAttribute(allowErrorInfo);
  }

  async scrollCarousel(left: number = null) {
    await this.groupCarousel.getByTestId("flashlight").evaluate((e, left) => {
      e.scrollTo({ left: left ?? e.scrollWidth });
    }, left);
  }

  async navigateCarousel(index: number, allowErrorInfo = false) {
    const looker = this.groupCarousel.getByTestId("looker").nth(index);
    await looker.click({ position: { x: 10, y: 60 } });

    return this.waitForSampleLoadDomAttribute(allowErrorInfo);
  }

  async waitForCarouselToLoad() {
    await this.groupCarousel
      .getByTestId("looker")
      .first()
      .waitFor({ state: "visible" });
  }

  async navigateSlice(
    groupField: string,
    slice: string,
    allowErrorInfo = false
  ) {
    const currentSlice = await this.sidebar.getSidebarEntryText(
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
    return this.waitForSampleLoadDomAttribute(allowErrorInfo);
  }

  async close() {
    // close by clicking outside of modal
    await this.page.click("body", { position: { x: 0, y: 0 } });
    await this.locator.waitFor({ state: "detached" });
  }

  async navigateNextSample(allowErrorInfo = false) {
    return this.navigateSample("forward", allowErrorInfo);
  }

  async navigatePreviousSample(allowErrorInfo = false) {
    return this.navigateSample("backward", allowErrorInfo);
  }

  getLooker3d() {
    return this.locator.getByTestId("looker3d");
  }

  async clickOnLooker3d() {
    return this.getLooker3d().click();
  }

  getLooker() {
    return this.locator.getByTestId("looker").last();
  }

  async clickOnLooker() {
    return this.getLooker().click();
  }

  getGroupContainer() {
    return this.locator.getByTestId("group-container");
  }

  async waitForSampleLoadDomAttribute(allowErrorInfo = false) {
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

  async getSampleLoadEventPromiseForFilepath(sampleFilepath: string) {
    return this.page.evaluate(
      (sampleFilepath_) =>
        new Promise<void>((resolve, _reject) => {
          document.addEventListener("sample-loaded", (e: CustomEvent) => {
            if ((e.detail.sampleFilepath as string) === sampleFilepath_) {
              resolve();
            }
          });
        }),
      sampleFilepath
    );
  }
}

class ModalAsserter {
  constructor(private readonly modalPom: ModalPom) {}

  async verifySelection(n: number) {
    const action = this.modalPom.locator.getByTestId("action-manage-selected");

    const count = await action.first().textContent();

    expect(count).toBe(String(n));
  }

  async verifyCarouselLength(expectedCount: number) {
    const actualLookerCount = await this.modalPom.groupCarousel
      .getByTestId("looker")
      .count();
    expect(actualLookerCount).toBe(expectedCount);
  }
}
