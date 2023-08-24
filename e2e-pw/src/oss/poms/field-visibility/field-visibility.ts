import { expect, Locator, Page } from "src/oss/fixtures";
import { SidebarPom } from "../sidebar";

export class FieldVisibilityPom {
  readonly page: Page;
  readonly assert: FieldVisibilityAsserter;

  readonly sidebar: Locator;
  readonly dialogLocator: Locator;

  constructor(page: Page) {
    this.page = page;

    this.assert = new FieldVisibilityAsserter(this, new SidebarPom(page));

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
}

class FieldVisibilityAsserter {
  constructor(
    private readonly fv: FieldVisibilityPom,
    private readonly sb: SidebarPom
  ) {}
}
