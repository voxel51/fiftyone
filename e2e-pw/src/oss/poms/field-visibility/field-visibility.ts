import { Locator, Page, expect } from "src/oss/fixtures";
import { SidebarPom } from "../sidebar";

const enabledParentPaths = ["uniqueness", "predictions", "ground_truth"];
const disabledParentPaths = ["filepath", "id", "metadata", "tags"];
const allParentPaths = [...enabledParentPaths, ...disabledParentPaths];
const annotationSubpaths = (type: "predictions" | "ground_truth") => [
  `${type}.detections.confidence`,
  `${type}.detections.id`,
  `${type}.detections.label`,
  `${type}.detections.tags`,
];
const metadataSubpaths = [
  "metadata.height",
  "metadata.mime_type",
  "metadata.num_channels",
  "metadata.size_bytes",
  "metadata.width",
];
const allSubpaths = [
  ...annotationSubpaths("predictions"),
  ...annotationSubpaths("ground_truth"),
  ...metadataSubpaths,
];
const allPaths = [...allParentPaths, ...allSubpaths];
const defaultParentPaths = ["id", "filepath", "metadata", "tags"];
const defaultAllPaths = [
  "id",
  "filepath",
  "metadata",
  "tags",
  ...metadataSubpaths,
];

type TabType = "Filter rule" | "Selection";

export class FieldVisibilityPom {
  readonly page: Page;
  readonly asserter: FieldVisibilityAsserter;

  readonly sidebarLocator: Locator;
  readonly containerLocator: Locator;

  constructor(page: Page) {
    this.page = page;

    this.asserter = new FieldVisibilityAsserter(this, new SidebarPom(page));

    this.sidebarLocator = page.getByTestId("sidebar");
    this.containerLocator = page.getByTestId("field-visibility-container");
  }

  get modalContainer() {
    return this.page.getByTestId("field-visibility-container");
  }

  get fieldVisibilityBtn() {
    return this.sidebarLocator.getByTestId("field-visibility-icon");
  }

  get fieldVisibilityToggleTooltip() {
    return this.page.getByText("Change field visibility");
  }

  get clearBtn() {
    return this.sidebarLocator.getByTestId("field-visibility-btn-clear");
  }

  get applyBtn() {
    return this.containerLocator.getByTestId("field-visibility-btn-apply");
  }

  get resetBtn() {
    return this.containerLocator.getByTestId("field-visibility-btn-reset");
  }

  get filterRuleContainer() {
    return this.containerLocator.getByTestId("filter-rule-container");
  }

  get filterRuleInput() {
    return this.containerLocator.getByTestId(
      "filter-visibility-filter-rule-input"
    );
  }

  getFieldCheckbox(name: string) {
    return this.page
      .getByTestId(`schema-selection-${name}`)
      .getByRole("checkbox");
  }

  getFieldVisibilityControl(label: string) {
    return this.containerLocator.getByTestId(
      `field-visibility-controls-${label}`
    );
  }

  getControl(name: "select-all" | "show-metadata" | "show-nested-fields") {
    return this.getFieldVisibilityControl(name);
  }

  getFieldInfoContainer(path: string) {
    return this.containerLocator.getByTestId(
      `schema-selection-info-container-${path}`
    );
  }

  getTab(tabName: TabType) {
    return this.containerLocator.getByTitle(tabName);
  }

  async getSelectionFields(
    status: "checked" | "unchecked" | "all" = "checked",
    mode:
      | "parents-only"
      | "nested-only"
      | "all"
      | "customFields" = "parents-only"
  ) {
    let paths: string[] = [];
    switch (mode) {
      case "parents-only":
        paths = allParentPaths;
        break;
      case "nested-only":
        paths = allSubpaths;
        break;
      case "all":
        paths = allPaths;
        break;
      case "customFields":
      default:
        break;
    }

    const checked = status === "checked";
    const fields: string[] = [];

    for (let i = 0; i < paths.length; i++) {
      const cc = this.getFieldCheckbox(paths[i]);
      if (status === "all") {
        fields.push(paths[i]);
        continue;
      }

      const isCheckedFinal = await cc.isChecked();
      if ((checked && isCheckedFinal) || (!checked && !isCheckedFinal)) {
        fields.push(paths[i]);
      }
    }
    return fields;
  }

