import { Page, expect } from "src/oss/fixtures";
import type { EventUtils } from "src/shared/event-utils";
import { FieldRowPom } from "./field-row";

/**
 * The schema manager modal accessible via the sample modal's 'Annotate' tab
 */
export class SchemaManagerPom {
  readonly assert: SchemaManagerAsserter;

  constructor(
    readonly page: Page,
    readonly eventUtils: EventUtils,
  ) {
    this.assert = new SchemaManagerAsserter(this);
  }

  /**
   * The schema manager locator
   */
  get locator() {
    return this.page.getByTestId("schema-manager");
  }

  /**
   * The active fields section locator
   */
  get activeFields() {
    return this.locator.getByTestId("active-fields");
  }

  /**
   * The footer, if present
   */
  get footer() {
    return this.locator.getByTestId("edit-field-footer");
  }

  /**
   * The hidden fields section locator
   */
  get hiddenFields() {
    return this.locator.getByTestId("hidden-fields");
  }

  /**
   * Go back using the top-left arrow
   */
  async back() {
    await this.locator.getByTestId("schema-manager-back").click();
  }

  /**
   * Close the modal
   */
  async close() {
    await this.eventUtils.after("e2e:schema-manager:closed", () =>
      this.locator.getByTestId("close-schema-manager").click(),
    );
  }

  /**
   * Open the schema manager modal. The sample modal must be open for the
   * schema manager modal to open
   */
  async open() {
    await this.eventUtils.after("e2e:schema-manager:opened", () =>
      this.page.getByTestId("open-schema-manager").click(),
    );
  }

  /**
   * Get a field row by field name
   *
   * @param field The field name
   * @returns a field row POM
   */
  getFieldRow(field: string) {
    return new FieldRowPom(this.page, this.eventUtils, field, this);
  }

  /**
   * Move the checked fields
   */
  async moveFields() {
    await this.locator.getByTestId("move-fields").click();
  }

  /**
   * Deactivate an active field: check its row and move it to hidden. The field
   * must currently be in the 'Active fields' section.
   *
   * @param field The field path, e.g. "frames.detections" or "events"
   */
  async deactivateField(field: string) {
    const row = this.getFieldRow(field);
    await row.clickCheckbox();
    await row.assert.isChecked(true);
    // the move is a round-trip; the row lands in its new section after it
    await this.afterFieldIn("hidden", field, () => this.moveFields());
  }

  /**
   * Activate a hidden field: check its row and move it to active. The field
   * must currently be in the 'Hidden fields' section.
   *
   * @param field The field path, e.g. "frames.detections" or "events"
   */
  async activateField(field: string) {
    const row = this.getFieldRow(field);
    await row.clickCheckbox();
    await row.assert.isChecked(true);
    await this.afterFieldIn("active", field, () => this.moveFields());
  }

  /** Run `action` and resolve once `section` renders a row for `field` */
  private afterFieldIn<T>(
    section: "active" | "hidden",
    field: string,
    action: () => Promise<T>,
  ): Promise<T> {
    return this.eventUtils.after("e2e:schema-manager:fields", action, (e) => {
      const detail = e.detail as { section: string; paths: string };
      return (
        detail.section === section && detail.paths.split(",").includes(field)
      );
    });
  }
}

/**
 * Schema manager modal asserter
 */
class SchemaManagerAsserter {
  constructor(private readonly schemaManagerPom: SchemaManagerPom) {}

  /**
   * Is the field row in the active fields section
   *
   * @param field the field name
   */
  async isActiveFieldRow(field: string) {
    const locator = this.schemaManagerPom.activeFields.getByTestId(
      `field-row-${field}`,
    );
    expect(await locator.count()).toBe(1);
  }

  /**
   * Is the field row in the hidden fields section
   *
   * @param field the field name
   */
  async isHiddenFieldRow(field: string) {
    const locator = this.schemaManagerPom.hiddenFields.getByTestId(
      `field-row-${field}`,
    );
    expect(await locator.count()).toBe(1);
  }

  /**
   * Is schema manager modal closed
   */
  async isClosed() {
    expect(await this.schemaManagerPom.locator.isVisible()).toBe(false);
  }

  /**
   * Is schema manager modal open
   */
  async isOpen() {
    expect(await this.schemaManagerPom.locator.isVisible()).toBe(true);
  }

  /**
   * Is the "Add schema" button disabled
   */
  async isDisabled() {
    expect(
      await this.schemaManagerPom.page
        .getByTestId("open-schema-manager")
        .isDisabled(),
    ).toBe(true);
  }

  /**
   * Is the "Add schema" button enabled
   */
  async isEnabled() {
    expect(
      await this.schemaManagerPom.page
        .getByTestId("open-schema-manager")
        .isEnabled(),
    ).toBe(true);
  }

  /**
   * Are the provided field rows in the active fields section
   *
   * @param fields a list of name and type rows, .e.g 'id' and 'system'
   */
  async hasActiveFieldRows(fields: { name: string; type: string }[]) {
    const promises = [];
    for (const { name, type } of fields) {
      const row = this.schemaManagerPom.getFieldRow(name);
      promises.push(row.assert.isActiveField());
      promises.push(row.assert.hasType(type));
    }

    await Promise.all(promises);
  }

  /**
   * Are the provided field rows in the hidden fields section
   *
   * @param fields a list of name and type rows, .e.g 'id' and 'system'
   */
  async hasHiddenFieldRows(fields: { name: string; type: string }[]) {
    const promises = [];
    for (const { name, type } of fields) {
      const row = this.schemaManagerPom.getFieldRow(name);
      promises.push(row.assert.isHiddenField());
      promises.push(row.assert.hasType(type));
    }

    await Promise.all(promises);
  }
}
