import { Locator, Page, expect } from "src/oss/fixtures";
import { EventUtils } from "src/shared/event-utils";
import { Duration } from "../../utils";
import { ModalTaggerPom } from "../action-row/tagger/modal-tagger";
import { ModalPanelPom } from "../panels/modal-panel";
import { UrlPom } from "../url";
import { ModalGroupActionsPom } from "./group-actions";
import { ModalImaAsVideoControlsPom } from "./imavid-controls";
import { Looker3DControlsPom } from "./looker-3d-controls";
import { ModalSidebarPom } from "./modal-sidebar";
import { ModalVideoControlsPom } from "./video-controls";

export class ModalPom {
  readonly groupCarousel: Locator;
  readonly looker: Locator;
  readonly modalContainer: Locator;
  readonly assert: ModalAsserter;

  readonly panel: ModalPanelPom;
  readonly group: ModalGroupActionsPom;
  readonly locator: Locator;
  readonly sidebar: ModalSidebarPom;
  readonly tagger: ModalTaggerPom;
  readonly url: UrlPom;
  readonly imavid: ModalImaAsVideoControlsPom;
  readonly video: ModalVideoControlsPom;
  readonly looker3dControls: Looker3DControlsPom;

  constructor(
    private readonly page: Page,
    private readonly eventUtils: EventUtils
  ) {
    this.assert = new ModalAsserter(this);
    this.locator = page.getByTestId("modal");

    this.groupCarousel = this.locator.getByTestId("group-carousel");
    this.looker = this.locator.getByTestId("looker").last();
    this.modalContainer = this.locator.getByTestId("modal-looker-container");

    this.group = new ModalGroupActionsPom(page, this);
    this.panel = new ModalPanelPom(page, this);
    this.tagger = new ModalTaggerPom(page, this);
    this.sidebar = new ModalSidebarPom(page);
    this.url = new UrlPom(page, eventUtils);
    this.imavid = new ModalImaAsVideoControlsPom(page, this);
    this.video = new ModalVideoControlsPom(page, this);
    this.looker3dControls = new Looker3DControlsPom(page, this);
  }

  get modalSamplePluginTitle() {
    return this.locator
      .getByTestId("panel-tab-fo-sample-modal-plugin")
      .textContent();
  }

  get groupLooker() {
    return this.locator
      .getByTestId("group-sample-wrapper")
      .getByTestId("looker");
  }

  get looker3d() {
    return this.locator.getByTestId("looker3d");
  }

  // todo: remove this in favor of looker3dControls
  get looker3dActionBar() {
    return this.locator.getByTestId("looker3d-action-bar");
  }

  get carousel() {
    return this.locator.getByTestId("group-carousel");
  }

  get toggleDisplayOptionsButton() {
    return this.locator.getByTestId("action-display-options");
  }

  getLookerAttachedEvent() {
    return this.eventUtils.getEventReceivedPromiseForPredicate(
      "looker-attached",
      () => true
    );
  }

  getSampleNavigation(direction: "forward" | "backward") {
    return this.locator.getByTestId(
      `nav-${direction === "forward" ? "right" : "left"}-button`
    );
  }

  async hideControls() {
    let isControlsOpacityZero = false;
    const controls = this.locator.getByTestId("looker-controls");

    do {
      await controls.press("c");
      const opacity = await controls.evaluate(
        (e) => getComputedStyle(e).opacity
      );
      isControlsOpacityZero = parseFloat(opacity) === 0;
    } while (!isControlsOpacityZero);
  }

  async toggleSelection(isPcd = false) {
    if (isPcd) {
      await this.looker3d.hover();
    } else {
      await this.looker.hover();
    }

    await this.locator.getByTestId("select-sample-checkbox").click();
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

  async panSample(
    direction: "left" | "right" | "up" | "down",
    offsetPixels = 100
  ) {
    const modalBoundingBox = await this.modalContainer.boundingBox();
    await this.page.mouse.move(
      modalBoundingBox.width / 2,
      modalBoundingBox.height / 2
    );
    await this.page.mouse.down();

    let newPositionX = modalBoundingBox.width / 2;
    let newPositionY = modalBoundingBox.height / 2;

    switch (direction) {
      case "left":
        newPositionX -= offsetPixels;
        break;
      case "right":
        newPositionX += offsetPixels;
        break;
      case "up":
        newPositionY -= offsetPixels;
        break;
      case "down":
        newPositionY += offsetPixels;
        break;
    }

    await this.page.mouse.move(newPositionX, newPositionY);
    await this.page.mouse.up();
  }

  async toggleTagSampleOrLabels() {
    await this.locator.getByTestId("action-tag-sample-labels").click();
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
    const currentSlice = await this.sidebar.getSidebarEntryText(groupField);
    const lookers = this.groupCarousel.getByTestId("looker");
    const looker = lookers.filter({ hasText: slice }).first();

    await looker.click({ position: { x: 10, y: 60 } });

    // wait for slice to change
    await this.page.waitForFunction(
      ({ currentSlice, groupField }) => {
        const slice = document.querySelector(
          `[data-cy="sidebar-entry-${groupField}"]`
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
  }

  async navigateNextSample(allowErrorInfo = false) {
    return this.navigateSample("forward", allowErrorInfo);
  }

  async navigatePreviousSample(allowErrorInfo = false) {
    return this.navigateSample("backward", allowErrorInfo);
  }

  async clickOnLooker3d() {
    return this.looker3d.click();
  }

  async toggleLooker3dSlice(slice: string) {
    await this.looker3dActionBar.getByTestId("looker3d-select-slices").click();

    await this.looker3dActionBar
      .getByTestId("looker3d-slice-checkboxes")
      .getByTestId(`checkbox-${slice}`)
      .click();

    await this.clickOnLooker3d();
  }

  async clickOnLooker() {
    return this.looker.click();
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
            ?.getAttribute("canvas-loaded") === "true"
        );
      },
      allowErrorInfo,
      { timeout: Duration.Seconds(10) }
    );
  }
}

class ModalAsserter {
  constructor(private readonly modalPom: ModalPom) {}

  async isClosed() {
    await expect(this.modalPom.modalContainer).toBeHidden();
  }

  async isOpen() {
    await expect(this.modalPom.modalContainer).toBeVisible();
  }

  async verifyModalOpenedSuccessfully() {
    await this.modalPom.waitForSampleLoadDomAttribute();
    await expect(this.modalPom.locator).toBeVisible();
  }

  async verifySelectionCount(n: number) {
    const action = this.modalPom.locator.getByTestId("action-manage-selected");

    await expect(action.first()).toHaveText(String(n));
  }

  async verifyCarouselLength(expectedCount: number) {
    const actualLookerCount = await this.modalPom.groupCarousel
      .getByTestId("looker")
      .count();
    expect(actualLookerCount).toBe(expectedCount);
  }

  async verifySampleNavigation(direction: "forward" | "backward") {
    const navigation = this.modalPom.getSampleNavigation(direction);
    await expect(navigation).toBeVisible();
  }

  async verifyModalSamplePluginTitle(
    title: string,
    { pinned }: { pinned: boolean } = { pinned: false }
  ) {
    const actualTitle = await this.modalPom.modalSamplePluginTitle;
    const expectedTitle = pinned ? `📌 ${title}` : title;
    expect(actualTitle).toBe(expectedTitle);
  }
}
