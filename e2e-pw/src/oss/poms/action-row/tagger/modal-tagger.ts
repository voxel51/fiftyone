import { Locator, Page } from "src/oss/fixtures";
import { ModalPom } from "../../modal";

export class ModalTaggerPom {
  readonly locator: Locator;

  constructor(private readonly page: Page, private readonly modal: ModalPom) {
    this.locator = modal.locator.getByTestId("popout");
  }

  async toggleOpen() {
    await this.modal.locator.getByTestId("action-tag-sample-labels").click();
  }

  async switchTagMode(mode: "sample" | "label") {
    await this.locator.getByTestId(`tagger-switch-${mode}`).click();
  }

  async addSampleTag(tag: string) {
    await this.locator.getByTestId("sample-tag-input").fill(tag);
    await this.locator.getByTestId("sample-tag-input").press("Enter");
    await this.locator.getByTestId("button-Apply").click();
  }

  async addLabelTag(tag: string) {
    await this.locator.getByTestId("label-tag-input").fill(tag);
    await this.locator.getByTestId("label-tag-input").press("Enter");
    await this.locator.getByTestId("button-Apply").click();
  }
}
