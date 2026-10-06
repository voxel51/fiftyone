import { expect, Locator, Page } from "src/oss/fixtures";
import { EventUtils } from "src/shared/event-utils";

/** The App's color choices, in the order its color dropdown lists them */
export const COLORS = [
  "Gray",
  "Blue",
  "Cyan",
  "Green",
  "Yellow",
  "Orange",
  "Red",
  "Pink",
  "Purple",
] as const;

export type Color = (typeof COLORS)[number];

export type SaveViewParams = {
  name: string;
  description: string;
  /** The color picked in the dialog */
  color: Color;
  slug: string;
};

/** A new view's color before one is picked */
export const DEFAULT_COLOR: Color = "Gray";

/** The entry the view list shows while no saved view is loaded */
export const UNSAVED_VIEW = { label: "Unsaved view", slug: "unsaved-view" };

const VIEW_LIST = "saved-views";
const COLOR_LIST = "saved-views-input-color-selection";
const OPTION_PREFIX = "saved-views-";
const OPTION_SUFFIX = "-selection-option";

const SELECTION_EVENT = "e2e:components:selection";
const OPTION_EVENT = "e2e:components:selection-option";
const DIALOG_EVENT = "e2e:saved-views:dialog";
const LISTED_EVENT = "e2e:saved-views:listed";
const PAGE_CHANGE_EVENT = "e2e:app:page-change";

