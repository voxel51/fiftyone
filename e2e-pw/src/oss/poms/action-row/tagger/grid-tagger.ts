import { Page } from "src/oss/fixtures";

type TaggerMode = "sample" | "label";

export class GridTaggerPom {
  constructor(private readonly page: Page) {}

  async setActiveTaggerMode(mode: TaggerMode) {
    const selector = this.page.getByTestId(`tagger-switch-${mode}`);
    return selector.click();
  }

  async getTagInputTextPlaceholder() {
    const value = this.page.getByTestId(`tag-input`);
    const placeHolderText = await value.getAttribute("placeholder");
    return placeHolderText;
  }

  async addNewTag(tag: string) {
    const input = this.page.getByTestId(`tag-input`);
    await input.fill(tag);
    await this.page.keyboard.press("Enter");
    const applyButton = this.page.getByTestId(`button-Apply`);
    await applyButton.click();
  }
}
