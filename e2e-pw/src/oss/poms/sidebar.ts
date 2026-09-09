import { Locator, Page, expect } from "src/oss/fixtures";

export const SIDEBAR_MODE = {
  FILTER: "FILTER",
  VISIBILITY: "VISIBILITY",
} as const;

export type SidebarMode = (typeof SIDEBAR_MODE)[keyof typeof SIDEBAR_MODE];

const SIDEBAR_MODE_TOOLTIP: Record<SidebarMode, string> = {
  [SIDEBAR_MODE.FILTER]:
    "Use the controls below to create filtered views into your data",
  [SIDEBAR_MODE.VISIBILITY]:
    "Use the controls below to toggle the visibility of field values in the grid",
};

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
   * The header of a sidebar group
   */
  groupField(groupName: string) {
    return this.sidebar.getByTestId(`sidebar-group-${groupName}-field`);
  }

  /**
   * The input for adding a new sidebar group
   */
  get addGroupField() {
    return this.sidebar.getByTestId("sidebar-field-add-group-input");
  }

  /**
   * The name element of a field entry
   */
  field(fieldName: string) {
    return this.sidebar
      .getByTestId(`${fieldName}-field`)
      .locator("div")
      .filter({ hasText: fieldName })
      .nth(1);
  }

  /**
   * The container of a field entry
   */
  fieldContainer(fieldName: string) {
    return this.sidebar.getByTestId(`sidebar-field-container-${fieldName}`);
  }

  /**
   * The expand arrow of a field entry, in its enabled or disabled state
   */
  fieldArrow(fieldName: string, enabled: boolean) {
    return this.fieldContainer(fieldName).getByTestId(
      `sidebar-field-arrow-${enabled ? "enabled" : "disabled"}-${fieldName}`,
    );
  }

  /**
   * The filter widget rendered below an expanded field entry
   */
  filter(fieldName: string, filterType: "categorical" | "numeric") {
    return this.sidebar.getByTestId(`${filterType}-filter-${fieldName}`);
  }

  /**
   * The query performance indicator of a field entry, or of its filter widget when `filterType` is given
   */
  queryPerformance(fieldName: string, filterType?: "categorical" | "numeric") {
    const locator = filterType
      ? this.filter(fieldName, filterType)
      : this.fieldContainer(fieldName);
    return locator.getByTestId("query-performance");
  }

  /**
   * The drag handle of a field entry
   */
  sidebarEntryDraggableArea(fieldName: string) {
    return this.sidebar
      .getByTestId(`sidebar-entry-draggable-${fieldName}`)
      .first();
  }

  /**
   * The container of a numeric field's range slider
   */
  getNumericSliderContainer(field: string) {
    return this.sidebar.getByTestId(`numeric-slider-container-${field}`);
  }

  /**
   * The range slider of a numeric field
   */
  getSlider(field: string) {
    return this.getNumericSliderContainer(field).getByTestId("slider");
  }

  /**
   * A range slider handle by its label text, or its parent when `parent` is set
   */
  getSliderIndicator(field: string, text: string, parent?: boolean) {
    const point = this.getSlider(field)
      .locator("span")
      .filter({ hasText: text })
      .first();
    // TODO: we should figure out why pointA.dragTo(pointB) stopped working
    // recent with upgrades. ".." drags to the center of slider
    return parent ? point.locator("..") : point;
  }

  /**
   * Toggle a field's checkbox
   */
  async clickFieldCheckbox(field: string) {
    const selector = this.sidebar.getByTestId(`checkbox-${field}`);
    return selector.click();
  }

  /**
   * Expand a field entry
   */
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

  /**
   * Wait for an element in the sidebar to be visible
   */
  async waitForElement(dataCy: string) {
    const selector = this.sidebar.getByTestId(dataCy);
    await selector.waitFor();
    await expect(selector).toBeVisible();
  }

  /**
   * The count element of a value in a categorical filter list, which renders as a list below 25 entries
   */
  async getAttributeItemCount(field: string, attributeValue: string) {
    const container = this.sidebar.getByTestId(`categorical-filter-${field}`);
    const item = container.getByTestId(`checkbox-${attributeValue}`);
    return item.getByTestId(`entry-count-all`);
  }

  /**
   * Drag a numeric filter's start handle from one labeled point to another
   */
  async changeSliderStartValue(field: string, textA: string, textB: string) {
    const sliderStart = this.getSliderIndicator(field, textA);
    const sliderMidPoint = this.getSliderIndicator(field, textB, true);
    await sliderStart.dragTo(sliderMidPoint, { timeout: 1000 });
  }

  /**
   * Check a value in a categorical filter list
   */
  async applyFilter(label: string) {
    const selectionDiv = this.sidebar
      .getByTestId("checkbox-" + label)
      .getByTitle(label);
    // no force: the actionability wait keeps the click from landing while
    // the filter dropdown is still animating open (a forced click computes
    // its point once and misses a moving checkbox)
    await selectionDiv.click();
  }

  /**
   * Search a categorical filter's values
   */
  async applySearch(field: string, search: string) {
    const input = this.sidebar.getByTestId(`selector-sidebar-search-${field}`);
    await input.fill(search);
    await input.press("Enter");
  }

  /**
   * Check the given values in a categorical filter list, then choose the filter mode from the mode dropdown
   */
  async applyLabelFromList(labels: string[], targetModeId: string) {
    for (const label of labels) {
      await this.applyFilter(label);
    }

    const currentMode = this.sidebar.getByTestId("filter-mode-div");
    await currentMode.waitFor();
    await currentMode.click();
    // make sure the pop out panel is fully expanded, to make sure click is successful
    const targetMode = this.sidebar.getByTestId(
      `filter-option-${targetModeId}`,
    );
    return targetMode.click();
  }

  /**
   * Reset a categorical filter
   */
  async resetAttribute(attribute: string) {
    const container = this.sidebar.getByTestId(
      `categorical-filter-${attribute}`,
    );
    const reset = container.getByTestId("filter-reset");
    return reset.click();
  }

  /**
   * The filter/visibility mode toggle
   */
  get modeToggle() {
    return this.sidebar.getByTestId("sidebar-mode-status");
  }

  /**
   * The mode toggle's tooltip; `@fiftyone/components` renders a Tooltip with
   * the test id `tooltip-${text}`
   */
  modeTooltip(mode: SidebarMode) {
    return this.page.getByTestId(`tooltip-${SIDEBAR_MODE_TOOLTIP[mode]}`);
  }

  /**
   * Read the sidebar's current mode off the mode toggle
   */
  async getActiveMode(): Promise<SidebarMode> {
    const text = await this.modeToggle.textContent();
    if (text !== SIDEBAR_MODE.FILTER && text !== SIDEBAR_MODE.VISIBILITY) {
      throw new Error(`unknown sidebar mode '${text}'`);
    }
    return text;
  }

  /**
   * Toggle between filter and visibility mode
   *
   * @returns The mode the sidebar is in after the toggle
   */
  async toggleSidebarMode(): Promise<SidebarMode> {
    const mode =
      (await this.getActiveMode()) === SIDEBAR_MODE.FILTER
        ? SIDEBAR_MODE.VISIBILITY
        : SIDEBAR_MODE.FILTER;
    await this.modeToggle.click();
    await expect(this.modeToggle).toHaveText(mode);
    return mode;
  }

  /**
   * Collapse or expand a sidebar group
   */
  async toggleSidebarGroup(name: string) {
    await this.sidebar.getByTestId(`sidebar-group-${name}`).click();
  }
}

