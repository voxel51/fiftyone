import { Locator, Page, expect } from "src/oss/fixtures";

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

  async waitForElement(dataCy: string) {
    const selector = this.sidebar.getByTestId(dataCy);
    await selector.waitFor();
    expect(selector).toBeVisible();
  }

  // when less than 25 entries, it's displayed in a list
  async getAttributeItemCount(field: string, attributeValue: string) {
    const container = this.sidebar.getByTestId(`categorical-filter-${field}`);
    const item = container.getByTestId(`checkbox-${attributeValue}`);
    return item.getByTestId(`entry-count-all`);
  }

  async setSliderStartValue(field: string, value: number) {
    const container = this.sidebar.getByTestId(
      `numeric-slider-container-${field}`
    );
    const slider = container.getByTestId("slider");
    const bound = await slider.boundingBox();
    await this.page.mouse.move(
      bound.x + bound.width / 3,
      bound.y + bound.height / 2
    );
    await this.page.mouse.down();
    await this.page.mouse.move(
      bound.x + bound.width / 3,
      bound.y + bound.height / 2
    );
    await this.page.mouse.up();
  }

  async getActiveMode() {
    return this.sidebar.getByTestId("sidebar-mode-status").innerText();
  }

  async applyFilter(label: string) {
    const selectionDiv = this.sidebar.getByTestId(`checkbox-${label}`);
    await selectionDiv.waitFor({ state: "visible" });
    await selectionDiv.locator("input").check({ force: true });
  }

  // apply a filter to a field
  async applyLabelFromList(
    field: string,
    labels: string[],
    targetModeId: string
  ) {
    labels.forEach((label) => {
      this.applyFilter(label);
    });

    const currentMode = this.sidebar.getByTestId("filter-mode-div");
    await currentMode.waitFor();
    await currentMode.click();
    // make sure the pop out panel is fully expanded, to make sure click is successful
    const targetMode = this.sidebar.getByTestId(
      `filter-option-${targetModeId}`
    );
    return targetMode.click();
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

  async toggleSidebarGroup(name: string) {
    await this.sidebar.getByTestId(`sidebar-group-${name}`).click();
  }
}
