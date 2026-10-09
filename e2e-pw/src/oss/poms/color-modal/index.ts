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

  // field level setting
  async changeColorMode(mode: "value" | "field" | "instance") {
    await this.getFieldSelector("color-by-attribute").click();
    // picking an option closes the popout in the click's own render
    await this.getFieldSelector(`option-${mode}`).click();
  }

  async useCustomValueColors() {
    await this.getFieldSelector(
      "checkbox-Use custom colors for specific field values",
    ).click();
  }

  /** Enter the value of pair `index`, which applies it */
  async setPairValue(value: string, index: number) {
    await this.getFieldSelector(`input-value-${index}`).focus();
    await this.getFieldSelector(`input-value-${index}`).fill(value);
    await this.page.keyboard.press("Enter");
  }

  /** Enter the color of pair `index`, which applies it */
  async setPairColor(color: string, index: number) {
    await this.getFieldSelector(`input-color-${index}`).focus();
    await this.getFieldSelector(`input-color-${index}`).clear();
    await this.getFieldSelector(`input-color-${index}`).fill(color);
    await this.page.keyboard.press("Enter");
  }
}

class ColorModalAsserter {
  constructor(private readonly colorModalPom: ColorModalPom) {}

  async isColorByModeEqualTo(mode: "value" | "field" | "instance") {
    expect(
      await this.colorModalPom.colorModal
        .getByTestId(`radio-button-${mode}`)
        .getByRole("radio")
        .isChecked(),
    ).toBe(true);
  }
}
