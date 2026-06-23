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
   * The back button that exits the edit form to the label list
   */
  get backButton() {
    return this.locator.getByTestId("annotate-edit-back");
  }

  /**
   * Exit the edit form back to the label list (deselects the active label)
   */
  async exitToList() {
    await this.backButton.click();
  }

  /**
   * Open the per-label hamburger ("more") menu in the edit form header
   */
  async openLabelMenu() {
    await this.locator.getByTestId("label-menu-trigger").click();
  }

  /**
   * Add an (empty) mask to the currently-edited detection via the label menu.
   * The MUI menu renders in a document-level portal, so target it off `page`.
   */
  async addMask() {
    await this.openLabelMenu();
    await this.page.getByTestId("label-menu-add-mask").click();
  }

  /**
   * Remove the mask from the currently-edited detection via the label menu.
   */
  async removeMask() {
    await this.openLabelMenu();
    await this.page.getByTestId("label-menu-remove-mask").click();
  }

  /**
   * Delete the currently-edited label via the label menu. The MUI menu renders
   * in a document-level portal, so target the item off `page`.
   */
  async deleteLabel() {
    await this.openLabelMenu();
    await this.page.getByTestId("label-menu-delete").click();
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
  getFieldContainer(path: string) {
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

  /**
   * Select a choice from a SmartForm select field, e.g. the label class. The
   * SmartForm widget renders a voodo `Select` (a Headless UI combobox): click the
   * combobox trigger, then the option. The options list mounts in a document-level
   * portal, so the option is targeted off `page`, not the field container.
   *
   * @param path The field path (e.g. "label")
   * @param choice The visible choice label to select (e.g. "dog")
   */
  async selectFieldChoice(path: string, choice: string) {
    const container = this.getFieldContainer(path);
    await container.getByRole("combobox").click();
    await this.page.getByRole("option", { name: choice }).click();
  }

  /**
   * The field-move dropdown (the label's destination field). It's a MUI
   * `Select` rendered through SchemaIO's `DropdownView`, scoped by the
   * `annotate-field-select` wrapper so it doesn't collide with the class
   * combobox. Its visible text is the current field name.
   */
  get fieldSelect() {
    return this.locator
      .getByTestId("annotate-field-select")
      .getByRole("combobox");
  }

  /**
   * Read the currently-selected destination field for the edited label.
   */
  async getCurrentField() {
    return (await this.fieldSelect.textContent())?.trim() ?? "";
  }

  /**
   * Move the edited label to another field. Opens the MUI Select and clicks
   * the option; the menu mounts in a document-level portal, so the option is
   * targeted off `page`.
   *
   * @param field The destination field name (e.g. "predictions")
   */
  async moveFieldTo(field: string) {
    await this.fieldSelect.click();
    await this.page.getByRole("option", { name: field, exact: true }).click();
  }

  /**
   * The segmentation toolbar's Brush tool button. The toolbar (an on-canvas
   * `ActionToolbar`) renders only while segmentation mode is active and exposes
   * its tools via `aria-label`, so the Brush button's presence is a stable
   * "segmentation mode is active" signal.
   */
  get segmentationBrushTool() {
    return this.page.getByRole("button", { name: "Brush" });
  }

  /**
   * The segmentation Merge tool button (present while segmentation mode is
   * active; disabled until there are ≥2 masked detections in the field).
   */
  get mergeTool() {
    return this.page.getByRole("button", { name: "Merge", exact: true });
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
   * Assert whether the edited detection currently has a mask. Read off the label
   * menu, which shows "Remove mask" for a masked detection and "Add mask" for a
   * maskless one (`Edit/Header.tsx` `isMaskDetection`). Opens then closes the
   * menu (Escape) so it leaves no state behind.
   *
   * @param hasMask Whether the detection is expected to have a mask
   */
  async hasMask(hasMask = true) {
    await this.modalAnnotateEdit.openLabelMenu();
    const remove = this.modalAnnotateEdit.page.getByTestId(
      "label-menu-remove-mask"
    );
    const add = this.modalAnnotateEdit.page.getByTestId("label-menu-add-mask");
    if (hasMask) {
      await expect(remove).toBeVisible();
      await expect(add).toBeHidden();
    } else {
      await expect(add).toBeVisible();
      await expect(remove).toBeHidden();
    }
    await this.modalAnnotateEdit.page.keyboard.press("Escape");
  }

  /**
   * Assert whether segmentation mode is active (the segmentation toolbar is
   * shown). Selecting a masked detection auto-enters segmentation mode.
   *
   * @param active Whether segmentation mode is expected to be active
   */
  async inSegmentationMode(active = true) {
    const brush = this.modalAnnotateEdit.segmentationBrushTool;
    return active
      ? await expect(brush).toBeVisible()
      : await expect(brush).toBeHidden();
  }

  /**
   * Is the redo button enabled
   *
   * @param enabled Whether the redo button is enabled or not
   */
  async redoIsEnabled(enabled = true) {
    const redoButton = this.modalAnnotateEdit.redoButton;
    return enabled
      ? await expect(redoButton).not.toHaveClass(/disabled/)
      : await expect(redoButton).toHaveClass(/disabled/);
  }

  /**
   * Is the undo button enabled
   *
   * @param enabled Whether the undo button is enabled or not
   */
  async undoIsEnabled(enabled = true) {
    const undoButton = this.modalAnnotateEdit.undoButton;
    return enabled
      ? await expect(undoButton).not.toHaveClass(/disabled/)
      : await expect(undoButton).toHaveClass(/disabled/);
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
