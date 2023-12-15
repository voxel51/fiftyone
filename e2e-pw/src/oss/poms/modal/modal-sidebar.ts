import { Locator, Page, expect } from "src/oss/fixtures";
import { Duration } from "src/oss/utils";

export class ModalSidebarPom {
  readonly page: Page;
  readonly locator: Locator;
  readonly assert: SidebarAsserter;

  constructor(page: Page) {
    this.page = page;

    this.assert = new SidebarAsserter(this);
    this.locator = page.getByTestId("modal").getByTestId("sidebar");
  }

  async getSidebarEntryText(key: string) {
    return this.locator.getByTestId(key).textContent();
  }

  async getSampleTagCount() {
    return Number(await this.getSidebarEntryText("sidebar-entry-tags"));
  }

  async getLabelTagCount() {
    return Number(
      await this.locator
        .getByTestId("sidebar-field-container-_label_tags")
        .getByTestId("entry-count-all")
        .textContent()
    );
  }

  async getSampleId() {
    return this.getSidebarEntryText("sidebar-entry-id");
  }

  async getSampleFilepath(abs = true) {
    const absPath = await this.getSidebarEntryText("sidebar-entry-filepath");

    if (!abs) {
      return absPath.split("/").at(-1);
    }

    return absPath;
  }

  async toggleSidebarGroup(name: string) {
    await this.locator.getByTestId(`sidebar-group-entry-${name}`).click();
  }
}

class SidebarAsserter {
  constructor(private readonly modalSidebarPom: ModalSidebarPom) {}

  async verifySidebarEntryText(key: string, value: string) {
    const text = await this.modalSidebarPom.locator
      .getByTestId(`sidebar-entry-${key}`)
      .textContent();
    expect(text).toBe(value);
  }

  async verifySidebarEntryTexts(entries: { [key: string]: string }) {
    await Promise.all(
      Object.entries(entries).map(([key, value]) =>
        this.verifySidebarEntryText(key, value)
      )
    );
  }

  async verifySampleTagCount(count: number) {
    await this.modalSidebarPom.page.waitForFunction(
      (count_) => {
        return (
          Number(
            document.querySelector("#modal [data-cy='sidebar-entry-tags']")
              .textContent
          ) === count_
        );
      },
      count,
      {
        timeout: Duration.Seconds(1),
      }
    );
  }

  async verifyLabelTagCount(count: number) {
    await this.modalSidebarPom.page.waitForFunction(
      (count_) => {
        return (
          Number(
            document.querySelector(
              "#modal [data-cy='sidebar-field-container-_label_tags'] [data-cy='entry-count-all']"
            ).textContent
          ) === count_
        );
      },
      count,
      {
        timeout: Duration.Seconds(1),
      }
    );
  }
}
