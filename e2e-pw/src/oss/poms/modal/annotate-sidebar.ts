import { expect, Locator, Page } from "src/oss/fixtures";

/**
 * The modal sidebar's main listing view when in 'Annotate' mode
 */
export class ModalAnnotateSidebarPom {
  readonly page: Page;
  readonly locator: Locator;
  readonly assert: ModalAnnotateSidebarAsserter;

  constructor(page: Page) {
    this.page = page;
    this.assert = new ModalAnnotateSidebarAsserter(this);
    this.locator = page.getByTestId("modal").getByTestId("sidebar");
  }

  /**
   * Get the count of active labels in the sidebar
   *
   * @returns A promise that resolves to the number of active labels
   */
  async getActiveLabelsCount() {
    return Number(
      await this.locator
        .getByTestId("sidebar-group-Labels-field-count")
        .textContent()
    );
  }

  /**
   * Get the count of active primitive fields in the sidebar
   *
   * @returns A promise that resolves to the number of active primitive fields
   */
  async getActivePrimitiveFieldsCount() {
    return Number(
      await this.locator
        .getByTestId("sidebar-group-PRIMITIVES-field-count")
        .textContent()
    );
  }

  /**
   * Select an active label by name and position
   *
   * @param label The label name to select
   * @param position The position index when multiple labels with the same name exist
   */
  async selectActiveLabel(label: string, position: number) {
    await this.locator
      .getByTestId("sidebar-field")
      .getByText(label)
      .nth(position)
      .click();
  }

  /**
   * Select an active primitive field by field name
   *
   * @param field The primitive field name to select
   */
  async selectActivePrimitiveField(field: string) {
    await this.locator.getByTestId(`${field}-field`).click();
  }

  /**
   * Toggle the active labels section in the sidebar
   */
  async toggleActiveLabels() {
    await this.locator.getByTestId("sidebar-group-Labels-toggle").click();
  }

  /**
   * Toggle the active primitive fields section in the sidebar
   */
  async toggleActivePrimitiveFields() {
    await this.locator.getByTestId("sidebar-group-PRIMITIVES-toggle").click();
  }
}

/**
 * Asserter class for the modal's sidebar when in 'Annotate' mode
 */
class ModalAnnotateSidebarAsserter {
  constructor(private readonly modalAnnotateSidebar: ModalAnnotateSidebarPom) {}

  /**
   * Verify that the active labels section is expanded
   */
  async verifyActiveLabelsIsExpanded() {
    await expect(
      this.modalAnnotateSidebar.locator.getByTestId(
        "sidebar-group-Labels-toggle"
      )
    ).toHaveAttribute("data-testid", "RemoveIcon");
  }

  /**
   * Verify that the active labels section is collapsed
   */
  async verifyActiveLabelsIsCollapsed() {
    await expect(
      this.modalAnnotateSidebar.locator.getByTestId(
        "sidebar-group-Labels-toggle"
      )
    ).toHaveAttribute("data-testid", "AddIcon");
  }

  /**
   * Verify that the active primitive fields section is expanded
   */
  async verifyActivePrimitiveFieldsIsExpanded() {
    await expect(
      this.modalAnnotateSidebar.locator.getByTestId(
        "sidebar-group-PRIMITIVES-toggle"
      )
    ).toHaveAttribute("data-testid", "RemoveIcon");
  }

  /**
   * Verify that the active primitive fields section is collapsed
   */
  async verifyActivePrimitiveFieldsIsCollapsed() {
    await expect(
      this.modalAnnotateSidebar.locator.getByTestId(
        "sidebar-group-PRIMITIVES-toggle"
      )
    ).toHaveAttribute("data-testid", "AddIcon");
  }

  /**
   * Verify the count of active labels matches the expected count
   *
   * @param expectedCount The expected number of active labels
   */
  async verifyActiveLabelsCount(expectedCount: number) {
    const actualCount = await this.modalAnnotateSidebar.getActiveLabelsCount();
    expect(actualCount).toBe(expectedCount);
  }

  /**
   * Verify the count of active primitive fields matches the expected count
   *
   * @param expectedCount The expected number of active primitive fields
   */
  async verifyActivePrimitiveFieldsCount(expectedCount: number) {
    const actualCount =
      await this.modalAnnotateSidebar.getActivePrimitiveFieldsCount();
    expect(actualCount).toBe(expectedCount);
  }
}
