import { Page } from "src/oss/fixtures";

type SidebarStatisticsMode = "slice" | "group";
type SidebarMode = "fast" | "best" | "all";
type SidebarSortMode = "count" | "value";

export class DisplayOptionsPom {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async setSidebarStatisticsMode(mode: SidebarStatisticsMode) {
    const selector = this.page.getByTestId(
      `tab-option-View ${mode} sidebar statistics`
    );
    return selector.click();
  }

  async setSidebarMode(mode: SidebarMode) {
    const selector = this.page.getByTestId(`tab-option-${mode}`);
    return selector.click();
  }

  async setSidebarSortMode(mode: SidebarSortMode) {
    const selector = this.page.getByTestId(`tab-option-Sort by ${mode}`);
    return selector.click();
  }
}
