import { expect, Page } from "src/oss/fixtures";
import type { SchemaManagerPom } from ".";
import { JSONEditorPom } from "./json-editor";

export class FieldRowPom {
  readonly assert: FieldRowAsserter;

  constructor(
    readonly page: Page,
    readonly field: string,
    readonly schemaManager: SchemaManagerPom
  ) {
    this.assert = new FieldRowAsserter(this);
  }

  get checkbox() {
    return this.container.getByRole("checkbox");
  }

  get container() {
    return this.schemaManager.container.getByTestId(`field-row-${this.field}`);
  }

  async edit() {
    await this.container.getByTestId("edit").click({ force: true });
    return new JSONEditorPom(this.page, this.field, this.schemaManager);
  }

  async select() {
    await this.checkbox.click();
    await this.assert.isSelected();
  }
}

class FieldRowAsserter {
  constructor(private readonly fieldRowPom: FieldRowPom) {}

  async isActiveField() {
    await this.fieldRowPom.schemaManager.assert.isActiveFieldRow(
      this.fieldRowPom.field
    );
  }

  async isHiddenField() {
    await this.fieldRowPom.schemaManager.assert.isHiddenFieldRow(
      this.fieldRowPom.field
    );
  }

  async isSelected() {
    await expect(this.fieldRowPom.checkbox).toBeChecked();
  }
}
