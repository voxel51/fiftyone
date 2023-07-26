import { Locator, Page } from "src/oss/fixtures";

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

  // when more than 25 entries, it's displayed in a search dropdown
}
