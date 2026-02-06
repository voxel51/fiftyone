import { Page, expect } from "src/oss/fixtures";
import type { EventUtils } from "src/shared/event-utils";

/**
 * The sample canvas tooltip shown when hovering over labels in the sample
 * modal's canvas. Applies to image, video and 3D media types.
 */
export class TooltipPom {
  readonly assert: TooltipAsserter;

  constructor(readonly page: Page, readonly eventUtils: EventUtils) {
    this.assert = new TooltipAsserter(this);
  }

  /**
   * The tooltip locator
   */
  get locator() {
    return this.page.getByTestId("sample-canvas-tooltip");
  }

  /**
   * The tooltip title locator
   */
  get title() {
    return this.locator.getByTestId("sample-canvas-tooltip-title");
  }

  /**
   * The locked tooltip locator
   */
  get locked() {
    return this.page.getByTestId("sample-canvas-tooltip locked");
  }

  /**
   *
   * @param name The attribute name
   * @param hidden Whether the attribute is in the "Hidden" section
   * @returns A {Locator}
   */
  getAttribute(name: string, hidden = false) {
    let locator = this.locator;
    if (hidden) {
      locator = this.locator.getByTestId("hidden-attributes");
    }
    return locator.getByTestId(`attribute-${name}`);
  }

  /**
   * Enter quick edit via the tooltip. The tooltip must be visible and locked
   * for this action to succeed.
   */
  async quickEdit() {
    await this.locator.getByTestId("quick-edit").click();
  }

  /**
   * Toggle the mode of the tooltip. Locked or unlocked
   */
  async toggleLock() {
    await this.page.keyboard.press("Control");
  }
}

/**
 * Sample canvas tooltip asserter
 */
class TooltipAsserter {
  constructor(private readonly tooltipPom: TooltipPom) {}

  /**
   * Is the tooltip locked
   *
   * @param locked Whether the tooltip is expected to be locked or not
   */
  async isLocked(locked = true) {
    return locked
      ? await expect(this.tooltipPom.locked).toBeVisible()
      : await expect(this.tooltipPom.locked).toBeAttached({ attached: false });
  }

  /**
   * Is the tooltip visible
   *
   * @param visible Whether it is expected to be visibile or not
   */
  async isVisible(visible = true) {
    const locator = this.tooltipPom.locator;
    return visible
      ? await expect(locator).toBeVisible()
      : await expect(locator).toBeHidden();
  }

  /**
   * Does the tooltip have this field name
   *
   * @param name The field name
   */
  async hasField(field: string) {
    await expect(this.tooltipPom.title).toHaveText(field);
  }

  /**
   * Does the tooltip have this label attribute
   *
   * @param attribute An attribute
   * @param value Whether the
   * @param hidden
   */
  async hasAttribute(attribute: string, value: string, hidden?: boolean) {
    const locator = this.tooltipPom.getAttribute(attribute, hidden);

    await expect(locator).toBeVisible();
    await expect(locator).toHaveText(value);
  }

  /**
   * Does the tooltip have these label attributes
   *
   * @param attributes A list of attributes
   */
  async hasAttributes(
    attributes: { attribute: string; value: string; hidden?: boolean }[]
  ) {
    const promises: Promise<void>[] = [];
    for (const attribute of attributes) {
      promises.push(
        this.hasAttribute(
          attribute.attribute,
          attribute.value,
          attribute.hidden
        )
      );
    }

    await Promise.all(promises);
  }
}
