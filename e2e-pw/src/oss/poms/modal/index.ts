import { Locator, Page, expect } from "src/oss/fixtures";
import { expectScreenshot } from "src/oss/utils/screenshot";
import { EventCondition, EventUtils } from "src/shared/event-utils";
import { afterPopout } from "../action-row/popout";
import { ModalTaggerPom } from "../action-row/tagger/modal-tagger";
import { EpisodePom } from "../multimodal/episode";
import { ModalPanelPom } from "../panels/modal-panel";
import { collapseWhitespace, escapeRegExp } from "src/oss/utils";
import { UrlPom } from "../url";
import { ModalAnnotate3dPom } from "./annotate-3d";
import { ModalGroupActionsPom } from "./group-actions";
import { ModalImaAsVideoControlsPom } from "./imavid-controls";
import { Looker3DControlsPom } from "./looker-3d-controls";
import { ModalSidebarPom } from "./modal-sidebar";
import { SampleCanvasPom } from "./sample-canvas";
import { VideoAnnotatePom } from "./video-annotate";
import { ModalVideoControlsPom } from "./video-controls";

const SAMPLE_LOADED = "e2e:looker:canvas-loaded";
const SAMPLE_ERROR = "e2e:looker:error-shown";

export class ModalPom {
  readonly assert: ModalAsserter;

  readonly groupCarousel: Locator;
  readonly locator: Locator;
  readonly looker: Locator;
  readonly modalContent: Locator;
  readonly modalContainer: Locator;

  readonly group: ModalGroupActionsPom;
  readonly imavid: ModalImaAsVideoControlsPom;
  readonly looker3dControls: Looker3DControlsPom;
  readonly panel: ModalPanelPom;
  readonly sampleCanvas: SampleCanvasPom;
  readonly sidebar: ModalSidebarPom;
  readonly tagger: ModalTaggerPom;
  readonly url: UrlPom;
  readonly video: ModalVideoControlsPom;
  readonly videoAnnotate: VideoAnnotatePom;
  readonly annotate3d: ModalAnnotate3dPom;
  readonly episode: EpisodePom;

  constructor(
    private readonly page: Page,
    readonly eventUtils: EventUtils,
  ) {
    this.assert = new ModalAsserter(this);
    this.locator = page.getByTestId("modal");

    this.groupCarousel = this.locator.getByTestId("group-carousel");
    this.looker = this.locator.getByTestId("looker").last();
    this.modalContent = this.locator.getByTestId("modal-content");
    this.modalContainer = this.locator.getByTestId("modal-looker-container");

    this.group = new ModalGroupActionsPom(page, this);
    this.imavid = new ModalImaAsVideoControlsPom(page, this);
    this.looker3dControls = new Looker3DControlsPom(page, this);
    this.panel = new ModalPanelPom(page, this);
    this.sampleCanvas = new SampleCanvasPom(page, eventUtils);
    this.sidebar = new ModalSidebarPom(page, eventUtils);
    this.tagger = new ModalTaggerPom(page, this);
    this.url = new UrlPom(page, eventUtils);
    this.video = new ModalVideoControlsPom(page, this);
    this.videoAnnotate = new VideoAnnotatePom(page, this);
    this.annotate3d = new ModalAnnotate3dPom(page, this);
    this.episode = new EpisodePom(page, this.locator, eventUtils);
  }

  get modalSamplePluginTitle() {
    return this.locator
      .getByTestId("panel-tab-fo-sample-modal-plugin")
      .textContent();
  }

  /** The saved subset's read-only range marks on the existing media timeline. */
  get savedRangeTracks() {
    return this.locator.locator('[data-track-id^="fiftyone:saved-segments"]');
  }

  get savedRangeBars() {
    return this.savedRangeTracks
      .first()
      .locator("[data-event-index]:not([data-resize-handle])");
  }

  savedRangeBarsFor(sourceLabel: string) {
    return this.savedRangeTracks
      .filter({ hasText: sourceLabel })
      .locator("[data-event-index]:not([data-resize-handle])");
  }

