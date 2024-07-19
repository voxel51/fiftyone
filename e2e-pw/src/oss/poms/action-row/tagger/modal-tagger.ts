import { Locator } from "src/oss/fixtures";
import { EventUtils } from "src/shared/event-utils";
import { ModalPom } from "../../modal";

export class ModalTaggerPom {
  readonly locator: Locator;

  constructor(
    private readonly eventUtils: EventUtils,
    private readonly modal: ModalPom
  ) {
    this.locator = modal.locator.getByTestId("popout");
  }

  get #button() {
    return this.modal.locator.getByTestId("action-tag-sample-labels");
  }

  async close() {
    this.#button.click();
  }

  async addTag(tag: string) {
    await this.locator.getByTestId("tag-input").fill(tag);
    await this.locator.getByTestId("tag-input").press("Enter");
    await this.locator.getByTestId("button-Apply").click();
  }

  async load<T>(wrap: () => Promise<T>): Promise<T> {
    const promise =
      this.eventUtils.getEventReceivedPromiseForPredicate("tagging-loaded");
    const result = await wrap();
    await promise;
    return result;
  }

  async open() {
    await this.load(() => this.#button.click());
  }

  async switchTagMode(mode: "sample" | "label") {
    await this.locator.getByTestId(`tagger-switch-${mode}`).click();
  }
}
