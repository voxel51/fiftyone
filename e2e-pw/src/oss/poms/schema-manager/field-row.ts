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
    return await this.locator
      .locator(".text-content-text-secondary ")
      .textContent();
  }

  /**
   * Check the checkbox, if it exists
   */
  async check() {
    await this.checkbox.click();
    await this.assert.isChecked(true);
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
   * Uncheck the checkbox, if it exists
   */
  async uncheck() {
    await this.checkbox.click();
    await this.assert.isChecked(false);
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
}
