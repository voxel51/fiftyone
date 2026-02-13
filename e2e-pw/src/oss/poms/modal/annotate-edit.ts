import exp from "node:constants";
import { expect, Locator, Page } from "src/oss/fixtures";

export class ModalAnnotateEditPom {
  readonly page: Page;
  readonly locator: Locator;
  readonly assert: ModalAnnotateEditAsserter;

  constructor(page: Page) {
    this.page = page;
    this.assert = new ModalAnnotateEditAsserter(this);
    this.locator = page.getByTestId("modal").getByTestId("sidebar");
  }

  async getFieldContainer(path: string) {
    const id = convertPathToId(path);
    return this.locator.getByTestId(`${id}_container`);
  }

  async getFieldErrors(path: string) {
    const id = convertPathToId(path);
    return this.locator.getByTestId(`${id}_errors`).textContent();
  }

  async getFieldLabel(path: string) {
    return (await this.getFieldContainer(path)).locator("label").textContent();
  }

  async getField(path: string) {
    return (await this.getFieldContainer(path)).locator(
      "input, textarea, select"
    );
  }

  async getFieldValue(fieldLabel: string) {
    const field = await this.getField(fieldLabel);
    return field.inputValue();
  }

  async setFieldValue(fieldLabel: string, value: string) {
    const field = await this.getField(fieldLabel);
    await field.fill(value);
  }

  async getUndoButton() {
    return this.locator.getByTestId("undo-button");
  }

  async getRedoButton() {
    return this.locator.getByTestId("redo-button");
  }

  async undo() {
    const undoButton = await this.getUndoButton();
    await undoButton.click();
  }

  async redo() {
    const redoButton = await this.getRedoButton();
    await redoButton.click();
  }
}

class ModalAnnotateEditAsserter {
  constructor(private readonly modalAnnotateEdit: ModalAnnotateEditPom) {}

  async verifyFieldLabel(path: string, expectedLabel: string) {
    const actualLabel = await this.modalAnnotateEdit.getFieldLabel(path);
    expect(actualLabel).toBe(expectedLabel);
  }

  async verifyFieldErrors(path: string, expectedErrors: string) {
    const actualErrors = await this.modalAnnotateEdit.getFieldErrors(path);
    expect(actualErrors).toBe(expectedErrors);
  }

  async verifyFieldValue(path: string, expectedValue: string) {
    const actualValue = await this.modalAnnotateEdit.getFieldValue(path);
    expect(actualValue).toBe(expectedValue);
  }

  async verifyUndoButtonEnabled() {
    const undoButton = await this.modalAnnotateEdit.getUndoButton();
    await expect(await undoButton).not.toHaveClass(/disabled/);
  }

  async verifyRedoButtonEnabled() {
    const redoButton = await this.modalAnnotateEdit.getRedoButton();
    await expect(await redoButton).not.toHaveClass(/disabled/);
  }

  async verifyUndoButtonDisabled() {
    const undoButton = await this.modalAnnotateEdit.getUndoButton();
    await expect(await undoButton).toHaveClass(/disabled/);
  }

  async verifyRedoButtonDisabled() {
    const redoButton = await this.modalAnnotateEdit.getRedoButton();
    await expect(await redoButton).toHaveClass(/disabled/);
  }
}

function convertPathToId(path: string) {
  return "root_" + path.replace(/\./g, "_");
}
