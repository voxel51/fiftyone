import { Locator, Page, expect } from "src/oss/fixtures";
import { EventUtils } from "src/shared/event-utils";
import { PROMPT_EVENT, promptDetail } from "./operators-prompt";

export class OperatorsBrowserPom {
  readonly page: Page;
  readonly locator: Locator;
  readonly assert: OperatorsBrowserAsserter;
  readonly selectionCount: Locator;

  constructor(
    page: Page,
    private readonly eventUtils: EventUtils,
  ) {
    this.page = page;
    this.assert = new OperatorsBrowserAsserter(this);

    this.locator = this.page.getByTestId("operators-browser");
  }

  get browseOperationsBtn() {
    return this.page.getByTestId("action-browse-operations");
  }

  show() {
    return this.browseOperationsBtn.click();
  }

  search(term: string) {
    return this.locator.getByTestId("operators-browser-search").fill(term);
  }

  /** Choose an operator; resolves once its prompt shows a form or runs */
  choose(operator: string) {
    return this.eventUtils.after(
      PROMPT_EVENT,
      () => this.locator.getByText(operator).click(),
      (e) => promptDetail(e).phase !== "closed",
    );
  }
}

class OperatorsBrowserAsserter {
  constructor(private readonly panelPom: OperatorsBrowserPom) {}

  async isOpen() {
    expect(await this.panelPom.locator.isVisible()).toBe(true);
  }
}
