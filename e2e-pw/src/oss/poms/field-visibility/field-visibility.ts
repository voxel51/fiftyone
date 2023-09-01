import { Locator, Page } from "src/oss/fixtures";
import { SidebarPom } from "../sidebar";

export class FieldVisibilityPom {
  readonly page: Page;
  readonly assert: FieldVisibilityAsserter;

  readonly sidebarLocator: Locator;
  readonly dialogLocator: Locator;

  constructor(page: Page) {
    this.page = page;

    this.assert = new FieldVisibilityAsserter(this, new SidebarPom(page));

    this.sidebarLocator = page.getByTestId("sidebar");
  }

  get modalContainer() {
    return this.page.getByTestId("field-visibility-container");
  }

  get fieldVisibilityBtn() {
    return this.sidebarLocator.getByTestId("field-visibility-icon");
  }

  async openFieldVisibilityModal() {
    await this.fieldVisibilityBtn.click();
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
    await this.applyBtn.click();
  }

  async clearFieldVisibilityChanges() {
    await this.clearBtn.click();
  }

  get clearBtn() {
    return this.sidebarLocator.getByTestId("field-visibility-btn-clear");
  }

  get applyBtn() {
    return this.modalContainer.getByTestId("field-visibility-btn-apply");
  }
}

class FieldVisibilityAsserter {
  constructor(
    private readonly fv: FieldVisibilityPom,
    private readonly sb: SidebarPom
  ) {}
}
