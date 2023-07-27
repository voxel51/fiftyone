import { Locator, Page } from "src/oss/fixtures";

type filterMode = "select" | "exclude" | "show" | "omit";
type visibilityMode = "show" | "hide";

export class SidebarPom {
  readonly page: Page;
  readonly sidebar: Locator;

  constructor(page: Page) {
    this.page = page;

    this.sidebar = page.getByTestId("sidebar");
  }

  async clickFieldCheckbox(field: string) {
    const selector = this.sidebar.getByTestId(`checkbox-${field}`);
    return selector.click();
  }

  async clickFieldDropdown(field: string) {
    const selector = this.sidebar.getByTestId(`sidebar-field-arrow-${field}`);
    return selector.click();
  }

  // when less than 25 entries, it's displayed in a list
  async getAttributeItemCount(field: string, attributeValue: string) {
    const container = this.sidebar.getByTestId(`categorical-filter-${field}`);
    const item = container.getByTestId(`checkbox-${attributeValue}`);
    const countText = item.getByTestId(`entry-count-all`);
    return countText;
  }

  // apply a filter to a field
  async getLabelFromList(
    field: string,
    labels: string[],
    targetModeId: string
  ) {
    const container = this.sidebar.getByTestId(`categorical-filter-${field}`);
    // select attributes
    labels.forEach((label) => {
      const item = container.getByTestId(`checkbox-${label}`);
      item.click();
    });

    const currentMode = container.getByTestId("filter-mode-div");
    await currentMode.click();
    const targetMode = this.sidebar.getByTestId(
      `filter-option-${targetModeId}`
    );
    await targetMode.click();
  }

  async resetAttribute(attribute: string) {
    const container = this.sidebar.getByTestId(
      `categorical-filter-${attribute}`
    );
    const reset = container.getByTestId("filter-reset");
    return reset.click();
  }

  async toggleSidebarMode() {
    const toggle = this.sidebar.getByTestId("sidebar-mode-status");
    return toggle.click();
  }
}
