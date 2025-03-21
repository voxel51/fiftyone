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

  async applyFilter(label: string) {
    const selectionDiv = this.locator
      .getByTestId("checkbox-" + label)
      .getByTitle(label);
    await selectionDiv.click({ force: true });
  }

  async applySearch(field: string, search: string) {
    const input = this.locator.getByTestId(`selector-sidebar-search-${field}`);
    await input.fill(search);
    await input.press("Enter");
  }

  async clearGroupFilters(name: string) {
    return this.locator.getByTestId(`clear-filters-${name}`).click();
  }

  async clickFieldDropdown(field: string) {
    return this.locator
      .getByTestId(`sidebar-field-arrow-enabled-${field}`)
      .click();
  }

  getSidebarEntry(key: string) {
    return this.locator.getByTestId(`sidebar-entry-${key}`);
  }

  async getSidebarEntryText(key: string) {
    return this.getSidebarEntry(key).textContent();
  }

  async getSampleTagCount() {
    return Number(await this.getSidebarEntryText("tags"));
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
    return this.getSidebarEntryText("id");
  }

  async getSampleFilepath(abs = true) {
    const absPath = await this.getSidebarEntryText("filepath");

    if (!abs) {
      return absPath.split("/").at(-1);
    }

    return absPath;
  }

  async toggleLabelCheckbox(field: string) {
    await this.locator.getByTestId(`checkbox-${field}`).click();
  }

  async toggleSidebarGroup(name: string) {
    await this.locator.getByTestId(`sidebar-group-entry-${name}`).click();
  }
}

class SidebarAsserter {
  constructor(private readonly modalSidebarPom: ModalSidebarPom) {}

  async verifySidebarEntryText(key: string, value: string) {
    const text = await this.modalSidebarPom.getSidebarEntryText(key);
    expect(text).toBe(value);
  }

  async waitUntilSidebarEntryTextEquals(key: string, value: string) {
    return this.modalSidebarPom.page.waitForFunction(
      ({ key_, value_ }: { key_: string; value_: string }) => {
        return (
          document.querySelector(`[data-cy='sidebar-entry-${key_}']`)
            .textContent === value_
        );
      },
      { key_: key, value_: value },
      { timeout: 5000 }
    );
  }

  async waitUntilSidebarEntryTextEqualsMultiple(entries: {
    [key: string]: string;
  }) {
    await Promise.all(
      Object.entries(entries).map(([key, value]) =>
        this.waitUntilSidebarEntryTextEquals(key, value)
      )
    );
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

  async verifyObject(key: string, obj: { [key: string]: string }) {
    const locator = this.modalSidebarPom.getSidebarEntry(key);

    for (const k in obj) {
      const v = obj[k];
      const entry = locator.getByTestId(`key-value-${k}-${v}`);

      await expect(entry.getByTestId(`key-${k}`)).toHaveText(k);
      await expect(entry.getByTestId(`value-${v}`)).toHaveText(v);
    }
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
