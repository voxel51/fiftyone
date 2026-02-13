import { expect, Locator, Page } from "src/oss/fixtures";

/**
 * The edit form when in 'Annotate' mode. Applies to Primitives and Labels
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
   * Click the undo button
   */
  async redo() {
    await this.redoButton.click();
  }

  /**
   *
   * @param path The field path
   * @returns
   */
  async getFieldContainer(path: string) {
    const id = convertPathToId(path);
    return this.locator.getByTestId(`${id}_container`);
  }

  /**
   *
   * @param path The field path
   * @returns A locator
   */
  async getFieldErrors(path: string) {
    const id = convertPathToId(path);
    return this.locator.getByTestId(`${id}_errors`).textContent();
  }

  /**
   * Get a field label
   *
   * @param path The field path
   * @returns A locator
   */
  async getFieldLabel(path: string) {
    return (await this.getFieldContainer(path)).locator("label").textContent();
  }

  /**
   * Get a field form input
   *
   * @param path The field path
   * @returns A locator
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
   * @returns A string value
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
 * Modal 'Annotate' edit asserter
 */
class ModalAnnotateEditAsserter {
  constructor(private readonly modalAnnotateEdit: ModalAnnotateEditPom) {}

  /**
   * Verify a field's label
   *
   * @param path The field path
   * @param expectedLabel The expected value
   */
  async verifyFieldLabel(path: string, expectedLabel: string) {
    const actualLabel = await this.modalAnnotateEdit.getFieldLabel(path);
    expect(actualLabel).toBe(expectedLabel);
  }

  /**
   * Verify a field's errors
   *
   * @param path The field path
   * @param expectedLabel The expected value
   */
  async verifyFieldErrors(path: string, expectedErrors: string) {
    const actualErrors = await this.modalAnnotateEdit.getFieldErrors(path);
    expect(actualErrors).toBe(expectedErrors);
  }

  /**
   * Verify a field's value
   *
   * @param path The field path
   * @param expectedValue The expected value
   */
  async verifyFieldValue(path: string, expectedValue: string) {
    const actualValue = await this.modalAnnotateEdit.getFieldValue(path);
    expect(actualValue).toBe(expectedValue);
  }

  async verifyUndoButtonEnabled() {
    const undoButton = await this.modalAnnotateEdit.undoButton;
    await expect(await undoButton).not.toHaveClass(/disabled/);
  }

  async verifyRedoButtonEnabled() {
    const redoButton = await this.modalAnnotateEdit.redoButton;
    await expect(await redoButton).not.toHaveClass(/disabled/);
  }

  async verifyUndoButtonDisabled() {
    const undoButton = await this.modalAnnotateEdit.undoButton;
    await expect(await undoButton).toHaveClass(/disabled/);
  }

  async verifyRedoButtonDisabled() {
    const redoButton = await this.modalAnnotateEdit.redoButton;
    await expect(await redoButton).toHaveClass(/disabled/);
  }
}

function convertPathToId(path: string) {
  return "root_" + path.replace(/\./g, "_");
}