class SidebarAsserter {
  constructor(private readonly sb: SidebarPom) {}

  /**
   * Assert the mode toggle's tooltip for `mode` is not shown
   */
  async modeTooltipHidden(mode: SidebarMode) {
    await expect(this.sb.modeTooltip(mode)).toBeHidden();
  }

  /**
   * Assert a field's checkbox is rendered
   */
  async assertCheckboxEnabled(fieldName: string) {
    await expect(
      this.sb.sidebar.getByTestId(`checkbox-${fieldName}`),
    ).toBeVisible();
  }

  /**
   * Assert a field's checkbox is not rendered
   */
  async assertCheckboxDisabled(fieldName: string) {
    await expect(
      this.sb.sidebar.getByTestId(`checkbox-${fieldName}`),
    ).toHaveCount(0);
  }

  /**
   * Assert every field's checkbox is rendered
   */
  async assertCheckboxesEnabled(fieldNames: string[]) {
    for (let i = 0; i < fieldNames.length; i++) {
      await this.assertCheckboxEnabled(fieldNames[i]);
    }
  }

  /**
   * Assert no field's checkbox is rendered
   */
  async assertCheckboxesDisabled(fieldNames: string[]) {
    for (let i = 0; i < fieldNames.length; i++) {
      await this.assertCheckboxDisabled(fieldNames[i]);
    }
  }

  /**
   * Assert a field entry shows the query performance indicator
   */
  async assertFieldHasQueryPerformance(fieldName: string) {
    await expect(this.sb.queryPerformance(fieldName)).toBeVisible();
  }

