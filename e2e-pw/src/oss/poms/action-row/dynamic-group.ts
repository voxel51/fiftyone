import { Locator, Page } from "src/oss/fixtures";
import { EventUtils } from "src/shared/event-utils";
import { SelectorPom } from "../selector";

export class DynamicGroupPom {
  private readonly container: Locator;
  private readonly resetBtn: Locator;
  private readonly submitBtn: Locator;

  readonly groupBy: SelectorPom;
  readonly orderBy: SelectorPom;

  constructor(private readonly page: Page, eventUtils: EventUtils) {
    this.container = this.page.getByTestId("dynamic-group-action-container");
    this.groupBy = new SelectorPom(
      page,
      eventUtils,
      "dynamic-group-action-group-by"
    );
    this.orderBy = new SelectorPom(
      page,
      eventUtils,
      "dynamic-group-action-order-by"
    );
    this.submitBtn = this.page.getByTestId("dynamic-group-action-submit");
    this.resetBtn = this.page.getByTestId("dynamic-group-action-reset");
  }

  async reset() {
    await this.resetBtn.click();
  }

  async selectTabOption(option: "Ordered" | "Unordered") {
    await this.container.getByTestId(`tab-option-${option}`).click();
  }

  async submit() {
    await this.submitBtn.click();
  }
}