  async toggleAllSelection() {
    const toggle = this.getControl("select-all");
    await toggle.click();
  }

  async toggleShowNestedFields() {
    const toggle = this.getControl("show-nested-fields");
    await toggle.click();
  }

  async toggleShowMetadata() {
    const toggle = this.getControl("show-metadata");
    await toggle.click();
  }

  async openFieldVisibilityModal() {
    await this.fieldVisibilityBtn.click();
  }

  async hideFields(paths: string[]) {
    for (let i = 0; i < paths.length; i++) {
      await this.page
        .getByTestId(`schema-selection-${paths[i]}`)
        .getByRole("checkbox", { checked: true })
        .click();
    }

    await this.submitFieldVisibilityChanges();
  }

  async submitFieldVisibilityChanges() {
    await this.applyBtn.click();
  }

  async clearFieldVisibilityChanges() {
    await this.clearBtn.click();
  }

  async clickReset() {
    return await this.resetBtn.click();
  }

  async openTab(tabName: TabType) {
    return await this.getTab(tabName).click();
  }

  async addFilterRuleInput(input: string) {
    await this.filterRuleInput.type(input);
    await this.filterRuleInput.press("Enter");
  }
}

class FieldVisibilityAsserter {
  constructor(private readonly fv: FieldVisibilityPom) {}

  async fieldVisibilityIconHasTooltip() {
    await this.fv.fieldVisibilityBtn.hover();
    await expect(this.fv.fieldVisibilityToggleTooltip).toBeVisible();
  }

  async assertAllFieldsSelected(selectionFields: string[] = allParentPaths) {
    await this.fv.openFieldVisibilityModal();
    const expectedSelectionFields = await this.fv.getSelectionFields();

    expect(expectedSelectionFields.length).toEqual(selectionFields.length);
  }

  async assertEnabledFieldsAreUnselected() {
    const fields = await this.fv.getSelectionFields("unchecked");
    expect(fields.length).toEqual(enabledParentPaths.length);
  }

  async assertEnabledFieldsAreSelected() {
    const fields = await this.fv.getSelectionFields();
    expect(fields.length).toEqual(disabledParentPaths.length);
  }

  async assertNestedFieldsVisible() {
    const fields = await this.fv.getSelectionFields("all", "all");
    expect(fields.length).toBeGreaterThan(allParentPaths.length);
  }

  async assertMetadataInvisibile(path: string = "ground_truth") {
    const fieldInfoContainer = this.fv.getFieldInfoContainer(path);
    await expect(fieldInfoContainer).toBeHidden();
  }

  async assertMetadataVisibile(path: string = "ground_truth") {
    const fieldInfoContainer = this.fv.getFieldInfoContainer(path);
    await expect(fieldInfoContainer).toBeVisible();
    await expect(
      fieldInfoContainer.getByText(`${path} description`)
    ).toBeVisible();
  }

  async assertFilterRuleExamplesVisibile() {
    await expect(this.fv.filterRuleContainer).toBeVisible();
  }

  async assertDefaultParentPathsSelected() {
    const fields = await this.fv.getSelectionFields("checked", "parents-only");
    expect(fields.length).toEqual(defaultParentPaths.length);
  }

  async assertDefaultPathsSelected() {
    const fields = await this.fv.getSelectionFields("checked", "all");
    expect(fields).toHaveLength(defaultAllPaths.length);
  }

  async assertFieldsAreSelected(fieldNames: string[]) {
    const selectedFields = await this.fv.getSelectionFields(
      "checked",
      "parents-only"
    );
    for (let i = 0; i < fieldNames.length; i++) {
      expect(selectedFields).toContain(fieldNames[i]);
    }
  }
}
