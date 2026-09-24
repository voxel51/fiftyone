import { expect, Locator, Page } from "src/oss/fixtures";
import { EventUtils } from "src/shared/event-utils";

export type Color =
  | "Gray"
  | "Blue"
  | "Purple"
  | "Red"
  | "Yellow"
  | "Green"
  | "Pink"
  | "Orange"
  | "Purple";

export type SaveViewParams = {
  name: string;
  description: string;
  color: Color;
  id?: number;
  newColor?: Color;
  slug?: string;
};

const defaultColor = "Gray";

const DIALOG = '[data-cy="saved-views-modal-body-container"]';
const SELECTION_LIST = '[data-cy="saved-views-selection-view"]';
const COLOR_LIST =
  '[data-cy="saved-views-input-color-selection-selection-view"]';

export class SavedViewsPom {
  readonly page: Page;
  readonly assert: SavedViewAsserter;

  readonly locator: Locator;
  readonly dialogLocator: Locator;

  constructor(
    page: Page,
    readonly eventUtils: EventUtils,
  ) {
    this.page = page;
    this.assert = new SavedViewAsserter(this);

    this.locator = page.getByTestId("saved-views-selection-container");
    this.dialogLocator = page.getByTestId("saved-views-modal-body-container");
  }

  get selector() {
    return this.locator.getByTestId("saved-views-selection");
  }

  get clearViewBtn() {
    return this.locator.getByTestId("saved-views-btn-selection-clear").first();
  }

  get closeModalBtn() {
    return this.dialogLocator.getByTestId("saved-views-btn-close");
  }

  get saveNewViewBtn() {
    return this.page.getByTestId("saved-views-create-new");
  }

  async clickEditRaw(slug: string) {
    await this.openSelect();
    await this.clickOptionEdit(slug);
  }

  /** Open a saved view's edit dialog, resolving once it shows the view */
  async clickOptionEdit(slug: string) {
    await this.savedViewOption(slug).hover();
    await this.optionEdit(slug).click();
    await this.eventUtils.untilPresent(DIALOG);
    // the dialog fills its inputs from the view in an effect after it mounts
    await this.eventUtils.untilDom(
      this.nameInput(),
      (input) => (input as HTMLInputElement).value !== "",
    );
  }

  async clickEdit(slug: string) {
    await this.clearView();
    await this.clickEditRaw(slug);
  }

  optionEdit(slug: string) {
    return this.savedViewOption(slug).getByTestId("btn-edit-selection");
  }

  async saveViewInputs({ name, description, color, newColor }: SaveViewParams) {
    await this.nameInput().fill(name);
    await this.descriptionInput().fill(description);
    await this.clickColor(color);
    await this.pickColor(newColor);
  }

  async waitUntilModalHidden() {
    await this.eventUtils.untilAbsent(DIALOG);
  }

  /** Create a view; the app selects it once its list has refetched */
  async saveView(view: SaveViewParams) {
    await this.openCreateModal();
    await this.saveViewInputs(view);
    await this.eventUtils.after("page-change", () => this.saveButton().click());
    await this.waitUntilModalHidden();
  }

  async deleteView(name: string) {
    await this.savedViewOption(name).hover();
    await this.optionEdit(name).click();
    await this.eventUtils.untilPresent(DIALOG);
    await this.clickDeleteBtn();
  }

  async deleteViewClick() {
    await this.clickDeleteBtn();
  }

  /**
   * Rename a view; the app selects it under its new slug once its list has
   * refetched
   */
  async editView(
    name: string,
    description: string,
    color: Color,
    newColor: Color,
  ) {
    await this.nameInput().fill(name);
    await this.descriptionInput().fill(description);
    await this.clickColor(color);
    await this.pickColor(newColor);

    await this.eventUtils.after("page-change", () => this.saveButton().click());
    await this.waitUntilModalHidden();
  }

  /** Open the color dropdown */
  async clickColor(color: Color = defaultColor) {
    await this.colorInput(color).click();
    await this.eventUtils.untilPresent(COLOR_LIST);
  }

