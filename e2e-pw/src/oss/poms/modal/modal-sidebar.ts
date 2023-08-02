import { Locator, Page, expect } from "src/oss/fixtures";

export class ModalSidebarPom {
  readonly page: Page;
  readonly sidebar: Locator;
  readonly assert: SidebarAsserter;

  constructor(page: Page) {
    this.page = page;

    this.assert = new SidebarAsserter(this);
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

  async toggleSidebarGroup(name: string) {
    await this.sidebar.getByTestId(`sidebar-group-entry-${name}`).click();
  }
}

class SidebarAsserter {
  constructor(private readonly modalSidebarPom: ModalSidebarPom) {}

  async verifySidebarEntryText(key: string, value: string) {
    const text = await this.modalSidebarPom.sidebar
      .getByTestId(`sidebar-entry-${key}`)
      .textContent();
    expect(text).toBe(value);
  }
}
