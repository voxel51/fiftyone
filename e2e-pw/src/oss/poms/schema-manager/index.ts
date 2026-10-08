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
   * Close the modal
   */
  async close() {
    await this.eventUtils.after("e2e:schema-manager:closed", () =>
      this.locator.getByTestId("close-schema-manager").click(),
    );
  }

  /**
   * The schema row's dropdown trigger (grid sidebar and sample modal).
   * "Manage schema" lives inside its menu; the standalone gear only
   * renders where the row does not (inside a workflow task). Both the
   * grid sidebar and the sample modal render the row; with the modal
   * open, its trigger is the one on top.
   */
  async lensTrigger() {
    const modal = this.page.getByTestId("modal");
    if (await modal.isVisible()) {
      return modal.getByTestId("schema-lens-select");
    }
    return this.page.getByTestId("schema-lens-select").first();
  }

  /**
   * Open the schema manager modal. The sample modal must be open for the
   * schema manager modal to open
   */
  async open() {
    await this.eventUtils.after("e2e:schema-manager:opened", async () => {
      const trigger = await this.lensTrigger();
      if (await trigger.isVisible()) {
        await trigger.click();
        await this.page
          .getByRole("menu")
          .getByTestId("open-schema-manager")
          .click();
        return;
      }
      await this.page.getByTestId("open-schema-manager").click();
    });
  }

  /**
   * Create a custom schema from the actions menu. The manager switches to
   * the new schema, whose rows can be moved between Active and Hidden.
   *
   * @param name The schema name (unique per dataset)
   */
  async createSchema(name: string) {
    await this.locator.getByTestId("schema-actions-menu").click();
    await this.page.getByRole("menu").getByTestId("schema-action-new").click();
    const input = this.locator.getByTestId("schema-name-input");
    await input.fill(name);
    await this.locator
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await expect(input).toBeHidden();
  }

  /**
   * Apply a custom schema as the sidebar's schema lens, or the dataset
   * default when no name is given. The dataset default shows every field;
   * only a custom schema hides fields.
   *
   * @param name The schema name, or undefined for the default
   */
  async applyLens(name?: string) {
    const trigger = await this.lensTrigger();
    await trigger.click();
    const menu = this.page.getByRole("menu");
    if (name) {
      await menu
        .getByTestId("schema-lens-option")
        .filter({ hasText: name })
        .click();
    } else {
      await menu.getByTestId("schema-lens-option-default").click();
    }
    await expect(menu).toBeHidden();
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
    await expect(this.schemaManagerPom.locator).toBeVisible();
  }

  /**
   * Is the schema entry point (the schema row's trigger) enabled
   */
  async isEnabled() {
    await expect(await this.schemaManagerPom.lensTrigger()).toBeEnabled();
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
