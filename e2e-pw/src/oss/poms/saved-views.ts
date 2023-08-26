import { expect, Locator, Page } from "src/oss/fixtures";

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

export class SavedViewsPom {
  readonly page: Page;
  readonly assert: SavedViewAsserter;

  readonly locator: Locator;
  readonly dialogLocator: Locator;

  constructor(page: Page) {
    this.page = page;
    this.assert = new SavedViewAsserter(this);

    this.locator = page.getByTestId("saved-views-selection-container");
    this.dialogLocator = page.getByTestId("saved-views-modal-body-container");
  }

  async clickEditRaw(slug: string) {
    await this.locator.click();
    await this.clickOptionEdit(slug);
  }

  async clickOptionEdit(slug: string) {
    await this.savedViewOption(slug).hover();
    await this.optionEdit(slug).click();
  }

  async clickEdit(slug: string) {
    await this.clearView();
    await this.clickEditRaw(slug);
  }

  optionEdit(slug: string) {
    return this.savedViewOption(slug).getByTestId("btn-edit-selection");
  }

  async saveViewInputs({ name, description, color, newColor }) {
    await this.nameInput().type(name);
    await this.descriptionInput().type(description);
    await this.colorInput(color).click();
    await this.colorOption(newColor).click();
  }

  async saveView(view) {
    await this.openCreateModal();
    await this.saveViewInputs(view);
    await this.saveButton().click();
  }

  async saveView2() {
    await this.saveButton().click();
  }

  async deleteView(name: string) {
    await this.savedViewOption(name).hover();
    await this.optionEdit(name).click();
    await this.clickDeleteBtn();
  }

  async deleteViewClick() {
    await this.clickDeleteBtn();
  }

  async editView(
    name: string,
    description: string,
    color: Color,
    newColor: Color
  ) {
    await this.nameInput().clear();
    await this.nameInput().type(name);
    await this.descriptionInput().clear();
    await this.descriptionInput().type(description);
    await this.colorInput(color).click();
    await this.colorOption(newColor).click();

    await this.saveButton().click();
  }

  async clickColor(color: Color = "Gray") {
    await this.colorInput(color).click();
  }

  async clearView() {
    await this.clearViewBtn().click();
  }

  async clickCloseModal() {
    await this.closeModalBtn().click();
  }

  selectorContainer() {
    return this.locator.getByTestId("saved-views-selection-container");
  }

  selector() {
    return this.locator.getByTestId("saved-views-selection");
  }

  clearViewBtn() {
    return this.selector()
      .getByTestId("saved-views-btn-selection-clear")
      .first();
  }

  closeModalBtn() {
    return this.dialogLocator.getByTestId("saved-views-btn-close");
  }

  saveNewViewBtn() {
    return this.locator.getByTestId("saved-views-create-new");
  }

  canClearView() {
    return this.clearViewBtn().isVisible();
  }

  async openSelect() {
    await this.selector().click();
  }

  async openCreateModal() {
    await this.openSelect();
    await this.saveNewViewBtn().click();
  }

  async savedViewCount(name: string) {
    return await this.locator.getByRole("button", { name }).count();
  }

  savedViewOption(slug: string) {
    return this.locator.getByTestId(`saved-views-${slug}-selection-option`);
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

  colorInput(c: Color = "Gray") {
    return this.dialogLocator.getByRole("button", { name: c });
  }

  colorOption(c: Color = "Purple") {
    return this.dialogLocator.getByRole("option", { name: c });
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
    return this.dialogLocator.getByRole("listbox");
  }

  nameError() {
    return this.dialogLocator.getByText("Name already exists");
  }

  searchInput() {
    return this.locator
      .getByTestId("saved-views-selection-search-container")
      .getByTestId("saved-views-selection-search-input");
  }

  deleteBtn() {
    return this.dialogLocator.getByRole("button", { name: "Delete" }).first();
  }

  async clickDeleteBtn() {
    return this.deleteBtn().click();
  }
}

class SavedViewAsserter {
  constructor(private readonly svp: SavedViewsPom) {}

  async verifyNameIsEmpty() {
    await this.svp.nameInput().waitFor({ state: "visible" });
    const name = this.svp.nameInput();
    await expect(name).toBeVisible();
    await expect(name).toBeEmpty();
  }

  async verifyDescriptionIsEmpty() {
    const desc = this.svp.descriptionInput();
    await expect(desc).toBeEmpty();
  }

  async verifyDefaultColor(color: Color = "Gray") {
    await expect(this.svp.colorInput(color).first()).toBeInViewport();
  }

