import { Page } from "src/oss/fixtures";
import { DisplayOptionsPom } from "./display-options";

export class GridActionsRowPom {
  readonly page: Page;
  readonly displayActions: DisplayOptionsPom;

  constructor(page: Page) {
    this.page = page;
    this.displayActions = new DisplayOptionsPom(page);
  }

  private async openAction(actionTestId: string) {
    const selector = this.page.getByTestId(actionTestId);
    return selector.click();
  }

  async openDisplayOptions() {
    return this.openAction("action-display-options");
  }

  async openBrowseOperations() {
    return this.openAction("action-browse-operations");
  }

  async openCreateDynamicGroups() {
    return this.openAction("action-create-dynamic-groups");
  }

  async openSortBySimilarity() {
    return this.openAction("action-sort-by-similarity");
  }

  async openToClipsOrPatches() {
    return this.openAction("action-clips-patches");
  }

  async openTagSamplesOrLabels() {
    return this.openAction("action-tag-sample-labels");
  }

  async openColorSettings() {
    return this.openAction("action-color-settings");
  }
}
