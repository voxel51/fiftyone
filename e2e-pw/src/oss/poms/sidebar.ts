import { Locator, Page, expect } from "src/oss/fixtures";
import { EventCondition } from "src/shared/event-utils";

export class SidebarPom {
  readonly page: Page;
  readonly sidebar: Locator;
  readonly asserter: SidebarAsserter;

  constructor(page: Page) {
    this.page = page;
    this.asserter = new SidebarAsserter(this);

    this.sidebar = page.getByTestId("sidebar");
  }

  /**
   * The grid sidebar's filter list for `path` shows exactly `values`
   * (`value:count` rows; `[]` for "No results")
   */
  filterValuesShown(path: string, values: readonly string[]): EventCondition {
    return {
      events: "e2e:filters:checkboxes-shown",
      predicate: (e) => {
        const shown = e.detail as {
          path: string;
          modal: boolean;
          values: string;
        };
        return (
          shown.path === path &&
          !shown.modal &&
          shown.values === values.join("\n")
        );
      },
    };
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

  fieldContainer(fieldName: string) {
    return this.sidebar.getByTestId(`sidebar-field-container-${fieldName}`);
  }

  fieldArrow(fieldName: string, enabled: boolean) {
    return this.fieldContainer(fieldName).getByTestId(
      `sidebar-field-arrow-${enabled ? "enabled" : "disabled"}-${fieldName}`,
    );
  }

  filter(fieldName: string, filterType: "categorical" | "numeric") {
    return this.sidebar.getByTestId(`${filterType}-filter-${fieldName}`);
  }

  queryPerformance(fieldName: string, filterType?: "categorical" | "numeric") {
    const locator = filterType
      ? this.filter(fieldName, filterType)
      : this.fieldContainer(fieldName);
    return locator.getByTestId("query-performance");
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

  getSliderIndicator(field: string, text: string, parent?: boolean) {
    const point = this.getSlider(field)
      .locator("span")
      .filter({ hasText: text })
      .first();
    // TODO: we should figure out why pointA.dragTo(pointB) stopped working
    // recent with upgrades. ".." drags to the center of slider
    return parent ? point.locator("..") : point;
  }

  async clickFieldCheckbox(field: string) {
    const selector = this.sidebar.getByTestId(`checkbox-${field}`);
    return selector.click();
  }

  async clickFieldDropdown(field: string) {
    const selector = this.sidebar.getByTestId(
      `sidebar-field-arrow-enabled-${field}`,
    );
    return selector.click();
  }

  /**
   * The eye button on an attribute's filter row controlling whether the
   * attribute renders in label overlays. Visible after expanding the parent
   * field's dropdown.
   */
  shownAttributeToggle(path: string) {
    return this.sidebar.getByTestId(`shown-attribute-${path}`);
  }

  // when less than 25 entries, it's displayed in a list
  async getAttributeItemCount(field: string, attributeValue: string) {
    const container = this.sidebar.getByTestId(`categorical-filter-${field}`);
    const item = container.getByTestId(`checkbox-${attributeValue}`);
    return item.getByTestId(`entry-count-all`);
  }

  async changeSliderStartValue(field: string, textA: string, textB: string) {
    const sliderStart = this.getSliderIndicator(field, textA);
    const sliderMidPoint = this.getSliderIndicator(field, textB, true);
    await sliderStart.dragTo(sliderMidPoint);
  }

  async getActiveMode() {
    return this.sidebar.getByTestId("sidebar-mode-status").innerText();
  }

  async applyFilter(label: string) {
    const selectionDiv = this.sidebar
      .getByTestId("checkbox-" + label)
      .getByTitle(label);
    // no force: the actionability wait keeps the click from landing while
    // the filter dropdown is still animating open (a forced click computes
    // its point once and misses a moving checkbox)
    await selectionDiv.click();
  }

  async applySearch(field: string, search: string) {
    const input = this.sidebar.getByTestId(`selector-sidebar-search-${field}`);
    await input.fill(search);
    await input.press("Enter");
  }

  // apply a filter to a field
  async applyLabelFromList(labels: string[], targetModeId: string) {
    for (const label of labels) {
      await this.applyFilter(label);
    }

    await this.sidebar.getByTestId("filter-mode-div").click();
    // make sure the pop out panel is fully expanded, to make sure click is successful
    const targetMode = this.sidebar.getByTestId(
      `filter-option-${targetModeId}`,
    );
    return targetMode.click();
  }

  async resetAttribute(attribute: string) {
    const container = this.sidebar.getByTestId(
      `categorical-filter-${attribute}`,
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

  async assertCheckboxEnabled(fieldName: string) {
    expect(
      await this.sb.sidebar.getByTestId(`checkbox-${fieldName}`).isVisible(),
    ).toBe(true);
  }

  async assertCheckboxDisabled(fieldName: string) {
    expect(
      await this.sb.sidebar.getByTestId(`checkbox-${fieldName}`).count(),
    ).toBe(0);
  }

  async assertCheckboxesEnabled(fieldNames: string[]) {
    for (let i = 0; i < fieldNames.length; i++) {
      await this.assertCheckboxEnabled(fieldNames[i]);
    }
  }

  async assertCheckboxesDisabled(fieldNames: string[]) {
    for (let i = 0; i < fieldNames.length; i++) {
      await this.assertCheckboxDisabled(fieldNames[i]);
    }
  }

  async assertFieldHasQueryPerformance(fieldName: string) {
    expect(await this.sb.queryPerformance(fieldName).isVisible()).toBe(true);
  }

  async assertFieldMissingQueryPerformance(fieldName: string) {
    expect(await this.sb.queryPerformance(fieldName).isVisible()).toBe(false);
  }

  async assertSubfieldHasQueryPerformance(
    fieldName: string,
    filterType?: "categorical" | "numeric",
  ) {
    expect(
      await this.sb.queryPerformance(fieldName, filterType).isVisible(),
    ).toBe(true);
  }

  async assertSubfieldMissingQueryPerformance(
    fieldName: string,
    filterType?: "categorical" | "numeric",
  ) {
    expect(
      await this.sb.queryPerformance(fieldName, filterType).isVisible(),
    ).toBe(false);
  }

  async assertFieldInSidebar(fieldName: string) {
    expect(await this.sb.field(fieldName).isVisible()).toBe(true);
  }

  async assertFieldDisabled(fieldName: string) {
    expect(await this.sb.fieldArrow(fieldName, true).count()).toBe(0);
  }

  async assertFieldArrowRemoved(fieldName: string) {
    expect(await this.sb.fieldArrow(fieldName, false).count()).toBe(0);
    expect(await this.sb.fieldArrow(fieldName, true).count()).toBe(0);
  }

  async assertFieldsDisabled(fieldNames: string[]) {
    for (let i = 0; i < fieldNames.length; i++) {
      await this.assertFieldDisabled(fieldNames[i]);
    }
  }

  async assertFieldEnabled(fieldName: string) {
    expect(await this.sb.fieldArrow(fieldName, true).isVisible()).toBe(true);
  }

  async assertFieldsEnabled(fieldNames: string[]) {
    for (let i = 0; i < fieldNames.length; i++) {
      await this.assertFieldEnabled(fieldNames[i]);
    }
  }

  async assertFieldsInSidebar(fieldNames: string[]) {
    for (let i = 0; i < fieldNames.length; i++) {
      await this.assertFieldInSidebar(fieldNames[i]);
    }
  }

  async assertFieldsNotInSidebar(fieldNames: string[]) {
    for (let i = 0; i < fieldNames.length; i++) {
      await this.assertFieldNotInSidebar(fieldNames[i]);
    }
  }

  async assertFieldNotInSidebar(fieldName: string) {
    expect(await this.sb.field(fieldName).isVisible()).toBe(false);
  }

  async assertFilterIsVisible(fieldName: string, filterType: "categorical") {
    expect(await this.sb.filter(fieldName, filterType).isVisible()).toBe(true);
  }

  async assertSidebarGroupIsVisible(groupName: string) {
    expect(await this.sb.groupField(groupName).isVisible()).toBe(true);
  }

  async assertSidebarGroupIsHidden(groupName: string) {
    expect(await this.sb.groupField(groupName).isVisible()).toBe(false);
  }

  async assertAddGroupVisible() {
    expect(await this.sb.addGroupField.isVisible()).toBe(true);
  }

  async assertAddGroupHidden() {
    expect(await this.sb.addGroupField.isVisible()).toBe(false);
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
    expect(await draggableSidebarFieldArea.getAttribute("data-draggable")).toBe(
      "true",
    );
  }

  async assertCanDragField(fieldName: string) {
    expect(
      await this.sb
        .sidebarEntryDraggableArea(fieldName)
        .getAttribute("data-draggable"),
    ).toBe("true");
  }

  async assertCannotDragField(fieldName: string) {
    expect(
      await this.sb
        .sidebarEntryDraggableArea(fieldName)
        .getAttribute("data-draggable"),
    ).not.toBe("true");
  }
}