  async verifyInputIsDefault() {
    await this.verifyNameIsEmpty();
    await this.verifyDescriptionIsEmpty();
    await this.verifyDefaultColor();
  }

  async verifySaveBtnIsDisabled() {
    const saveBtn = this.svp.saveButton();
    await expect(saveBtn).toBeDisabled();
  }

  async verifySaveBtnIsEnabled() {
    const saveBtn = this.svp.saveButton();
    await expect(saveBtn).toBeEnabled();
  }

  async verifyAllInputClear() {
    await expect(this.svp.nameInput()).toBeEmpty();
    await expect(this.svp.descriptionInput()).toBeEmpty();
    await expect(this.svp.colorInput("Gray")).toBeVisible();
  }

  async verifyCancelBtnClearsAll() {
    const cancelBtn = this.svp.cancelButton();
    await cancelBtn.click();

    await this.verifyAllInputClear();
  }

  async verifySavedView(slug: string = "test") {
    await expect(this.svp.page).toHaveURL(new RegExp(`view=${slug}`));
  }

  async verifyUnsavedView(name: string = "test") {
    await expect(this.svp.page).not.toHaveURL(new RegExp(`view=${name}`));
    await expect(this.svp.selector()).toBeVisible();
  }

  async verifyModalClosed() {
    await expect(this.svp.closeModalBtn()).toBeHidden();
  }

  async verifyDefaultColors(colorList: string[]) {
    const colorListBox = this.svp.colorListContainer();
    await expect(colorListBox).toBeVisible();
    // verify default
    await expect(
      colorListBox.getByRole("option", { name: "Gray" })
    ).toBeInViewport();

    colorList.forEach(async (color: string) => {
      await expect(
        colorListBox.getByRole("option", { name: color })
      ).toBeVisible();
    });
  }

  async verifyColorNotExists(color: string = "white") {
    await expect(this.svp.colorOption(color as Color)).toBeHidden();
  }

  async verifySelectionHasNewOption(name: string = "test") {
    await this.svp.clearView();
    await this.svp.selector().click();
    await expect(this.svp.savedViewOption(name)).toBeVisible();
  }

  async verifySaveViewFails() {
    await expect(this.svp.saveButton()).toBeDisabled();
    expect(this.svp.nameError()).toBeDefined();
    await this.svp.clickCloseModal();
  }

  async verifyModalTitle(name: string) {
    await expect(
      this.svp.dialogLocator.getByRole("heading", {
        name,
      })
    ).toBeVisible();
  }

  async verifySearchExists() {
    await expect(this.svp.searchInput()).toBeVisible();
  }

  async verifySearch(
    term: string,
    expectedResult: string[],
    excluded: string[]
  ) {
    await this.svp.searchInput().clear();
    await this.svp.searchInput().type(term);

    if (expectedResult.length) {
      await this.svp
        .savedViewOption(expectedResult[0])
        .waitFor({ state: "visible", timeout: 1000 });

      expectedResult.forEach(async (slug: string) => {
        await expect(this.svp.savedViewOption(slug)).toBeVisible();
      });
    }

    if (excluded.length) {
      await this.svp
        .savedViewOption(excluded[1])
        .waitFor({ state: "hidden", timeout: 1000 });

      excluded.forEach(async (slug: string) => {
        await expect(this.svp.savedViewOption(slug).first()).toBeHidden();
      });
    }
  }

  async verifyDeleteBtnHidden() {
    await expect(this.svp.deleteBtn()).toBeHidden();
  }

  async verifyDeleteBtn() {
    await expect(this.svp.deleteBtn()).toBeVisible();
  }

  async verifyViewOption(name: string = "test") {
    await expect(this.svp.savedViewOption(name)).toBeVisible();
  }

  async verifyViewOptionHidden(name: string = "test") {
    await expect(this.svp.savedViewOption(name)).toBeHidden();
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
    await expect(this.svp.nameInput()).toHaveValue(name);
    await expect(this.svp.descriptionInput()).toHaveValue(description);
    await expect(this.svp.colorInput(color)).toBeVisible();
  }

  async verifyInputUpdated({
    name,
    description,
    color,
  }: {
    name: string;
    description: string;
    color: Color;
  }) {
    await expect(this.svp.nameInput()).toHaveValue(name);
    await expect(this.svp.descriptionInput()).toHaveValue(description);
    await expect(this.svp.colorInput(color)).toBeVisible();
  }
}
