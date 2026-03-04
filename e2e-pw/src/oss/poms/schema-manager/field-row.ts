import { expect, Page } from "src/oss/fixtures";
import type { EventUtils } from "src/shared/event-utils";
import type { SchemaManagerPom } from ".";
import { JSONEditorPom } from "./json-editor";

/**
 * A field row of the schema manager. May be active/hidden, checked/unchecked,
 * editable, and have pill attributes such as system and read-only
 */
export class FieldRowPom {
  readonly assert: FieldRowAsserter;

  constructor(
    readonly page: Page,
    readonly eventUtils: EventUtils,
    readonly field: string,
    readonly schemaManager: SchemaManagerPom
  ) {
    this.assert = new FieldRowAsserter(this);
  }

  /**
   * The pencil button locator, if it exists
   */
  get pencil() {
    return this.locator.getByTestId("edit");
  }

  /**
   * The scan button locator, if it exists (shown for unconfigured fields)
   */
  get scanButton() {
    return this.locator.getByTestId("scan");
  }

  /**
   * The checkbox locator, if it exists
   */
  get checkbox() {
    return this.locator.getByRole("checkbox");
  }

  /**
   * The field row locator
   */
  get locator() {
    return this.schemaManager.locator.getByTestId(`field-row-${this.field}`);
  }

  /**
   * Get the type for the field row, e.g. 'int' or 'str'
   */
  async getType() {
    const text = await this.locator
      .getByTestId("secondary-content")
      .textContent();
    return (text ?? "").split(" ")[0];
  }

  /**
   * Check the checkbox, if it exists
   */
  async clickCheckbox() {
    // click must be forced because the field row has an aria-disabled
    // attribute
    await this.checkbox.click({ force: true });
  }

  /**
   * Click the pencil button, if it exists
   */
  async edit() {
    // click must be forced because the field row has an aria-disabled
    // attribute
    await this.pencil.click({ force: true });
    return new JSONEditorPom(
      this.page,
      this.eventUtils,
      this.field,
      this.schemaManager
    );
  }

  /**
   * Click the scan button (for unconfigured fields)
   */
  async scan() {
    // click must be forced because the field row has an aria-disabled
    // attribute
    await this.scanButton.click({ force: true });
    return new JSONEditorPom(
      this.page,
      this.eventUtils,
      this.field,
      this.schemaManager
    );
  }
}

/**
 * Field row asserter
 */
class FieldRowAsserter {
  constructor(private readonly fieldRowPom: FieldRowPom) {}

  /**
   * Is the field row in the 'Active fields' section
   */
  async isActiveField() {
    await this.fieldRowPom.schemaManager.assert.isActiveFieldRow(
      this.fieldRowPom.field
    );
  }

  /**
   * Does the field row have a checkbox, i.e. does it have a label schema
   * configured.
   */
  async hasCheckbox() {
    await expect(this.fieldRowPom.checkbox).toBeVisible();
  }

  /**
   * Is the field row in the 'Hidden fields' section
   */
  async isHiddenField() {
    await this.fieldRowPom.schemaManager.assert.isHiddenFieldRow(
      this.fieldRowPom.field
    );
  }

  /**
   * Is the field row checked (selected)
   *
   * @param checked Whether the checkbox should checked or not
   */
  async isChecked(checked: boolean) {
    await expect(this.fieldRowPom.checkbox).toBeChecked({ checked });
  }

  /**
   * Is the field row editable, i.e. does it have a pencil button
   */
  async isEditable() {
    await expect(this.fieldRowPom.pencil).toBeAttached();
  }

  /**
   * Does the type match
   *
   * @param type The type to compare
   */
  async hasType(type: string) {
    const text = await this.fieldRowPom.getType();
    expect(text).toBe(type);
  }

  /**
   * Open the field's edit view and verify the range inputs match
   */
  async hasRangeConfig(min: string, max: string) {
    await this.fieldRowPom.edit();
    await this.fieldRowPom.schemaManager.assert.hasRangeValues(min, max);
  }

  /**
   * Open the field's edit view and verify the selected component type
   */
  async hasComponentType(id: string) {
    await this.fieldRowPom.edit();
    await this.fieldRowPom.schemaManager.assert.hasSelectedComponentType(id);
  }
}
