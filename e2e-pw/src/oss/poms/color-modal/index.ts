import { Locator, Page } from "src/oss/fixtures";

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
    await this.getFieldSelector(`color-modal-list-item-${fieldName}`).click();
  }

  async setColorBy(mode: "value" | "field") {
    await this.getFieldSelector(
      "color-modal-list-item-Global settings"
    ).click();
    await this.getFieldSelector(`radio-button-${mode}`).click();
  }

  async shuffleColors() {
    await this.getFieldSelector(
      "color-modal-list-item-Global settings"
    ).click();
    await this.getFieldSelector("shuffle-colors").click();
  }

  async useColorBlindColors() {
    await this.getFieldSelector(
      "color-modal-list-item-Global settings"
    ).click();
    await this.getFieldSelector(
      "checkbox-Use color blind friendly option"
    ).click();
  }

  async useMultiColorKeypoints() {
    await this.getFieldSelector(
      "color-modal-list-item-Global settings"
    ).click();
    await this.getFieldSelector("checkbox-Multicolor keypoints").click();
  }

  // field level setting
  async changeColorMode(mode: "value" | "field" | "instance") {
    await this.getFieldSelector("color-by-attribute").click();
    await this.getFieldSelector(`option-${mode}`).click();
  }

  async useSpecialFieldColor(fieldName: string) {
    await this.page
      .getByTitle(`Use custom color for ${fieldName} field`)
      .first()
      .click({ force: true });
  }

  async setSpecialFieldColor(color: string) {
    await this.getFieldSelector("field-color-div").isVisible();
    await this.getFieldSelector("field-color-div")
      .getByRole("textbox")
      .fill(color);
  }

  // value level setting
  async selectColorByAttribute(field: string) {
    await this.colorModal
      .getByTestId("custom-colors-select-attribute")
      .click({ force: true });
    await this.colorModal
      .getByTestId(`filter-option-${field}`)
      .click({ force: true });
  }

  async addNewPairs(pairs: { value: string; color: string }[]) {
    for (const pair of pairs) {
      await this.addANewPair(pair.value, pair.color);
    }
  }

  async addANewPair(value: string, color: string) {
    await this.getFieldSelector("button-add a new pair").click();
    await this.page.getByPlaceholder("Value (e.g. 'car')").last().fill(value);
    await this.page.getByPlaceholder("#009900").last().fill(color);
  }

  async getJSONEditor() {
    return this.page.getByTestId("color-scheme-editor");
  }

  // action buttons
  async saveAsDefault() {
    const saveAsDefaultButton = this.page.getByTestId(
      "button-Save to dataset appConfig"
    );
    await saveAsDefaultButton.click();
  }

  async resetColorScheme() {
    const resetButton = this.page.getByTestId(
      "button-Clear session settings and revert to default settings"
    );
    await resetButton.click();
  }

  async clearDefault() {
    const clearDefaultButton = this.page.getByTestId("button-Clear default");
    await clearDefaultButton.click();
  }
}
