import { Locator, Page } from "src/oss/fixtures";

type TaggerMode = "sample" | "label";

export class TaggerPom {
  constructor(private readonly page: Page) {}

  async setActiveTaggerMode(mode: TaggerMode) {
    const selector = this.page.getByTestId(`tagger-switch-${mode}`);
    return selector.click();
  }

  async getTagInputTextPlaceholder(mode: TaggerMode) {
    const value = this.page.getByTestId(`${mode}-tag-input`);
    const placeHolderText = await value.getAttribute("placeholder");
    return placeHolderText;
  }

  async addNewTag(mode: TaggerMode, tag: string) {
    const input = this.page.getByTestId(`${mode}-tag-input`);
    await input.type(tag);
    await this.page.keyboard.press("Enter");
    const applyButton = this.page.getByTestId(`button-Apply`);
    await applyButton.click();
  }
}
