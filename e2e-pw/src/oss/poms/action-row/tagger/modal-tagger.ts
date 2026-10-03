import { Locator, Page } from "src/oss/fixtures";
import { ModalPom } from "../../modal";
import { afterPopout } from "../popout";

export class ModalTaggerPom {
  readonly locator: Locator;

  constructor(
    private readonly page: Page,
    private readonly modal: ModalPom,
  ) {
    this.locator = modal.locator.getByTestId("popout");
  }

  async toggleOpen() {
    await this.modal.locator.getByTestId("action-tag-sample-labels").click();
    await this.locator.getByTestId("tagger-container").hover();
  }

  async switchTagMode(mode: "sample" | "label") {
    await this.locator.getByTestId(`tagger-switch-${mode}`).click();
  }

  /** Apply the pending tags; the tagger closes once they are written */
  private async apply() {
    await afterPopout(this.modal.eventUtils, "popout", false, () =>
      this.locator.getByTestId("button-Apply").click(),
    );
  }

  async addSampleTag(tag: string) {
    await this.locator.getByTestId("sample-tag-input").fill(tag);
    await this.locator.getByTestId("sample-tag-input").press("Enter");
    await this.apply();
  }

  async addLabelTag(tag: string) {
    await this.locator.getByTestId("label-tag-input").fill(tag);
    await this.locator.getByTestId("label-tag-input").press("Enter");
    await this.apply();
  }
}
