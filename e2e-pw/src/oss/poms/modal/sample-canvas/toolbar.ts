import { Page, expect } from "src/oss/fixtures";

/**
 * The Lighter toolbar shown when hovering over the sample canvas in annotate
 * mode. Provides zoom and help actions.
 */
export class ToolbarPom {
  readonly assert: ToolbarAsserter;

  constructor(readonly page: Page) {
    this.assert = new ToolbarAsserter(this);
  }

  /**
   * The toolbar container locator (scoped to sample canvas).
   */
  get locator() {
    return this.page
      .getByTestId("sample-canvas")
      .getByTestId("lighter-toolbar");
  }
}

/**
 * Sample canvas toolbar asserter
 */
class ToolbarAsserter {
  constructor(private readonly toolbarPom: ToolbarPom) {}

  /**
   * Assert the toolbar is visible or hidden.
   *
   * @param visible Whether the toolbar is expected to be visible (default true)
   */
  async isVisible(visible = true) {
    expect(await this.toolbarPom.locator.isVisible()).toBe(visible);
  }
}
