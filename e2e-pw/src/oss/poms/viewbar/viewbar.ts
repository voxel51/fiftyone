import { Locator, Page, expect } from "src/oss/fixtures";

export class ViewBarPom {
  readonly page: Page;
  readonly locator: Locator;
  readonly assert: ViewBarAsserter;
  readonly selectionCount: Locator;

  constructor(page: Page) {
    this.page = page;
    this.assert = new ViewBarAsserter(this);
    this.locator = this.page.getByTestId("view-bar");
  }

  get clearBtn() {
    return this.locator.getByTestId("btn-clear-view-bar");
  }

  get viewStages() {
    return this.locator.getByTestId("view-stage-container");
  }

  clear() {
    return this.clearBtn.click();
  }
}

class ViewBarAsserter {
  constructor(private readonly viewBar: ViewBarPom) {}

  async isVisible() {
    await expect(this.viewBar.locator).toBeVisible();
  }

  async hasViewStage(text: string) {
    await expect(this.viewBar.viewStages).toContainText(text);
  }
}
