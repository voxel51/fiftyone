import { Locator, Page, expect } from "src/oss/fixtures";
import { EventUtils } from "src/shared/event-utils";
import { GridPom } from "../grid";

const SELECTION_SHOWN = "e2e:schema:selection-shown";
const ROW_PREFIX = "schema-selection-";

type TabType = "Filter rule" | "Selection";

export class FieldVisibilityPom {
  readonly page: Page;
  readonly gridPom: GridPom;
  readonly asserter: FieldVisibilityAsserter;

  readonly sidebarLocator: Locator;
  readonly containerLocator: Locator;

  constructor(
    page: Page,
    gridPom: GridPom,
    private readonly eventUtils: EventUtils,
  ) {
    this.page = page;
    this.gridPom = gridPom;

    this.asserter = new FieldVisibilityAsserter(this);

    this.sidebarLocator = page.getByTestId("sidebar");
    this.containerLocator = page.getByTestId("field-visibility-container");
  }

  get fieldVisibilityBtn() {
    return this.sidebarLocator.getByTestId("field-visibility-icon");
  }

  get fieldVisibilityToggleTooltip() {
    return this.page.getByTestId("tooltip-Change field visibility");
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
      "filter-visibility-filter-rule-input",
    );
  }

  getFieldVisibilityControl(label: string) {
    return this.containerLocator.getByTestId(
      `field-visibility-controls-${label}`,
    );
  }

  getControl(
    name: "select-all" | "show-field-metadata" | "show-nested-fields",
  ) {
    return this.getFieldVisibilityControl(name);
  }

  getFieldInfoContainer(path: string) {
    return this.containerLocator.getByTestId(
      `schema-selection-info-container-${path}`,
    );
  }

  getTab(tabName: TabType) {
    return this.containerLocator.getByTitle(tabName);
  }

  /** The rendered selection rows `mode` covers, in order, read once */
  async selectionRows(
    mode: "parents-only" | "nested-only" | "all" = "parents-only",
  ) {
    const rows = await this.containerLocator
      .locator(
        `[data-cy^="${ROW_PREFIX}"]:not([data-cy^="${ROW_PREFIX}info-container-"])`,
      )
      .evaluateAll(
        (elements, prefix) =>
          elements.map((element) => ({
            path: (element.getAttribute("data-cy") ?? "").slice(prefix.length),
            checked: Boolean(element.querySelector("input")?.checked),
          })),
        ROW_PREFIX,
      );
    return rows.filter(({ path }) =>
      mode === "all" ? true : path.includes(".") === (mode === "nested-only"),
    );
  }

  /** Run `action` and resolve once the selection rows it changes render */
  private afterSelectionShown<T>(action: () => Promise<T>): Promise<T> {
    return this.eventUtils.after(SELECTION_SHOWN, action);
  }

  async toggleAllSelection() {
    await this.afterSelectionShown(() => this.getControl("select-all").click());
  }

  async toggleShowNestedFields() {
    await this.afterSelectionShown(() =>
      this.getControl("show-nested-fields").click(),
    );
  }

  async toggleShowMetadata() {
    await this.afterSelectionShown(() =>
      this.getControl("show-field-metadata").click(),
    );
  }

  async openFieldVisibilityModal() {
    await this.eventUtils.after("e2e:schema:field-visibility-opened", () =>
      this.fieldVisibilityBtn.click(),
    );
  }

  /** Hover the field visibility icon; its tooltip opens after a delay */
  async hoverIcon() {
    await this.fieldVisibilityBtn.hover();
  }

  async hideFields(paths: string[]) {
    await this.openFieldVisibilityModal();

    for (let i = 0; i < paths.length; i++) {
      await this.page
        .getByTestId(`schema-selection-${paths[i]}`)
        .getByRole("checkbox", { checked: true })
        .click();
    }

    await this.submitFieldVisibilityChanges();
  }

  async submitFieldVisibilityChanges() {
    await this.gridPom.run(async () => {
      await this.applyBtn.click();
    });
  }

  async clearFieldVisibilityChanges() {
    await this.gridPom.run(async () => {
      await this.clearBtn.click();
    });
  }

  async clickReset() {
    await this.gridPom.run(async () => {
      await this.resetBtn.click();
    });
  }

  async openTab(tabName: TabType) {
    await this.afterSelectionShown(() => this.getTab(tabName).click());
  }

  /** Type a filter rule and run its search with Enter */
  async addFilterRuleInput(input: string) {
    await this.filterRuleInput.fill(input);
    await this.afterSelectionShown(() => this.filterRuleInput.press("Enter"));
  }
}

class FieldVisibilityAsserter {
  constructor(private readonly fv: FieldVisibilityPom) {}

  /** The hover's tooltip; the read waits for it to open */
  async fieldVisibilityIconHasTooltip() {
    expect(await this.fv.fieldVisibilityToggleTooltip.textContent()).toBe(
      "Change field visibility",
    );
  }

  /** The rendered rows `mode` covers, in order, split by their checkbox */
  async assertSelection(
    expected: { checked: string[]; unchecked: string[] },
    mode: "parents-only" | "nested-only" | "all" = "parents-only",
  ) {
    const rows = await this.fv.selectionRows(mode);
    expect({
      checked: rows.filter((row) => row.checked).map(({ path }) => path),
      unchecked: rows.filter((row) => !row.checked).map(({ path }) => path),
    }).toEqual(expected);
  }

  /** Exactly these rows render, in order */
  async assertShownFields(paths: string[]) {
    const rows = await this.fv.selectionRows("all");
    expect(rows.map(({ path }) => path)).toEqual(paths);
  }

  async assertMetadataInVisible(path: string = "ground_truth") {
    const fieldInfoContainer = this.fv.getFieldInfoContainer(path);
    expect(await fieldInfoContainer.isVisible()).toBe(false);
  }

  async assertMetadataVisible(path: string = "ground_truth") {
    const fieldInfoContainer = this.fv.getFieldInfoContainer(path);
    expect(await fieldInfoContainer.isVisible()).toBe(true);
    expect(
      await fieldInfoContainer.getByText(`${path} description`).isVisible(),
    ).toBe(true);
  }

  async assertFilterRuleExamplesVisible() {
    expect(await this.fv.filterRuleContainer.isVisible()).toBe(true);
  }
}
