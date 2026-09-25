import { Page, expect } from "src/oss/fixtures";
import { collapseWhitespace, isElementCoveredBy } from "src/oss/utils";
import type { EventUtils } from "src/shared/event-utils";

/**
 * The sample canvas tooltip shown when hovering over labels in the sample
 * modal's canvas. Applies to image, video and 3D media types.
 */
export class TooltipPom {
  readonly assert: TooltipAsserter;

  constructor(
    readonly page: Page,
    readonly eventUtils: EventUtils,
  ) {
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

  /** Run `action` (a hover) and resolve once the tooltip has shown */
  afterShown<T>(action: () => Promise<T>): Promise<T> {
    return this.eventUtils.after(
      "e2e:modal:tooltip",
      action,
      (e) => (e.detail as { visible: boolean }).visible,
    );
  }

  /** Lock the shown tooltip; Control locks it and never unlocks it */
  async toggleLock() {
    await this.eventUtils.after(
      "e2e:modal:tooltip",
      () => this.page.keyboard.press("Control"),
      (e) => (e.detail as { locked: boolean }).locked,
    );
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
    if (locked) {
      expect(await this.tooltipPom.locked.isVisible()).toBe(true);
    } else {
      expect(await this.tooltipPom.locked.count()).toBe(0);
    }
  }

  /**
   * Is the tooltip visible
   *
   * @param visible Whether it is expected to be visibile or not
   */
  async isVisible(visible = true) {
    expect(await this.tooltipPom.content.isVisible()).toBe(visible);
  }

  /**
   * Does the tooltip have this field name
   *
   * @param field The field name
   */
  async hasField(field: string) {
    expect(collapseWhitespace(await this.tooltipPom.title.textContent())).toBe(
      field,
    );
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

    expect(await locator.isVisible()).toBe(true);
    expect(collapseWhitespace(await locator.textContent())).toBe(value);
  }

  /**
   * Does the tooltip have these label attributes
   *
   * @param attributes A list of attributes
   */
  async hasAttributes(
    attributes: { attribute: string; value: string; hidden?: boolean }[],
  ) {
    const promises: Promise<void>[] = [];
    for (const attribute of attributes) {
      promises.push(
        this.hasAttribute(
          attribute.attribute,
          attribute.value,
          attribute.hidden,
        ),
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
      throw new Error(
        "Tooltip must be visible and locked to check stacking order",
      );
    }

    const isCovered = await isElementCoveredBy(
      this.tooltipPom.page,
      { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 },
      '[data-cy="schema-manager"]',
    );

    expect(isCovered).toBe(true);
  }
}
