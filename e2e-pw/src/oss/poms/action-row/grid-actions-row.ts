import { Locator, Page } from "src/oss/fixtures";
import { EventUtils } from "src/shared/event-utils";
import { DisplayOptionsPom } from "./display-options";
import { DynamicGroupPom } from "./dynamic-group";

export class GridActionsRowPom {
  readonly page: Page;
  readonly gridActionsRow: Locator;

  readonly displayActions: DisplayOptionsPom;
  readonly dynamicGroup: DynamicGroupPom;

  constructor(page: Page, eventUtils: EventUtils) {
    this.page = page;
    this.gridActionsRow = page.getByTestId("fo-grid-actions");

    this.displayActions = new DisplayOptionsPom(page);
    this.dynamicGroup = new DynamicGroupPom(page, eventUtils);
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
    await this.openAction("action-clips-patches");
    await this.page
      .getByTestId("popout")
      .getByTestId(`item-action-${fieldName}`)
      .click();
  }

  async groupBy(groupBy: string, orderBy?: string) {
    await this.dynamicGroup.groupBy.openResults();
    await this.dynamicGroup.groupBy.selectResult(groupBy);
    if (orderBy) {
      await this.dynamicGroup.selectTabOption("Ordered");
      await this.dynamicGroup.orderBy.openResults();
      await this.dynamicGroup.orderBy.selectResult(orderBy);
    }

    await this.dynamicGroup.submit();
  }
}
