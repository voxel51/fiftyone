import { expect, Locator, Page } from "src/oss/fixtures";

export class FieldVisibilityPom {
  readonly page: Page;
  readonly assert: FieldVisibilityAsserter;

  readonly sidebar: Locator;
  readonly dialogLocator: Locator;

  constructor(page: Page) {
    this.page = page;
    this.assert = new FieldVisibilityAsserter(this);

    this.sidebar = page.getByTestId("sidebar");
  }

  modalContainer() {
    return this.page.getByTestId("field-visibility-container");
  }

  fieldVisibilityBtn() {
    return this.sidebar.getByTestId("field-visibility-icon");
  }

  async openFieldVisibilityModal() {
    await this.fieldVisibilityBtn().click();
  }

  async hideFields(paths: string[]) {
    await this.openFieldVisibilityModal();

    for (let i = 0; i < paths.length; i++) {
      await this.page
        .getByTestId(`schema-selection-${paths[i]}`)
        .getByRole("checkbox", { checked: true })
        .click();
    }

    await this.submitFieldVisibilityChanges();
  }

  async submitFieldVisibilityChanges() {
    await this.applyBtn().click();
  }

  async clearFieldVisibilityChanges() {
    await this.clearBtn().click();
  }

  clearBtn() {
    return this.sidebar.getByTestId("field-visibility-btn-clear");
  }

  applyBtn() {
    return this.modalContainer().getByTestId("field-visibility-btn-apply");
  }

  // TODO: possibly replace when sidebar pom available
  sidebarField(fieldName: string) {
    return this.sidebar
      .getByTestId(`${fieldName}-field`)
      .locator("div")
      .filter({ hasText: fieldName })
      .nth(1);
  }

  // TODO: move to sidebar pom when available
  groupField(groupName: string) {
    return this.sidebar.getByTestId(`sidebar-group-${groupName}-field`);
  }
}

class FieldVisibilityAsserter {
  constructor(private readonly svp: FieldVisibilityPom) {}

  async assertFieldInSidebar(fieldName: string) {
    await expect(this.svp.sidebarField(fieldName)).toBeVisible();
  }

  async assertFieldsInSidebar(fieldNames: string[]) {
    for (let i = 0; i < fieldNames.length; i++) {
      await this.assertFieldInSidebar(fieldNames[i]);
    }
  }

  async assertFieldsNotInSidebar(fieldNames: string[]) {
    for (let i = 0; i < fieldNames.length; i++) {
      await this.assertFieldNotInSidebar(fieldNames[i]);
    }
  }

  async assertFieldNotInSidebar(fieldName: string) {
    await expect(this.svp.sidebarField(fieldName)).toBeHidden();
  }

  async assertSidebarGroupIsVisibile(groupName: string) {
    await expect(this.svp.groupField(groupName)).toBeVisible();
  }

  async assertSidebarGroupIsHidden(groupName: string) {
    await expect(this.svp.groupField(groupName)).toBeHidden();
  }
}
