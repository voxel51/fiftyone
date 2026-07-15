import { Page, expect } from "src/oss/fixtures";
import type { EventUtils } from "src/shared/event-utils";

/**
 * The Lighter toolbar shown when hovering over the sample canvas in annotate
 * mode. Provides zoom and help actions.
 */
export class ToolbarPom {
  readonly assert: ToolbarAsserter;

  constructor(
    readonly page: Page,
    readonly eventUtils: EventUtils,
  ) {
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

  /**
   * Click the Zoom in button.
   */
  async zoomIn() {
    await this.locator.getByTestId("zoom-in").click();
  }

  /**
   * Click the Zoom out button.
   */
  async zoomOut() {
    await this.locator.getByTestId("zoom-out").click();
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
    const locator = this.toolbarPom.locator;
    return visible
      ? await expect(locator).toBeVisible()
      : await expect(locator).toBeHidden();
  }
}