  /** Pick a color from the open dropdown, resolving once its menu is gone */
  async pickColor(color: Color) {
    await this.colorOption(color).click();
    await this.eventUtils.untilAbsent(COLOR_LIST);
  }

  /** Close the saved view list; an edit opened from it leaves it open */
  async closeSelect() {
    if ((await this.page.locator(SELECTION_LIST).count()) === 0) return;
    await this.page.keyboard.press("Escape");
    await this.eventUtils.untilAbsent(SELECTION_LIST);
  }

  async clearView() {
    await this.closeSelect();
    if (await this.canClearView()) {
      await this.eventUtils.after("page-change", () =>
        this.clearViewBtn.click(),
      );
    }
  }

  async clickCloseModal() {
    await this.closeModalBtn.click();
    await this.waitUntilModalHidden();
  }

  canClearView() {
    return this.clearViewBtn.isVisible();
  }

  /** Open the saved view list, unless it already is */
  async openSelect() {
    if ((await this.page.locator(SELECTION_LIST).count()) > 0) return;
    await this.selector.click();
    await this.eventUtils.untilPresent(SELECTION_LIST);
  }

  async openCreateModal(
    { isSelectAlreadyOpen }: { isSelectAlreadyOpen?: boolean } = {
      isSelectAlreadyOpen: false,
    },
  ) {
    if (!isSelectAlreadyOpen) {
      await this.openSelect();
    }
    await this.saveNewViewBtn.click();
    await this.eventUtils.untilPresent(DIALOG);
  }

  async savedViewCount(name: string) {
    return await this.locator.getByRole("button", { name }).count();
  }

  savedViewOption(slug: string) {
    return this.page
      .getByTestId("saved-views-selection-view")
      .getByTestId(`saved-views-${slug}-selection-option`);
  }

  async savedViewOptionCount(slug: string) {
    return await this.savedViewOption(slug).count();
  }

  nameInput() {
    return this.dialogLocator.getByTestId("saved-views-input-name");
  }

  descriptionInput() {
    return this.dialogLocator.getByTestId("saved-views-input-description");
  }

  colorInputContainer() {
    return this.dialogLocator.getByTestId(
      "saved-views-input-color-selection-selection",
    );
  }

  colorInput(c: Color = defaultColor) {
    return this.colorInputContainer().getByText(c);
  }

  colorOption(c: Color = "Purple") {
    return this.colorListContainer().getByRole("option", {
      name: c,
      exact: true,
    });
  }

  saveButton() {
    return this.dialogLocator.getByTestId("saved-views-btn-save");
  }

  cancelButton() {
    return this.dialogLocator.getByRole("button", {
      name: "Cancel",
      exact: true,
    });
  }

  colorListContainer() {
    return this.page
      .getByTestId("saved-views-input-color-selection-selection-view")
      .filter({ hasText: defaultColor });
  }

  nameError() {
    return this.dialogLocator.getByText("Name already exists");
  }

  searchInput() {
    return this.page
      .getByTestId("saved-views-selection-search-container")
      .getByTestId("saved-views-selection-search-input");
  }

  deleteBtn() {
    return this.dialogLocator.getByRole("button", { name: "Delete" }).first();
  }

  /** Delete the open view; its list refetches after the dialog closes */
  async clickDeleteBtn() {
    await this.eventUtils.after("saved-views-listed", () =>
      this.deleteBtn().click(),
    );
    await this.waitUntilModalHidden();
  }
}

class SavedViewAsserter {
  constructor(private readonly svp: SavedViewsPom) {}

  async verifyNameIsEmpty() {
    expect(await this.svp.nameInput().inputValue()).toBe("");
  }

  async verifyDescriptionIsEmpty() {
    expect(await this.svp.descriptionInput().inputValue()).toBe("");
  }

  async verifyDefaultColor(color: Color = defaultColor) {
    expect(await this.svp.colorInput(color).isVisible()).toBe(true);
  }