type DialogDetail = { open: boolean; name: string; description: string };

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
    return this.locator.getByTestId("saved-views-btn-selection-clear");
  }

  get closeModalBtn() {
    return this.dialogLocator.getByTestId("saved-views-btn-close");
  }

  get saveNewViewBtn() {
    return this.page.getByTestId("saved-views-create-new");
  }

  get viewList() {
    return this.page.getByTestId("saved-views-selection-view");
  }

  /** Run `action`, resolving once the dropdown `list` has opened or closed */
  private afterList<T>(list: string, open: boolean, action: () => Promise<T>) {
    return this.eventUtils.after(SELECTION_EVENT, action, (e) => {
      const detail = e.detail as { id: string; open: boolean };
      return detail.id === list && detail.open === open;
    });
  }

  /** Run `action`, resolving on the dialog state it changes */
  private afterDialog<T>(
    action: () => Promise<T>,
    predicate: (detail: DialogDetail) => boolean = () => true,
  ) {
    return this.eventUtils.after(DIALOG_EVENT, action, (e) =>
      predicate(e.detail as DialogDetail),
    );
  }

  /** Save the dialog's view; the app selects it once its list has refetched */
  private async save() {
    await this.afterDialog(
      () =>
        this.eventUtils.after(PAGE_CHANGE_EVENT, () =>
          this.saveButton().click(),
        ),
      (detail) => !detail.open,
    );
  }

  /** Open the saved view list */
  async openSelect() {
    await this.afterList(VIEW_LIST, true, () => this.selector.click());
  }

  /** Close the saved view list; an edit opened from it leaves it open */
  async closeSelect() {
    // pressed on the list: a dialog that deleted or renamed the option it
    // was opened from can return focus to the page instead of the list
    await this.afterList(VIEW_LIST, false, () => this.viewList.press("Escape"));
  }

  /** Open the create dialog from the open view list, which closes the list */
  async openCreateModal() {
    await this.eventUtils.afterAll(
      [
        {
          events: DIALOG_EVENT,
          predicate: (e) => (e.detail as DialogDetail).open,
        },
        {
          events: SELECTION_EVENT,
          predicate: (e) => {
            const detail = e.detail as { id: string; open: boolean };
            return detail.id === VIEW_LIST && !detail.open;
          },
        },
      ],
      () => this.saveNewViewBtn.click(),
    );
  }

  /** Open a listed view's edit dialog, resolving once it shows the view */
  async clickOptionEdit(slug: string) {
    // the edit button renders once the option's hover state commits
    await this.eventUtils.after(
      OPTION_EVENT,
      () => this.savedViewOption(slug).hover(),
      (e) => {
        const detail = e.detail as { slug: string; hovered: boolean };
        return detail.slug === slug && detail.hovered;
      },
    );
    // the dialog fills its inputs from the view in an effect after it mounts
    await this.afterDialog(
      () => this.optionEdit(slug).click(),
      (detail) => detail.open && detail.name !== "",
    );
  }

  optionEdit(slug: string) {
    return this.savedViewOption(slug).getByTestId("btn-edit-selection");
  }

  async fillName(name: string) {
    await this.afterDialog(() => this.nameInput().fill(name));
  }

  async fillDescription(description: string) {
    await this.afterDialog(() => this.descriptionInput().fill(description));
  }

  async fillInputs({ name, description, color }: SaveViewParams) {
    await this.fillName(name);
    await this.fillDescription(description);
    await this.clickColor();
    await this.pickColor(color);
  }

  /** Create a view from a closed view list; the list stays closed */
  async saveView(view: SaveViewParams) {
    await this.openSelect();
    await this.openCreateModal();
    await this.fillInputs(view);
    await this.save();
  }

  /** Save the open edit dialog as `view`; the app selects it once saved */
  async editView(view: SaveViewParams) {
    await this.fillInputs(view);
    await this.save();
  }

  /** Open the color dropdown */
  async clickColor() {
    await this.afterList(COLOR_LIST, true, () =>
      this.colorInputContainer().click(),
    );
  }

  /** Pick a color from the open dropdown, resolving once its menu is gone */
  async pickColor(color: Color) {
    await this.afterList(COLOR_LIST, false, () =>
      this.colorOption(color).click(),
    );
  }

  /** Clear the loaded view; the view list must be closed */
  async clearView() {
    await this.eventUtils.after(PAGE_CHANGE_EVENT, () =>
      this.clearViewBtn.click(),
    );
  }

  async clickCloseModal() {
    await this.afterDialog(
      () => this.closeModalBtn.click(),
      (detail) => !detail.open,
    );
  }

  async clickCancel() {
    await this.afterDialog(
      () => this.cancelButton().click(),
      (detail) => !detail.open,
    );
  }

  /** Delete the open view; its list refetches after the dialog closes */
  async clickDeleteBtn() {
    await this.afterDialog(
      () => this.eventUtils.after(LISTED_EVENT, () => this.deleteBtn().click()),
      (detail) => !detail.open,
    );
  }

  savedViewOption(slug: string) {
    return this.viewList.getByTestId(`${OPTION_PREFIX}${slug}${OPTION_SUFFIX}`);
  }

  /** Slugs of the saved views in the open list, without the unsaved entry */
  async listedSlugs() {
    const ids = await this.viewList
      .locator(`[data-cy^="${OPTION_PREFIX}"][data-cy$="${OPTION_SUFFIX}"]`)
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-cy") ?? ""));
    return ids
      .map((id) => id.slice(OPTION_PREFIX.length, -OPTION_SUFFIX.length))
      .filter((slug) => slug !== UNSAVED_VIEW.slug);
  }

  /** The label the view selector shows */
  async selectedLabel() {
    return this.selector.getByRole("combobox").textContent();
  }

  /** The `view` URL parameter, or null without one */
  viewParam() {
    return new URL(this.page.url()).searchParams.get("view");
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

  /** The color the dialog's color selector shows */
  async selectedColor() {
    return this.colorInputContainer().getByRole("combobox").textContent();
  }

  colorListContainer() {
    return this.page.getByTestId(
      "saved-views-input-color-selection-selection-view",
    );
  }

  colorOption(color: Color) {
    return this.colorListContainer().getByRole("option", {
      name: color,
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

  nameError() {
    return this.dialogLocator.getByText("Name already exists", {
      exact: true,
    });
  }

  searchInput() {
    return this.page
      .getByTestId("saved-views-selection-search-container")
      .getByTestId("saved-views-selection-search-input");
  }

  deleteBtn() {
    return this.dialogLocator.getByTestId("saved-views-btn-delete");
  }

  /** Search the open view list, resolving once the list has filtered */
  async search(term: string) {
    // the list filters once the search input's debounce fires
    await this.eventUtils.after(
      LISTED_EVENT,
      () => this.searchInput().fill(term),
      (e) => (e.detail as { search: string }).search === term.toLowerCase(),
    );
  }
}

class SavedViewAsserter {
  constructor(private readonly svp: SavedViewsPom) {}

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
    expect(await this.svp.selectedColor()).toBe(color);
  }

  async verifyInputIsDefault() {
    await this.verifyInput({ name: "", description: "", color: DEFAULT_COLOR });
  }

  async verifySaveBtnIsDisabled() {
    expect(await this.svp.saveButton().isDisabled()).toBe(true);
  }

  async verifySaveBtnIsEnabled() {
    expect(await this.svp.saveButton().isEnabled()).toBe(true);
  }

  async verifyCancelBtnClearsAll() {
    await this.svp.clickCancel();

    await this.svp.openSelect();
    await this.svp.openCreateModal();
    await this.verifyInputIsDefault();
  }

  /** The URL and the selector both show `view` */
  async verifySavedView(view: { name: string; slug: string }) {
    expect(this.svp.viewParam()).toBe(view.slug);
    expect(await this.svp.selectedLabel()).toBe(view.name);
  }

  /** Neither the URL nor the selector shows a saved view */
  async verifyUnsavedView() {
    expect(this.svp.viewParam()).toBeNull();
    expect(await this.svp.selectedLabel()).toBe(UNSAVED_VIEW.label);
  }

  async verifyModalClosed() {
    expect(await this.svp.dialogLocator.count()).toBe(0);
  }

  async verifyColorOptions() {
    expect(
      await this.svp.colorListContainer().getByRole("option").allTextContents(),
    ).toEqual([...COLORS]);
  }

  async verifyListedSlugs(slugs: string[]) {
    expect(await this.svp.listedSlugs()).toEqual(slugs);
  }

  async verifySaveViewFails() {
    expect(await this.svp.saveButton().isDisabled()).toBe(true);
    expect(await this.svp.nameError().count()).toBe(1);
  }

  async verifySearchExists() {
    expect(await this.svp.searchInput().isVisible()).toBe(true);
  }

  async verifySearch(term: string, slugs: string[]) {
    await this.svp.search(term);
    await this.verifyListedSlugs(slugs);
  }

  async verifyDeleteBtnHidden() {
    expect(await this.svp.deleteBtn().count()).toBe(0);
  }

  async verifyDeleteBtn() {
    expect(await this.svp.deleteBtn().count()).toBe(1);
  }
}
