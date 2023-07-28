import { Locator, Page } from "src/oss/fixtures";
import { Duration } from "../../utils";
import { ModalGroupActionsPom } from "./group-actions";
import { ModalSidebarPom } from "./modal-sidebar";
import { ModalVideoControlsPom } from "./video-controls";

export class ModalPom {
  readonly page: Page;
  readonly sidebar: ModalSidebarPom;
  readonly locator: Locator;
  readonly group: ModalGroupActionsPom;
  readonly video: ModalVideoControlsPom;

  constructor(page: Page) {
    this.page = page;
    this.locator = page.getByTestId("modal");

    this.sidebar = new ModalSidebarPom(page);
    this.group = new ModalGroupActionsPom(page, this);
    this.video = new ModalVideoControlsPom(page, this);
  }

  async navigateSample(direction: "forward" | "backward") {
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

    return this.waitForSampleLoadDomAttribute();
  }

  async navigateNextSample() {
    return this.navigateSample("forward");
  }

  async navigatePreviousSample() {
    return this.navigateSample("backward");
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

  async waitForSampleLoadDomAttribute() {
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
