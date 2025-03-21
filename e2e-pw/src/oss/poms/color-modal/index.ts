import { Locator, Page, expect } from "src/oss/fixtures";

export class ColorModalPom {
  readonly page: Page;
  readonly colorModal: Locator;
  readonly assert: ColorModalAsserter;

  constructor(page: Page) {
    this.page = page;
    this.colorModal = page.locator("#colorModal");
    this.assert = new ColorModalAsserter(this);
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
    for (let i = 0; i < pairs.length; i++) {
      await this.addANewPair(pairs[i].value, pairs[i].color, i);
    }
  }

  async addANewPair(value: string, color: string, index: number) {
    if (index !== 0) {
      await this.getFieldSelector("button-add a new pair").click();
    }

    await this.getFieldSelector(`input-value-${index}`).focus();
    await this.getFieldSelector(`input-value-${index}`).fill(value);
    await this.page.keyboard.press("Enter");

    await this.getFieldSelector(`input-color-${index}`).focus();
    await this.getFieldSelector(`input-color-${index}`).clear();
    await this.getFieldSelector(`input-color-${index}`).fill(color);
    await this.page.keyboard.press("Enter");
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

class ColorModalAsserter {
  constructor(private readonly colorModalPom: ColorModalPom) {}

  async isColorByModeEqualTo(mode: "value" | "field" | "instance") {
    await expect(
      this.colorModalPom.colorModal
        .getByTestId(`radio-button-${mode}`)
        .getByRole("radio")
    ).toBeChecked();
  }
}
