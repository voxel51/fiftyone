import { expect, Locator, Page } from "src/oss/fixtures";

/**
 * The modal sidebar's edit form when in 'Annotate' mode. Applies to primitives
 * and labels
 */
export class ModalAnnotateEditPom {
  readonly page: Page;
  readonly locator: Locator;
  readonly assert: ModalAnnotateEditAsserter;

  constructor(page: Page) {
    this.page = page;
    this.assert = new ModalAnnotateEditAsserter(this);
    this.locator = page.getByTestId("modal").getByTestId("sidebar");
  }

  /**
   * The undo button locator
   */
  get undoButton() {
    return this.locator.getByTestId("undo-button");
  }

  /**
   * The redo button locator
   */
  get redoButton() {
    return this.locator.getByTestId("redo-button");
  }

  /**
   * Click the undo button
   */
  async undo() {
    await this.undoButton.click();
  }

  /**
   * Click the redo button
   */
  async redo() {
    await this.redoButton.click();
  }

  /**
   * Get the container element for a specific field
   *
   * @param path The field path
   * @returns A locator for the field container
   */
  async getFieldContainer(path: string) {
    const id = convertPathToId(path);
    return this.locator.getByTestId(`${id}_container`);
  }

  /**
   * Get the error message text for a specific field
   *
   * @param path The field path
   * @returns A promise that resolves to the error text content
   */
  async getFieldErrors(path: string) {
    const id = convertPathToId(path);
    return this.locator.getByTestId(`${id}_errors`).textContent();
  }

  /**
   * Get a field label
   *
   * @param path The field path
   * @returns A promise that resolves to the label text content
   */
  async getFieldLabel(path: string) {
    return (await this.getFieldContainer(path)).locator("label").textContent();
  }

  /**
   * Get a field form input
   *
   * @param path The field path
   * @returns A promise that resolves to a locator for the input, textarea, o
   *  select element
   */
  async getField(path: string) {
    return (await this.getFieldContainer(path)).locator(
      "input, textarea, select"
    );
  }

  /**
   * Get a field value
   *
   * @param field The field name
   * @returns A promise that resolves to the field's input value
   */
  async getFieldValue(field: string) {
    const locator = await this.getField(field);
    return locator.inputValue();
  }

  /**
   * Set a field value
   *
   * @param field The field name
   * @param value The value to set
   */
  async setFieldValue(field: string, value: string) {
    const locator = await this.getField(field);
    await locator.fill(value);
  }
}

/**
 * Asserter class for the modal's sidebar when in 'Annotate' edit mode
 */
class ModalAnnotateEditAsserter {
  constructor(private readonly modalAnnotateEdit: ModalAnnotateEditPom) {}

  /**
   * Verify a field's label
   *
   * @param path The field path
   * @param expectedLabel The expected label value
   */
  async verifyFieldLabel(path: string, expectedLabel: string) {
    const actualLabel = await this.modalAnnotateEdit.getFieldLabel(path);
    expect(actualLabel).toBe(expectedLabel);
  }

  /**
   * Verify a field's errors
   *
   * @param path The field path
   * @param expectedErrors The expected error message
   */
  async verifyFieldErrors(path: string, expectedErrors: string) {
    const actualErrors = await this.modalAnnotateEdit.getFieldErrors(path);
    expect(actualErrors).toBe(expectedErrors);
  }

  /**
   * Verify a field's value
   *
   * @param path The field path
   * @param expectedValue The expected field value
   */
  async verifyFieldValue(path: string, expectedValue: string) {
    const actualValue = await this.modalAnnotateEdit.getFieldValue(path);
    expect(actualValue).toBe(expectedValue);
  }

  /**
   * Verify that the undo button is enabled
   */
  async verifyUndoButtonEnabled() {
    const undoButton = await this.modalAnnotateEdit.undoButton;
    await expect(await undoButton).not.toHaveClass(/disabled/);
  }

  /**
   * Verify that the redo button is enabled
   */
  async verifyRedoButtonEnabled() {
    const redoButton = await this.modalAnnotateEdit.redoButton;
    await expect(await redoButton).not.toHaveClass(/disabled/);
  }

  /**
   * Verify that the undo button is disabled
   */
  async verifyUndoButtonDisabled() {
    const undoButton = await this.modalAnnotateEdit.undoButton;
    await expect(await undoButton).toHaveClass(/disabled/);
  }

  /**
   * Verify that the redo button is disabled
   */
  async verifyRedoButtonDisabled() {
    const redoButton = await this.modalAnnotateEdit.redoButton;
    await expect(await redoButton).toHaveClass(/disabled/);
  }
}

/**
 * Convert a field path to a test ID format
 *
 * @param path The field path (dot-separated)
 * @returns The converted test ID with underscores
 */
function convertPathToId(path: string) {
  return "root_" + path.replace(/\./g, "_");
}