  /**
   * Assert a field entry does not show the query performance indicator
   */
  async assertFieldMissingQueryPerformance(fieldName: string) {
    await expect(this.sb.queryPerformance(fieldName)).toBeHidden();
  }

  /**
   * Assert a field's filter widget shows the query performance indicator
   */
  async assertSubfieldHasQueryPerformance(
    fieldName: string,
    filterType?: "categorical" | "numeric",
  ) {
    await expect(this.sb.queryPerformance(fieldName, filterType)).toBeVisible();
  }

  /**
   * Assert a field's filter widget does not show the query performance indicator
   */
  async assertSubfieldMissingQueryPerformance(
    fieldName: string,
    filterType?: "categorical" | "numeric",
  ) {
    await expect(this.sb.queryPerformance(fieldName, filterType)).toBeHidden();
  }

  /**
   * Assert a field entry is visible
   */
  async assertFieldInSidebar(fieldName: string) {
    await expect(this.sb.field(fieldName)).toBeVisible();
  }

  /**
   * Assert a field entry cannot be expanded
   */
  async assertFieldDisabled(fieldName: string) {
    await expect(this.sb.fieldArrow(fieldName, true)).toHaveCount(0);
  }

  /**
   * Assert a field entry has no expand arrow at all
   */
  async assertFieldArrowRemoved(fieldName: string) {
    await expect(this.sb.fieldArrow(fieldName, false)).toHaveCount(0);
    await expect(this.sb.fieldArrow(fieldName, true)).toHaveCount(0);
  }

  /**
   * Assert none of the field entries can be expanded
   */
  async assertFieldsDisabled(fieldNames: string[]) {
    for (let i = 0; i < fieldNames.length; i++) {
      await this.assertFieldDisabled(fieldNames[i]);
    }
  }

  /**
   * Assert a field entry can be expanded
   */
  async assertFieldEnabled(fieldName: string) {
    await expect(this.sb.fieldArrow(fieldName, true)).toBeVisible();
  }

  /**
   * Assert every field entry can be expanded
   */
  async assertFieldsEnabled(fieldNames: string[]) {
    for (let i = 0; i < fieldNames.length; i++) {
      await this.assertFieldEnabled(fieldNames[i]);
    }
  }

  /**
   * Assert every field entry is visible
   */
  async assertFieldsInSidebar(fieldNames: string[]) {
    for (let i = 0; i < fieldNames.length; i++) {
      await this.assertFieldInSidebar(fieldNames[i]);
    }
  }

  /**
   * Assert none of the field entries are visible
   */
  async assertFieldsNotInSidebar(fieldNames: string[]) {
    for (let i = 0; i < fieldNames.length; i++) {
      await this.assertFieldNotInSidebar(fieldNames[i]);
    }
  }

  /**
   * Assert a field entry is not visible
   */
  async assertFieldNotInSidebar(fieldName: string) {
    await expect(this.sb.field(fieldName)).toBeHidden();
  }

  /**
   * Assert a field's filter widget is visible
   */
  async assertFilterIsVisible(fieldName: string, filterType: "categorical") {
    await expect(this.sb.filter(fieldName, filterType)).toBeVisible();
  }

  /**
   * Assert a sidebar group header is visible
   */
  async assertSidebarGroupIsVisible(groupName: string) {
    await expect(this.sb.groupField(groupName)).toBeVisible();
  }

  /**
   * Assert a sidebar group header is not visible
   */
  async assertSidebarGroupIsHidden(groupName: string) {
    await expect(this.sb.groupField(groupName)).toBeHidden({ timeout: 1000 });
  }

  /**
   * Assert the add-group input is visible
   */
  async assertAddGroupVisible() {
    await expect(this.sb.addGroupField).toBeVisible({ timeout: 1000 });
  }

  /**
   * Assert the add-group input is not visible
   */
  async assertAddGroupHidden() {
    await expect(this.sb.addGroupField).toBeHidden({ timeout: 1000 });
  }

  /**
   * Drag a field entry into a group and assert it moved and stays draggable
   */
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
      "true",
    );
  }

  /**
   * Assert a field entry is draggable
   */
  async assertCanDragField(fieldName: string) {
    await expect(this.sb.sidebarEntryDraggableArea(fieldName)).toHaveAttribute(
      "data-draggable",
      "true",
    );
  }

  /**
   * Assert a field entry is not draggable
   */
  async assertCannotDragField(fieldName: string) {
    await expect(
      this.sb.sidebarEntryDraggableArea(fieldName),
    ).not.toHaveAttribute("data-draggable", "true");
  }
}
