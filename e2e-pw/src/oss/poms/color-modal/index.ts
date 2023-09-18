import { Locator, Page, expect } from "src/oss/fixtures";

export class ColorModalPom {
  readonly page: Page;
  readonly colorModal: Locator;

  constructor(page: Page) {
    this.page = page;
    this.colorModal = page.locator("#colorModal");
  }

  getFieldSelector(fieldName: string) {
    return this.page.getByTestId(fieldName);
  }

  async closeColorModal() {
    await this.getFieldSelector("close-color-modal").click();
  }

  async selectActiveField(fieldName: string) {
    const fieldSelector = this.page.getByTestId(
      `color-modal-list-item-${fieldName}`
    );
    return fieldSelector.click();
  }

  async setColorBy(mode: "value" | "field") {
    const globalTab = this.page.getByTestId(
      "color-modal-list-item-Global settings"
    );
    await globalTab.click();
    const modeButton = this.page.getByTestId(`radio-button-${mode}`);
    return modeButton.click();
  }

  async shuffleColors() {
    const globalTab = this.page.getByTestId(
      "color-modal-list-item-Global settings"
    );
    await globalTab.click();
    const shuffleButton = this.page.getByTestId("shuffle-colors");
    return shuffleButton.click();
  }

  async useColorBlindColors() {
    const globalTab = this.page.getByTestId(
      "color-modal-list-item-Global settings"
    );
    await globalTab.click();
    const colorSettingCheckbox = this.page.getByTestId(
      "checkbox-Use color blind friendly option"
    );
    return colorSettingCheckbox.click();
  }

  async setOpacity(value: number) {}

  async useMultiColorKeypoints() {
    const globalTab = this.page.getByTestId(
      "color-modal-list-item-Global settings"
    );
    await globalTab.click();
    const useMultiColorKeypointsCheckbox = this.page.getByTestId(
      "checkbox-Multicolor keypoints"
    );
    return useMultiColorKeypointsCheckbox.click();
  }

  // field level setting
  async toggleColorMode() {
    const toggleButton = this.page.getByTestId(
      "button-toggle between color by value or color by field mode"
    );
    return toggleButton.click();
  }

  async useSpecialFieldColor(fieldName: string) {
    return this.page
      .getByTitle(`Use custom color for ${fieldName} field`)
      .first()
      .click({ force: true });
  }

  async setSpecialFieldColor(color: string) {
    const container = this.page.getByTestId("field-color-div");
    await container.isVisible();
    await container.getByRole("textbox").fill(color);
  }

  // value level setting
  async selectColorByAttribute(field: string) {
    await this.colorModal
      .getByTestId("select-attribute")
      .click({ force: true });
    await this.colorModal
      .getByTestId(`filter-option-${field}`)
      .click({ force: true });
  }

  async addANewPair(value: string, color: string) {
    const addButton = this.page.getByTestId("button-add a new pair");
    await addButton.click();
    await this.page.getByPlaceholder("Value (e.g. 'car')").last().fill(value);
    await this.page.getByPlaceholder("#dd00dd").last().fill(color);
  }

  async getJSONEditor() {
    return this.page.getByTestId("color-scheme-editor");
  }

  // action buttons
  async saveAsDefault() {
    const saveAsDefaultButton = this.page.getByTestId(
      "button-Save to dataset appConfig"
    );
    return saveAsDefaultButton.click();
  }

  async resetColorScheme() {
    const resetButton = this.page.getByTestId(
      "button-Clear session settings and revert to default settings"
    );
    return resetButton.click();
  }

  async clearDefault() {
    const clearDefaultButton = this.page.getByTestId("button-Clear default");
    return clearDefaultButton.click();
  }
}
