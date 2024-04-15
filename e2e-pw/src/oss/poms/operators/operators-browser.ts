import { Locator, Page, expect } from "src/oss/fixtures";

export class OperatorsBrowserPom {
  readonly page: Page;
  readonly locator: Locator;
  readonly assert: OperatorsBrowserAsserter;
  readonly selectionCount: Locator;

  constructor(page: Page) {
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

  choose(operator: string) {
    return this.locator.getByText(operator).click();
  }
}

class OperatorsBrowserAsserter {
  constructor(private readonly panelPom: OperatorsBrowserPom) {}

  async isOpen() {
    await expect(this.panelPom.locator).toBeVisible();
  }
}
