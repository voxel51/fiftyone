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

  fieldVisibilityBtn() {
    return this.sidebar.getByTestId("field-visibility-icon");
  }

  async openFieldVisibilityModal() {
    await this.fieldVisibilityBtn().click();
  }

  async hideFields(fieldNames: string[]) {
    await this.openFieldVisibilityModal();
    for (let fName in fieldNames) {
      await this.sidebar.getByTestId(fName).hover();
    }
  }

  // TODO: possibly replace when sidebar pom available
  sidebarField(fieldName: string) {
    return this.sidebar
      .getByTestId(`${fieldName}-field`)
      .locator("div")
      .filter({ hasText: fieldName })
      .nth(1);
  }
}

class FieldVisibilityAsserter {
  constructor(private readonly svp: FieldVisibilityPom) {}

  async assertFieldInSidebar(fieldName: string) {
    await expect(this.svp.sidebarField(fieldName)).toBeVisible();
  }

  async assertFieldNotInSidebar(fieldName: string) {
    await expect(this.svp.sidebarField(fieldName)).toBeHidden();
  }
}
