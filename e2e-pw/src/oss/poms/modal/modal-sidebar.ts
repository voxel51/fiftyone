import { Locator, Page } from "src/oss/fixtures";

export class ModalSidebarPom {
  readonly page: Page;
  readonly sidebar: Locator;

  constructor(page: Page) {
    this.page = page;

    this.sidebar = page.getByTestId("modal").getByTestId("sidebar");
  }

  async getSidebarEntryText(key: string) {
    return this.sidebar.getByTestId(key).textContent();
  }

  async getSampleId() {
    return this.getSidebarEntryText("sidebar-entry-id");
  }

  async getSampleFilepath(abs = true) {
    const absPath = await this.getSidebarEntryText("sidebar-entry-filepath");

    if (!abs) {
      return absPath.split("/").at(-1);
    }

    return absPath;
  }
}
