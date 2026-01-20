import { expect } from "src/oss/fixtures";
import type { SchemaManagerPom } from ".";

export class FieldRowPom {
  readonly assert: FieldRowAsserter;

  constructor(
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
    await expect(this.container).toBeAttached();
    await this.container.getByTestId("edit").click();
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
