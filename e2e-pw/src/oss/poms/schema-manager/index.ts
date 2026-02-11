import { Page, expect } from "src/oss/fixtures";
import type { EventUtils } from "src/shared/event-utils";
import { FieldRowPom } from "./field-row";

/**
 * The schema manager modal accessible via the sample modal's 'Annotate' tab
 */
export class SchemaManagerPom {
  readonly assert: SchemaManagerAsserter;

  constructor(readonly page: Page, readonly eventUtils: EventUtils) {
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
    await this.locator.getByTestId("close-schema-manager").click();
  }

  /**
   * Open the schema manager modal. The sample modal must be open for the
   * schema manager modal to open
   */
  async open() {
    await this.page.getByTestId("open-schema-manager").click();
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

  // =========================================================================
  // New field creation
  // =========================================================================

  /**
   * The "New field" button locator
   */
  get newFieldButton() {
    return this.locator.getByTestId("new-field-button");
  }

  /**
   * The field name input locator
   */
  get fieldNameInput() {
    return this.locator.getByTestId("new-field-name");
  }

  /**
   * The field type combobox locator
   */
  get typeSelect() {
    return this.locator.getByRole("combobox");
  }

  /**
   * The "+ Add class" button locator
   */
  get addClassButton() {
    return this.locator.getByTestId("add-class-button");
  }

  /**
   * The class name input locator (visible after clicking Add class)
   */
  get classNameInput() {
    return this.locator.getByTestId("class-name-input");
  }

  /**
   * The "Create" button locator in the new field footer
   */
  get createButton() {
    return this.locator.getByTestId("primary-button");
  }

  /**
   * Get a component type button locator by id (e.g. "slider", "text", "radio")
   */
  getComponentTypeButton(id: string) {
    return this.locator.getByTestId(`component-type-${id}`);
  }

  /**
   * The range min input locator
   */
  get rangeMinInput() {
    return this.locator.getByTestId("range-min");
  }

  /**
   * The range max input locator
   */
  get rangeMaxInput() {
    return this.locator.getByTestId("range-max");
  }

  /**
   * Click the "New field" button to start creating a new field
   */
  async clickNewField() {
    await this.newFieldButton.click();
  }

  /**
   * Fill in the field name
   */
  async fillFieldName(name: string) {
    await this.fieldNameInput.fill(name);
  }

  /**
   * Select a type from the type dropdown (options are portalled)
   *
   * @param typeName the visible label, e.g. "Classification", "Float"
   */
  async selectType(typeName: string) {
    await this.typeSelect.click();
    await this.page
      .getByRole("option", { name: typeName, exact: true })
      .click();
  }

  /**
   * Add a class by name. Clicks "+ Add class", types the name, then presses
   * Enter to confirm.
   */
  async addClass(name: string) {
    await this.addClassButton.click();
    await this.classNameInput.pressSequentially(name, { delay: 50 });
    await this.classNameInput.press("Enter");
  }

  /**
   * Switch to the "Primitive" field category
   */
  async selectPrimitiveCategory() {
    await this.locator.getByText("Primitive").click();
  }

  /**
   * Click a component type button (e.g. "slider", "text", "radio")
   */
  async selectComponentType(id: string) {
    // force: true needed because component may be inside a RichList with aria-disabled
    await this.getComponentTypeButton(id).click({ force: true });
  }

  /**
   * Fill the min/max range inputs
   */
  async fillRange(min: string, max: string) {
    await this.rangeMinInput.fill(min);
    await this.rangeMaxInput.fill(max);
  }

  /**
   * Click the "Create" button in the new field footer
   */
  async create() {
    await this.createButton.click();
  }

  // =========================================================================
  // Attribute creation
  // =========================================================================

  /**
   * The "+ Add attribute" button locator
   */
  get addAttributeButton() {
    return this.locator.getByTestId("add-attribute-button");
  }

  /**
   * The attribute name input locator
   */
  get attributeNameInput() {
    return this.locator.getByTestId("attribute-name-input");
  }

  /**
   * The save card button (checkmark) locator
   */
  get saveCardButton() {
    return this.locator.getByTestId("save-card-button");
  }

  /**
   * The value input locator
   */
  get valueInput() {
    return this.locator.getByTestId("value-input");
  }

  /**
   * Click the "+ Add attribute" button
   */
  async clickAddAttribute() {
    await this.addAttributeButton.click();
  }

  /**
   * Fill the attribute name input
   */
  async fillAttributeName(name: string) {
    await this.attributeNameInput.pressSequentially(name, { delay: 50 });
  }

  /**
   * Add a value to the attribute values list
   */
  async addAttributeValue(value: string) {
    await this.valueInput.pressSequentially(value, { delay: 50 });
    await this.valueInput.press("Enter");
  }

  /**
   * Click the checkmark to save the attribute card
   */
  async saveAttribute() {
    await this.saveCardButton.click({ force: true });
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
      `field-row-${field}`
    );
    await expect(locator).toBeAttached();
  }

  /**
   * Verify a component type button is selected in the edit view
   */
  async hasSelectedComponentType(id: string) {
    await expect(
      this.schemaManagerPom.getComponentTypeButton(id)
    ).toHaveAttribute("data-selected", "true");
  }

  /**
   * Is the field row in the hidden fields section
   *
   * @param field the field name
   */
  async isHiddenFieldRow(field: string) {
    const locator = this.schemaManagerPom.hiddenFields.getByTestId(
      `field-row-${field}`
    );
    await expect(locator).toBeAttached();
  }

  /**
   * Is schema manager modal closed
   */
  async isClosed() {
    await expect(this.schemaManagerPom.locator).toBeHidden();
  }

  /**
   * Is schema manager modal open
   */
  async isOpen() {
    await expect(this.schemaManagerPom.locator).toBeVisible();
  }

  /**
   * Is the "Add schema" button disabled
   */
  async isDisabled() {
    await expect(
      this.schemaManagerPom.page.getByTestId("open-schema-manager")
    ).toBeDisabled();
  }

  /**
   * Is the "Add schema" button enabled
   */
  async isEnabled() {
    await expect(
      this.schemaManagerPom.page.getByTestId("open-schema-manager")
    ).toBeEnabled();
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
   * Verify the range min/max inputs have the expected values
   */
  async hasRangeValues(min: string, max: string) {
    await expect(this.schemaManagerPom.rangeMinInput).toHaveValue(min);
    await expect(this.schemaManagerPom.rangeMaxInput).toHaveValue(max);
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
