import { Locator, Page, expect } from "src/oss/fixtures";
import { EventUtils } from "src/shared/event-utils";

export class SidebarPom {
  readonly page: Page;
  readonly sidebar: Locator;
  readonly asserter: SidebarAsserter;

  constructor(page: Page, eventUtils: EventUtils) {
    this.page = page;
    this.asserter = new SidebarAsserter(this);

    this.sidebar = page.getByTestId("sidebar");
  }

  groupField(groupName: string) {
    return this.sidebar.getByTestId(`sidebar-group-${groupName}-field`);
  }

  get addGroupField() {
    return this.sidebar.getByTestId("sidebar-field-add-group-input");
  }

  field(fieldName: string) {
    return this.sidebar
      .getByTestId(`${fieldName}-field`)
      .locator("div")
      .filter({ hasText: fieldName })
      .nth(1);
  }

  sidebarEntryDraggableArea(fieldName: string) {
    return this.sidebar
      .getByTestId(`sidebar-entry-draggable-${fieldName}`)
      .first();
  }

  getNumericSliderContainer(field: string) {
    return this.sidebar.getByTestId(`numeric-slider-container-${field}`);
  }

  getSlider(field: string) {
    return this.getNumericSliderContainer(field).getByTestId("slider");
  }

  getSliderIndicator(field: string, text: string) {
    return this.getSlider(field)
      .locator("span")
      .filter({ hasText: text })
      .nth(1);
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
    await expect(selector).toBeVisible();
  }

  // when less than 25 entries, it's displayed in a list
  async getAttributeItemCount(field: string, attributeValue: string) {
    const container = this.sidebar.getByTestId(`categorical-filter-${field}`);
    const item = container.getByTestId(`checkbox-${attributeValue}`);
    return item.getByTestId(`entry-count-all`);
  }

  async changeSliderStartValue(field: string, textA: string, textB: string) {
    const sliderPointA = this.getSliderIndicator(field, textA);
    const sliderPointB = this.getSliderIndicator(field, textB);
    await sliderPointA.dragTo(sliderPointB);
  }

  async getActiveMode() {
    return this.sidebar.getByTestId("sidebar-mode-status").innerText();
  }

  async applyFilter(label: string) {
    const selectionDiv = this.sidebar
      .getByTestId("checkbox-" + label)
      .getByTitle(label);
    await selectionDiv.click({ force: true });
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

class SidebarAsserter {
  constructor(private readonly sb: SidebarPom) {}

  async assertFieldInSidebar(fieldName: string) {
    await expect(this.sb.field(fieldName)).toBeVisible();
  }

  async assertFieldsInSidebar(fieldNames: string[]) {
    for (let i = 0; i < fieldNames.length; i++) {
      await this.sb.asserter.assertFieldInSidebar(fieldNames[i]);
    }
  }

  async assertFieldsNotInSidebar(fieldNames: string[]) {
    for (let i = 0; i < fieldNames.length; i++) {
      await this.assertFieldNotInSidebar(fieldNames[i]);
    }
  }

  async assertFieldNotInSidebar(fieldName: string) {
    await expect(this.sb.field(fieldName)).toBeHidden();
  }

  async assertSidebarGroupIsVisibile(groupName: string) {
    await expect(this.sb.groupField(groupName)).toBeVisible();
  }

  async assertSidebarGroupIsHidden(groupName: string) {
    await expect(this.sb.groupField(groupName)).toBeHidden({ timeout: 1000 });
  }

  async assertAddGroupVisible() {
    await expect(this.sb.addGroupField).toBeVisible({ timeout: 1000 });
  }

  async assertAddGroupHidden() {
    await expect(this.sb.addGroupField).toBeHidden({ timeout: 1000 });
  }

  async assertCanDragFieldToGroup(fieldName: string, groupName: string) {
    const targetGroup = this.sb.groupField(groupName);

    const draggableSidebarFieldArea =
      this.sb.sidebarEntryDraggableArea(fieldName);

    const draggableAreaBB = await draggableSidebarFieldArea.boundingBox();
    await draggableSidebarFieldArea.dragTo(targetGroup);

    const newDraggableAreaBB = await draggableSidebarFieldArea.boundingBox();
    expect(draggableAreaBB.x).not.toEqual(newDraggableAreaBB.x);
    expect(draggableAreaBB.y).not.toEqual(newDraggableAreaBB.y);

    expect(draggableSidebarFieldArea.getAttribute("draggable")).toBeTruthy();
    await expect(draggableSidebarFieldArea).toHaveAttribute(
      "data-draggable",
      "true"
    );
  }

  async assertCannotDragField(fieldName: string) {
    const draggableSidebarFieldArea =
      this.sb.sidebarEntryDraggableArea(fieldName);

    await expect(draggableSidebarFieldArea).toHaveAttribute(
      "data-draggable",
      "false"
    );
  }
}
