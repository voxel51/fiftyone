import { Locator, Page, expect } from "src/oss/fixtures";
import { Duration } from "src/oss/utils";

const MODAL_LOCATOR = "[data-cy=modal]";

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

  async switchMode(mode: "annotate" | "explore") {
    await this.locator.getByTestId(mode).click();
  }

  async toggleLabelCheckbox(field: string) {
    await this.locator.getByTestId(`checkbox-${field}`).click();
  }

  async toggleSidebarGroup(name: string) {
    await this.locator.getByTestId(`sidebar-group-entry-${name}`).click();
  }

  // =========================================================================
  // Annotation sidebar actions
  // =========================================================================

  /**
   * The modal locator (parent of sidebar)
   */
  get modal() {
    return this.page.locator(MODAL_LOCATOR);
  }

  /**
   * Click the "Schema" button in the annotation sidebar actions area
   */
  async clickSchemaButton() {
    await this.modal.getByRole("button", { name: "Schema" }).click();
  }

  /**
   * Click the Classification create button (SVG with title "Classification")
   */
  async clickCreateClassification() {
    await this.modal.locator('svg:has-text("Classification")').click();
  }

  /**
   * Click the Detection create button (SVG with title "Detection")
   */
  async clickCreateDetection() {
    await this.modal.locator('svg:has-text("Detection")').click();
  }

  /**
   * Click a primitive entry by its field path name
   */
  async clickPrimitiveEntry(path: string) {
    await this.modal.getByText(path, { exact: true }).click();
  }

  /**
   * The field dropdown (MUI Select) in the annotation editing view
   */
  get fieldDropdown() {
    return this.modal.locator('.MuiSelect-select[role="combobox"]');
  }

  /**
   * Get a portalled field dropdown option by name
   */
  getFieldOption(name: string) {
    return this.page.getByRole("option", { name });
  }

  /**
   * Select a field from the annotation editing field dropdown
   */
  async selectField(name: string) {
    await this.fieldDropdown.click();
    await this.getFieldOption(name).click();
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

  /**
   * Assert that annotation is disabled with a specific message
   */
  async hasDisabledMessage(messageSubstring: string) {
    await expect(
      this.modalSidebarPom.locator.getByText(messageSubstring)
    ).toBeVisible();
  }

  // =========================================================================
  // Annotation editing assertions
  // =========================================================================

  /**
   * Assert the field dropdown is visible and contains a specific field
   */
  async hasFieldOption(name: string) {
    await expect(this.modalSidebarPom.fieldDropdown).toBeVisible();
    await this.modalSidebarPom.fieldDropdown.click();
    await expect(this.modalSidebarPom.getFieldOption(name)).toBeVisible();
    // close the dropdown by pressing Escape
    await this.modalSidebarPom.page.keyboard.press("Escape");
  }

  /**
   * Assert that a radio option with the given label is visible
   */
  async hasRadioOption(label: string) {
    await expect(
      this.modalSidebarPom.modal.getByRole("radio", { name: label })
    ).toBeVisible();
  }

  /**
   * Assert that all provided radio options are visible
   */
  async hasRadioOptions(labels: string[]) {
    for (const label of labels) {
      await this.hasRadioOption(label);
    }
  }

  /**
   * Assert that a slider is visible with the given min and max values
   */
  async hasSliderWithRange(min: string, max: string) {
    const slider = this.modalSidebarPom.modal.locator('[role="slider"]');
    await expect(slider).toBeVisible();
    await expect(slider).toHaveAttribute("aria-valuemin", min);
    await expect(slider).toHaveAttribute("aria-valuemax", max);
  }
}
