import { Locator, Page } from "src/oss/fixtures";
import { DisplayOptionsPom } from "./display-options";
import { SelectorPom } from "../selector";

export class GridActionsRowPom {
  readonly page: Page;
  readonly gridActionsRow: Locator;
  readonly displayActions: DisplayOptionsPom;

  constructor(page: Page) {
    this.page = page;
    this.displayActions = new DisplayOptionsPom(page);
    this.gridActionsRow = page.getByTestId("fo-grid-actions");
  }

  private async openAction(actionTestId: string) {
    const selector = this.page.getByTestId(actionTestId);
    return selector.click();
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

  async groupBy(path: string, selector: SelectorPom) {
    await selector.openResults();
    await selector.selectResult(path);
    await this.gridActionsRow.getByTestId("dynamic-group-btn-submit").click();
  }

  toPatchesByLabelField(fieldName: string) {
    return this.page.getByTestId(`item-action-${fieldName}`);
  }
}
