import { Page, expect } from "src/oss/fixtures";
import { FieldRowPom } from "./field-row";

export class SchemaManagerPom {
  readonly assert: SchemaManagerAsserter;

  constructor(readonly page: Page) {
    this.assert = new SchemaManagerAsserter(this);
  }

  get container() {
    return this.page.getByTestId("schema-manager");
  }

  get activeFieldsContainer() {
    return this.container.getByTestId("active-fields");
  }

  get hiddenFieldsContainer() {
    return this.container.getByTestId("hidden-fields");
  }

  async close() {
    await this.page.getByTestId("close-schema-manager").click();
  }

  async open() {
    await this.page.getByTestId("open-schema-manager").click();
  }

  getFieldRow(field: string) {
    return new FieldRowPom(field, this);
  }
}

class SchemaManagerAsserter {
  constructor(private readonly schemaManagerPom: SchemaManagerPom) {}

  async isActiveFieldRow(field: string) {
    await expect(
      this.schemaManagerPom.activeFieldsContainer.filter({
        has: this.schemaManagerPom.getFieldRow(field).container,
      })
    ).toBeVisible();
  }

  async isHiddenFieldRow(field: string) {
    await expect(
      this.schemaManagerPom.hiddenFieldsContainer.filter({
        has: this.schemaManagerPom.getFieldRow(field).container,
      })
    ).toBeVisible();
  }

  async isHidden() {
    await expect(this.schemaManagerPom.container).toBeHidden();
  }

  async isVisible() {
    await expect(this.schemaManagerPom.container).toBeVisible();
  }
}
