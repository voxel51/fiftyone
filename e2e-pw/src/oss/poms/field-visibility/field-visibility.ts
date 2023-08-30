import { Locator, Page } from "src/oss/fixtures";
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

  getFieldVisibilityToggleTooltip() {
    return this.page.getByText("Change field visibility");
  }

  getFieldCheckbox(name: string) {
    return this.page
      .getByTestId(`schema-selection-${name}`)
      .getByRole("checkbox");
  }

  async getSelectionFields(
    status: "checked" | "unchecked" | "all" = "checked",
    mode:
      | "parents-only"
      | "nested-only"
      | "all"
      | "customFields" = "parents-only",
    customFields?: string[]
  ) {
    let paths = [];
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
    const fields = [];

    for (let i = 0; i < paths.length; i++) {
      const cc = this.getFieldCheckbox(paths[i]);
      if (status === "all") {
        fields.push(cc);
        continue;
      }

      const isCheckedFinal = await cc.isChecked();
      if ((checked && isCheckedFinal) || (!checked && !isCheckedFinal)) {
        fields.push(paths[i]);
      }
    }
    return fields;
  }

  getFieldVisibilityBtn() {
    return this.sidebarLocator.getByTestId("field-visibility-icon");
  }

  getFieldVisibilityControl(label: string) {
    return this.containerLocator.getByTestId(
      `field-visibility-controls-${label}`
    );
  }

  getControl(name: "select-all" | "show-nested-fields" | "show-metadata") {
    return this.getFieldVisibilityControl(name);
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

  get clearBtn() {
    return this.sidebarLocator.getByTestId("field-visibility-btn-clear");
  }

  get applyBtn() {
    return this.modalContainer.getByTestId("field-visibility-btn-apply");
  }

  getFieldInfoContainer(path: string) {
    return this.modalContainer().getByTestId(
      `schema-selection-info-container-${path}`
    );
  }

  getResetBtn() {
    return this.modalContainer().getByTestId("field-visibility-btn-reset");
  }

  async clickReset() {
    return await this.getResetBtn().click();
  }

  getTab(tabName: TabType) {
    return this.modalContainer().getByTitle(tabName);
  }

  async openTab(tabName: TabType) {
    return await this.getTab(tabName).click();
  }

  getFilterRuleContainer() {
    return this.modalContainer().getByTestId("filter-rule-container");
  }

  getFilterRuleInput() {
    return this.modalContainer().getByTestId(
      "filter-visibility-filter-rule-input"
    );
  }

  async addFilterRuleInput(input: string) {
    await this.getFilterRuleInput().type(input);
    await this.getFilterRuleInput().press("Enter");
  }
}

class FieldVisibilityAsserter {
  constructor(
    private readonly fv: FieldVisibilityPom,
    private readonly sb: SidebarPom
  ) {}

  async fieldVisibilityIconHasTooltip() {
    const visibilityIcon = this.fv.getFieldVisibilityBtn();
    await visibilityIcon.hover();
    await expect(this.fv.getFieldVisibilityToggleTooltip()).toBeVisible();
  }

  async assertAllFieldsSelected() {
    await this.fv.openFieldVisibilityModal();
    const selectionFields = await this.fv.getSelectionFields();

    expect(selectionFields.length).toEqual(allParentPaths.length);
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
    const exampleContainer = this.fv.getFilterRuleContainer();
    console.log("exampleContainer", exampleContainer);
    await expect(exampleContainer).toBeVisible();
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