  async verifyInputIsDefault() {
    await this.verifyNameIsEmpty();
    await this.verifyDescriptionIsEmpty();
    await this.verifyDefaultColor();
  }

  async verifySaveBtnIsDisabled() {
    expect(await this.svp.saveButton().isDisabled()).toBe(true);
  }

  async verifySaveBtnIsEnabled() {
    expect(await this.svp.saveButton().isEnabled()).toBe(true);
  }

  async verifyAllInputClear() {
    await this.verifyInputIsDefault();
  }

  async verifyCancelBtnClearsAll() {
    await this.svp.cancelButton().click();
    await this.svp.waitUntilModalHidden();

    await this.svp.openCreateModal();
    await this.verifyAllInputClear();
  }

  async verifySavedView(slug: string = "test") {
    expect(this.svp.page.url()).toMatch(new RegExp(`view=${slug}`));
  }

  async verifyUnsavedView(name: string = "test") {
    expect(this.svp.page.url()).not.toMatch(new RegExp(`view=${name}`));
    expect(await this.svp.selector.isVisible()).toBe(true);
  }

  async verifyModalClosed() {
    expect(await this.svp.dialogLocator.count()).toBe(0);
  }

  async verifyDefaultColors(colorList: string[]) {
    const colorListBox = this.svp.colorListContainer();
    for (const color of colorList) {
      expect(
        await colorListBox
          .getByRole("option", { name: color })
          .first()
          .isVisible(),
      ).toBe(true);
    }
  }

  async verifyColorNotExists(color: string = "white") {
    expect(await this.svp.colorOption(color as Color).count()).toBe(0);
  }

  async verifySelectionHasNewOption(name: string = "test") {
    await this.svp.clearView();
    await this.svp.openSelect();
    expect(await this.svp.savedViewOption(name).isVisible()).toBe(true);
  }

  async verifySaveViewFails() {
    expect(await this.svp.saveButton().isDisabled()).toBe(true);
    expect(await this.svp.nameError().isVisible()).toBe(true);
    await this.svp.clickCloseModal();
  }

  async verifyModalTitle(name: string) {
    expect(
      await this.svp.dialogLocator.getByRole("heading", { name }).isVisible(),
    ).toBe(true);
  }

  async verifySearchExists() {
    expect(await this.svp.searchInput().isVisible()).toBe(true);
  }

  async verifySearch(
    term: string,
    expectedResult: string[],
    excluded: string[],
  ) {
    // the list filters once the search input's debounce fires
    await this.svp.eventUtils.after(
      "saved-views-listed",
      () => this.svp.searchInput().fill(term),
      (e) => (e.detail as { search: string }).search === term.toLowerCase(),
    );

    for (const slug of expectedResult) {
      expect(await this.svp.savedViewOption(slug).isVisible()).toBe(true);
    }

    for (const slug of excluded) {
      expect(await this.svp.savedViewOption(slug).count()).toBe(0);
    }
  }

  async verifyDeleteBtnHidden() {
    expect(await this.svp.deleteBtn().isVisible()).toBe(false);
  }

  async verifyDeleteBtn() {
    expect(await this.svp.deleteBtn().isVisible()).toBe(true);
  }

  async verifyViewOption(name: string = "test") {
    expect(await this.svp.savedViewOption(name).isVisible()).toBe(true);
  }

  async verifyViewOptionHidden(name: string = "test") {
    expect(await this.svp.savedViewOption(name).count()).toBe(0);
  }

  async verifyInput({
    name,
    description,
    color,
  }: {
    name: string;
    description: string;
    color: Color;
  }) {
    expect(await this.svp.nameInput().inputValue()).toBe(name);
    expect(await this.svp.descriptionInput().inputValue()).toBe(description);
    expect(await this.svp.colorInput(color).isVisible()).toBe(true);
  }

  async verifyInputUpdated(view: {
    name: string;
    description: string;
    color: Color;
  }) {
    await this.verifyInput(view);
  }
}
