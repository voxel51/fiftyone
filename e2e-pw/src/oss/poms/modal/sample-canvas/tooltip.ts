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
   * The tooltip content locator
   */
  get content() {
    return this.page.getByTestId("sample-canvas-tooltip-content");
  }

  /**
   * The locked tooltip locator
   */
  get locked() {
    return this.page.getByTestId("sample-canvas-tooltip-locked");
  }

  /**
   * The tooltip title locator
   */
  get title() {
    return this.page.getByTestId("sample-canvas-tooltip-title");
  }

  /**
   * The unlocked tooltip locator
   */
  get unlocked() {
    return this.page.getByTestId("sample-canvas-tooltip-unlocked");
  }

  /**
   *
   * @param name The attribute name
   * @param hidden Whether the attribute is in the "Hidden" section
   * @returns A {@link Locator}
   */
  getAttribute(name: string, hidden = false) {
    let locator = this.content;
    if (hidden) {
      locator = this.content.getByTestId("hidden-attributes");
    }
    return locator.getByTestId(`attribute-${name}`);
  }

  /**
   * Enter quick edit via the tooltip. The tooltip must be visible and locked
   * for this action to succeed.
   */
  async quickEdit() {
    await this.locked.hover();
    await this.locked.getByTestId("quick-edit").click();
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
  constructor(private readonly tooltipPom: TooltipPom) { }

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
    const locator = this.tooltipPom.content;
    return visible
      ? await expect(locator).toBeVisible()
      : await expect(locator).toBeHidden();
  }

  /**
   * Does the tooltip have this field name
   *
   * @param field The field name
   */
  async hasField(field: string) {
    await expect(this.tooltipPom.title).toHaveText(field);
  }

  /**
   * Does the tooltip have this label attribute
   *
   * @param attribute An attribute
   * @param value The value
   * @param hidden  Whether the attribute is in the "hidden" section
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

  /**
   * Is the tooltip behind the schema manager modal (z-index regression test)
   *
   * This verifies that the schema manager's ModalBackground has a higher
   * z-index than the TooltipInfo, preventing locked canvas tooltips from appearing above
   * the modal overlay.
   */
  async isBehindSchemaManager() {
    const bbox = await this.tooltipPom.locked.boundingBox();
    if (!bbox) {
      throw new Error("Tooltip must be visible and locked to check stacking order");
    }

    // Click the center of the tooltip and check if it is covered by the schema manager modal
    const isCovered = await this.tooltipPom.page.evaluate(
      ({ x, y }: { x: number; y: number }) => {
        const el = document.elementFromPoint(x, y);
        return (
          el?.closest('[data-cy="schema-manager"]') !== null ||
          el?.getAttribute("data-cy") === "schema-manager"
        );
      },
      { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 }
    );

    expect(isCovered).toBe(true);
  }
}
