import { expect, Locator, Page } from "src/oss/fixtures";

export class ModalAnnotateSidebarPom {
  readonly page: Page;
  readonly locator: Locator;
  readonly assert: ModalAnnotateSidebarAsserter;

  constructor(page: Page) {
    this.page = page;

    this.assert = new ModalAnnotateSidebarAsserter(this);
    this.locator = page.getByTestId("modal").getByTestId("sidebar");
  }

  async getActiveLabelsCount() {
    return Number(
      await this.locator
        .getByTestId("sidebar-group-Labels-field-count")
        .textContent()
    );
  }

  async getActivePrimitiveFieldsCount() {
    return Number(
      await this.locator
        .getByTestId("sidebar-group-PRIMITIVES-field-count")
        .textContent()
    );
  }

  async selectActiveLabel(label: string, position: number) {
    await this.locator
      .getByTestId("sidebar-field")
      .getByText(label)
      .nth(position)
      .click();
  }

  async selectActivePrimitiveField(field: string) {
    await this.locator.getByTestId(`${field}-field`).click();
  }

  async expandActiveLabels() {
    await this.locator.getByTestId("sidebar-group-Labels-toggle").click();
  }

  async collapseActiveLabels() {
    await this.locator.getByTestId("sidebar-group-Labels-toggle").click();
  }

  async expandActivePrimitiveFields() {
    await this.locator.getByTestId("sidebar-group-PRIMITIVES-toggle").click();
  }

  async collapseActivePrimitiveFields() {
    await this.locator.getByTestId("sidebar-group-PRIMITIVES-toggle").click();
  }
}

class ModalAnnotateSidebarAsserter {
  constructor(private readonly modalAnnotateSidebar: ModalAnnotateSidebarPom) {}

  async verifyActiveLabelsIsExpanded() {
    await expect(
      this.modalAnnotateSidebar.locator.getByTestId(
        "sidebar-group-Labels-toggle"
      )
    ).toHaveAttribute("data-testid", "RemoveIcon");
  }

  async verifyActiveLabelsIsCollapsed() {
    await expect(
      this.modalAnnotateSidebar.locator.getByTestId(
        "sidebar-group-Labels-toggle"
      )
    ).toHaveAttribute("data-testid", "AddIcon");
  }

  async verifyActivePrimitiveFieldsIsExpanded() {
    await expect(
      this.modalAnnotateSidebar.locator.getByTestId(
        "sidebar-group-PRIMITIVES-toggle"
      )
    ).toHaveAttribute("data-testid", "RemoveIcon");
  }

  async verifyActivePrimitiveFieldsIsCollapsed() {
    await expect(
      this.modalAnnotateSidebar.locator.getByTestId(
        "sidebar-group-PRIMITIVES-toggle"
      )
    ).toHaveAttribute("data-testid", "AddIcon");
  }

  async verifyActiveLabelsCount(expectedCount: number) {
    const actualCount = await this.modalAnnotateSidebar.getActiveLabelsCount();
    expect(actualCount).toBe(expectedCount);
  }

  async verifyActivePrimitiveFieldsCount(expectedCount: number) {
    const actualCount =
      await this.modalAnnotateSidebar.getActivePrimitiveFieldsCount();
    expect(actualCount).toBe(expectedCount);
  }
}