  /**
   * A saved-subset timeline row for `sourceLabel` shows exactly `spans`
   * (`"0.20-0.50"`, comma separated), pinned or not when `pinned` is given
   */
  savedRangeShown(
    sourceLabel: string,
    spans: string,
    pinned?: boolean,
  ): EventCondition {
    return {
      events: "e2e:playback:track-shown",
      predicate: (e) => {
        const track = e.detail as {
          id: string;
          label: string;
          eventLabels: string;
          pinned: boolean;
          pinnable: boolean;
          spans: string;
        };
        return (
          track.id.startsWith("fiftyone:saved-segments") &&
          (track.label.includes(sourceLabel) ||
            track.eventLabels.includes(sourceLabel)) &&
          track.spans === spans &&
          (pinned === undefined || (track.pinnable && track.pinned === pinned))
        );
      },
    };
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

  afterLookerAttached<T>(action: () => Promise<T>): Promise<T> {
    return this.eventUtils.after("e2e:modal:looker-attached", action);
  }

  /** Run `action` and resolve once the modal has mounted because of it */
  afterOpened<T>(action: () => Promise<T>): Promise<T> {
    return this.eventUtils.after("e2e:modal:opened", action);
  }

  /**
   * Run `action` and resolve once the modal's sample surface has drawn its
   * sample (or, with `allowErrorInfo`, shown its load error) because of it
   */
  afterSampleLoaded<T>(
    action: () => Promise<T>,
    allowErrorInfo = false,
  ): Promise<T> {
    return this.eventUtils.after(
      allowErrorInfo ? [SAMPLE_LOADED, SAMPLE_ERROR] : SAMPLE_LOADED,
      action,
      (e) => !(e.detail as { thumbnail: boolean }).thumbnail,
    );
  }

  /**
   * Run `action` and resolve once the group carousel has settled a render
   * with no page request pending
   */
  afterCarouselRendered<T>(action: () => Promise<T>): Promise<T> {
    return this.eventUtils.after("e2e:flashlight:rendered", action, (e) => {
      const { horizontal, pending } = e.detail as {
        horizontal: boolean;
        pending: boolean;
      };
      return horizontal && !pending;
    });
  }

  getSampleNavigation(direction: "forward" | "backward") {
    return this.locator.getByTestId(
      `nav-${direction === "forward" ? "right" : "left"}-button`,
    );
  }

  async toggleSelection(isPcd = false) {
    if (isPcd) {
      await this.looker3d.hover();
    } else {
      await this.looker.hover();
    }

    await this.locator.getByTestId("select-sample-checkbox").click();
  }

  /** Pick the media field in display options, which open and close again */
  async selectMediaField(field: string) {
    const radio = this.page.getByTestId(`radio-button-${field}`);
    await this.toggleDisplayOptionsButton.click();
    await radio.click();
    await afterPopout(this.eventUtils, "popout", false, () =>
      this.toggleDisplayOptionsButton.click(),
    );
  }

  async navigateSample(
    direction: "forward" | "backward",
    allowErrorInfo = false,
  ) {
    const currentSampleId = await this.sidebar.getSampleId();

    // the sidebar remounts its entries on a sample change
    await this.sidebar.afterEntryChanged("id", currentSampleId, () =>
      this.afterSampleLoaded(
        () => this.getSampleNavigation(direction).click(),
        allowErrorInfo,
      ),
    );
  }

  async scrollCarousel(left: number = null) {
    await this.groupCarousel.getByTestId("flashlight").evaluate((e, left) => {
      e.scrollTo({ left: left ?? e.scrollWidth });
    }, left);
  }

  async scrollCarouselTo(slice: string) {
    const flashlight = this.groupCarousel.getByTestId("flashlight");
    const target = flashlight
      .getByTestId("thumbnail-title")
      .filter({ hasText: new RegExp(`^${escapeRegExp(slice)}$`) });
    const extent = () =>
      flashlight.evaluate((el) => ({
        scrollLeft: el.scrollLeft,
        scrollWidth: el.scrollWidth,
        width: el.clientWidth,
      }));

    // each scroll settles in a render of the (horizontal) carousel with no
    // page request pending, which shows everything in view
    for (let pos = 0; (await target.count()) === 0; ) {
      const { scrollLeft, scrollWidth, width } = await extent();
      if (pos > scrollWidth) return;
      const left = Math.min(pos, scrollWidth - width);
      pos += Math.max(width, 200);
      // no scroll, no render: nothing new comes into view at this step
      if (left === scrollLeft) continue;
      await this.eventUtils.after(
        "e2e:flashlight:rendered",
        () => flashlight.evaluate((el, x) => el.scrollTo({ left: x }), left),
        (e) => {
          const { horizontal, pending } = e.detail as {
            horizontal: boolean;
            pending: boolean;
          };
          return horizontal && !pending;
        },
      );
    }
  }

  async navigateCarousel(index: number, allowErrorInfo = false) {
    const looker = this.groupCarousel.getByTestId("looker").nth(index);

    await this.afterSampleLoaded(
      () => looker.click({ position: { x: 10, y: 60 } }),
      allowErrorInfo,
    );
  }

  async panSample(
    direction: "left" | "right" | "up" | "down",
    offsetPixels = 100,
  ) {
    const modalBoundingBox = await this.modalContainer.boundingBox();
    await this.page.mouse.move(
      modalBoundingBox.width / 2,
      modalBoundingBox.height / 2,
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

  async navigateSlice(
    groupField: string,
    slice: string,
    allowErrorInfo = false,
  ) {
    const currentSlice = await this.sidebar.getSidebarEntryText(groupField);
    const lookers = this.groupCarousel.getByTestId("looker");
    const looker = lookers.filter({ hasText: slice }).first();

    await this.sidebar.afterEntryChanged(groupField, currentSlice ?? "", () =>
      this.afterSampleLoaded(
        () => looker.click({ position: { x: 10, y: 60 } }),
        allowErrorInfo,
      ),
    );
  }

  async enterFullscreen() {
    if (!(await this.isFullscreen())) {
      await this.locator.getByTestId("action-toggle-fullscreen").click();
    }
    await this.assert.isFullscreen();
  }

  async close({ ignoreError } = { ignoreError: false }) {
    // close by clicking outside of modal
    try {
      if (!(await this.locator.isVisible())) {
        return;
      }

      if (await this.isFullscreen()) {
        await this.locator.getByTestId("action-toggle-fullscreen").click();
        await this.assert.isFullscreen(false);
      }

      await this.eventUtils.after("e2e:modal:closed", () =>
        this.page.click("body", { position: { x: 0, y: 0 } }),
      );
    } catch (e) {
      if (ignoreError) {
        return;
      }
      throw e;
    }
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

  /** Chrome hidden from 3D screenshots: the action bar, selection bar, and panels. */
  get looker3dScreenshotMasks(): Locator[] {
    return [
      this.locator.getByTestId("looker3d-action-bar"),
      this.locator.getByTestId("selectable-bar"),
      this.locator.getByTestId("panel-container"),
    ];
  }

  async clickOnLooker() {
    return this.looker.click();
  }

  /**
   * Hover the looker, then move the mouse off it and wait for its controls
   * to hide. The hover makes the mouse leave the looker, which is what hides
   * them.
   */
  async hideLookerControls() {
    await this.looker.hover();
    await this.eventUtils.after(
      "e2e:looker:controls-rendered",
      () => this.sampleCanvas.parkMouse(),
      (e) => !(e.detail as { shown: boolean }).shown,
    );
  }

  /**
   * Run `action` (e.g. the switch to annotate) and resolve once the Lighter
   * renderer has revealed its sample because of it
   */
  afterLighterReady<T>(action: () => Promise<T>): Promise<T> {
    return this.eventUtils.after("e2e:modal:lighter-revealed", action);
  }

  /**
   * Run `action` and resolve once a 3D scene is loaded, its camera settled
   * and revealed because of it
   */
  afterSceneReady<T>(action: () => Promise<T>): Promise<T> {
    return this.eventUtils.after("e2e:looker3d:scene-ready", action);
  }

  private async isFullscreen() {
    return this.modalContent.evaluate(
      (element) =>
        (element as HTMLElement).style.width === "100%" &&
        (element as HTMLElement).style.height === "100%",
    );
  }
}

class ModalAsserter {
  constructor(private readonly modalPom: ModalPom) {}

  /** One capture of the modal on the 3D canvas's next rendered frame */
  async hasLooker3dScreenshot(name: string) {
    await this.modalPom.eventUtils.next("e2e:looker3d:frame-rendered");
    await expectScreenshot(this.modalPom.modalContainer, name, {
      mask: this.modalPom.looker3dScreenshotMasks,
    });
  }

  /** One capture of the looker with its controls hidden */
  async hasLookerScreenshot(name: string) {
    await this.modalPom.hideLookerControls();
    await expectScreenshot(this.modalPom.looker, name);
  }

  async isClosed() {
    expect(await this.modalPom.locator.isVisible()).toBe(false);
  }

  async isOpen() {
    expect(await this.modalPom.locator.isVisible()).toBe(true);
  }

  /** Open with `afterSampleLoaded` first */
  async verifyModalOpenedSuccessfully() {
    expect(await this.modalPom.locator.isVisible()).toBe(true);
  }

  async verifyHasNoViewerError() {
    expect(
      await this.modalPom.modalContainer
        .getByTestId("looker-error-info")
        .count(),
    ).toBe(0);
  }

  async verifyPrimary2dRendererVisible() {
    expect(await this.modalPom.groupLooker.isVisible()).toBe(true);
  }

  async verify3dRendererVisible() {
    expect(await this.modalPom.looker3d.isVisible()).toBe(true);
  }
  async verifySelectionCount(n: number) {
    const action = this.modalPom.locator.getByTestId("action-manage-selected");

    expect(collapseWhitespace(await action.first().textContent())).toBe(
      n === 0
        ? "0 samples · 0 labels"
        : `${n.toLocaleString()} sample${n === 1 ? "" : "s"}`,
    );
  }

  async verifyCarouselLength(expectedCount: number) {
    const actualLookerCount = await this.modalPom.groupCarousel
      .getByTestId("looker")
      .count();
    expect(actualLookerCount).toBe(expectedCount);
  }

  async verifySampleNavigation(direction: "forward" | "backward") {
    const navigation = this.modalPom.getSampleNavigation(direction);
    expect(await navigation.isVisible()).toBe(true);
  }

  async verifyModalSamplePluginTitle(
    title: string,
    { pinned }: { pinned: boolean } = { pinned: false },
  ) {
    expect(
      collapseWhitespace(
        await this.modalPom.locator
          .getByTestId("panel-tab-fo-sample-modal-plugin")
          .textContent(),
      ),
    ).toBe(pinned ? `📌 ${title}` : title);
  }

  /** The modal fills the viewport (its content is styled 100% x 100%). */
  async isFullscreen(fullscreen = true) {
    const style = await this.modalPom.modalContent.getAttribute("style");
    expect(/width:\s*100%;.*height:\s*100%/.test(style ?? "")).toBe(fullscreen);
  }
}
