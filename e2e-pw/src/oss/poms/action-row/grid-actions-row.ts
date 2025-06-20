import { Locator, Page, expect } from "src/oss/fixtures";
import { DisplayOptionsPom } from "./display-options";

export class GridActionsRowPom {
  readonly page: Page;
  readonly gridActionsRow: Locator;
  readonly assert: GridActionsRowAsserter;

  readonly displayActions: DisplayOptionsPom;

  constructor(page: Page) {
    this.page = page;
    this.gridActionsRow = page.getByTestId("fo-grid-actions");
    this.assert = new GridActionsRowAsserter(this);

    this.displayActions = new DisplayOptionsPom(page);
  }

  private async openAction(actionTestId: string) {
    const selector = this.page.getByTestId(actionTestId);
    return selector.click();
  }

  get filtersBookmark() {
    return this.gridActionsRow.getByTestId(
      "action-convert-filters-to-view-stages"
    );
  }

  async bookmarkFilters() {
    await this.filtersBookmark.click();
  }

  async toggleDisplayOptions() {
    return this.openAction("action-display-options");
  }

  async toggleBrowseOperations() {
    return this.openAction("action-browse-operations");
  }

  async toggleCreateDynamicGroups() {
    return this.openAction("action-create-dynamic-groups");
  }

  async toggleSortBySimilarity() {
    return this.openAction("action-sort-by-similarity");
  }

  async toggleToClipsOrPatches() {
    return this.openAction("action-clips-patches");
  }

  async toggleTagSamplesOrLabels() {
    return this.openAction("action-tag-sample-labels");
  }

  async toggleColorSettings() {
    return this.openAction("action-color-settings");
  }

  async clickToPatchesByLabelField(fieldName: string) {
    await this.toPatchesByLabelField(fieldName).click();
  }

  toPatchesByLabelField(fieldName: string) {
    return this.page.getByTestId(`item-action-${fieldName}`);
  }
}

class GridActionsRowAsserter {
  constructor(private readonly gridPom: GridActionsRowPom) {}

  async hasFiltersBookmark() {
    await expect(this.gridPom.filtersBookmark).toBeVisible();
  }
}
