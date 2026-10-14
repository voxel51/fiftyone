import { expect, Page } from "src/oss/fixtures";
import { EventUtils } from "src/shared/event-utils";

const LISTED_EVENT = "e2e:saved-queries:listed";
const PAGE_CHANGE_EVENT = "e2e:app:page-change";

type ListedDetail = { search: string };

/** The view bar's Saved queries menu: save, load, edit, and delete queries */
export class SavedQueriesPom {
  readonly assert: SavedQueriesAsserter;

  constructor(
    readonly page: Page,
    readonly eventUtils: EventUtils,
  ) {
    this.assert = new SavedQueriesAsserter(this);
  }

  get toggle() {
    return this.page.getByTestId("saved-queries-toggle");
  }

  get loadedName() {
    return this.page.getByTestId("saved-queries-loaded-name");
  }

  get panel() {
    return this.page.getByTestId("saved-queries-panel");
  }

  get saveForm() {
    return this.page.getByTestId("saved-queries-save-form");
  }

  /** Stands in for the save form while the view has nothing to save */
  get nothingToSave() {
    return this.page.getByTestId("saved-queries-nothing");
  }

  get nameInput() {
    return this.page.getByTestId("saved-queries-name-input");
  }

  get descriptionInput() {
    return this.page.getByTestId("saved-queries-description-input");
  }

  get saveButton() {
    return this.page.getByTestId("saved-queries-save");
  }

  get nameError() {
    return this.page.getByTestId("saved-queries-name-error");
  }

  get definition() {
    return this.page.getByTestId("saved-queries-definition");
  }

  get includeSelection() {
    return this.page.getByTestId("saved-queries-include-selection");
  }

  get scopeNotice() {
    return this.page.getByTestId("saved-queries-scope");
  }

  get searchInput() {
    return this.page.getByTestId("saved-queries-search");
  }

  get emptyState() {
    return this.page.getByTestId("saved-queries-empty");
  }

  getRow(slug: string) {
    return this.page.getByTestId(`saved-query-${slug}`);
  }

  getLoadButton(slug: string) {
    return this.page.getByTestId(`saved-query-${slug}-load`);
  }

  /** Open the menu; its list renders the dataset's saved queries */
  async open() {
    await this.eventUtils.after(LISTED_EVENT, () => this.toggle.click());
  }

  /**
   * Save the working view under `name` from the open menu, with a palette
   * `color` id picked from the name's ribbon. The new query loads, and the
   * list shows it once refetched.
   */
  async save(
    name: string,
    { description, color }: { description?: string; color?: string } = {},
  ) {
    await this.nameInput.fill(name);
    if (color !== undefined) {
      await this.page.getByTestId("saved-queries-color").click();
      await this.page.getByTestId(`saved-query-color-${color}`).click();
    }
    if (description !== undefined)
      await this.descriptionInput.fill(description);
    await this.eventUtils.afterAll(
      [
        { events: PAGE_CHANGE_EVENT },
        {
          events: LISTED_EVENT,
          predicate: (e) => (e.detail as ListedDetail).search === "",
        },
      ],
      () => this.saveButton.click(),
    );
  }

  /** Load a listed query from the open menu, which closes it */
  async load(slug: string) {
    await this.eventUtils.after(PAGE_CHANGE_EVENT, () =>
      this.getLoadButton(slug).click(),
    );
  }

  /** Open a listed query's editor from the open menu */
  async openEditor(slug: string) {
    await this.getRow(slug).hover();
    await this.page.getByTestId(`saved-query-${slug}-edit`).click();
  }

  /**
   * Change the open editor's fields and save them; the list refetches. A
   * loaded query that is renamed also follows its new slug in the URL.
   */
  async edit(
    edits: { name?: string; description?: string; color?: string },
    { loaded = false } = {},
  ) {
    if (edits.name !== undefined)
      await this.page.getByTestId("saved-query-edit-name").fill(edits.name);
    if (edits.description !== undefined)
      await this.page
        .getByTestId("saved-query-edit-description")
        .fill(edits.description);
    if (edits.color !== undefined)
      await this.page.getByTestId(`saved-query-color-${edits.color}`).click();
    const save = () => this.page.getByTestId("saved-query-edit-save").click();
    await this.eventUtils.afterAll(
      loaded
        ? [{ events: LISTED_EVENT }, { events: PAGE_CHANGE_EVENT }]
        : [{ events: LISTED_EVENT }],
      save,
    );
  }

  /** Delete a listed query after confirming; the list refetches without it */
  async delete(slug: string, { loaded = false } = {}) {
    await this.getRow(slug).hover();
    await this.page.getByTestId(`saved-query-${slug}-delete`).click();
    const confirm = () =>
      this.page.getByTestId(`saved-query-${slug}-confirm-delete`).click();
    await this.eventUtils.afterAll(
      loaded
        ? [{ events: LISTED_EVENT }, { events: PAGE_CHANGE_EVENT }]
        : [{ events: LISTED_EVENT }],
      confirm,
    );
  }

  /** Search the open list, resolving once it has filtered */
  async search(term: string) {
    await this.eventUtils.after(
      LISTED_EVENT,
      () => this.searchInput.fill(term),
      (e) => (e.detail as ListedDetail).search === term.trim().toLowerCase(),
    );
  }

  /** Clear the working view from the view bar, unloading any query */
  async clearView() {
    await this.eventUtils.after(PAGE_CHANGE_EVENT, () =>
      this.page.getByTestId("view-bar-clear-view").click(),
    );
  }

  /** Slugs of the queries the open list shows, in order */
  async listedSlugs() {
    const ids = await this.panel
      .locator('[data-cy^="saved-query-"][data-cy$="-load"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-cy") ?? ""));
    return ids.map((id) => id.slice("saved-query-".length, -"-load".length));
  }

  /** The `view` URL parameter, or null without one */
  viewParam() {
    return new URL(this.page.url()).searchParams.get("view");
  }
}

class SavedQueriesAsserter {
  constructor(private readonly sq: SavedQueriesPom) {}

  async listsSlugs(slugs: string[]) {
    expect(await this.sq.listedSlugs()).toEqual(slugs);
  }

  /** The URL and the view bar name `query` as the loaded query */
  async isLoaded(query: { name: string; slug: string }) {
    expect(this.sq.viewParam()).toBe(query.slug);
    expect(await this.sq.loadedName.textContent()).toBe(query.name);
  }

  /** Neither the URL nor the view bar names a loaded query */
  async isUnloaded() {
    expect(this.sq.viewParam()).toBeNull();
    expect(await this.sq.loadedName.count()).toBe(0);
  }

  /** The open list marks `slug` as the loaded query */
  async marksLoaded(slug: string) {
    expect(await this.sq.getRow(slug).getAttribute("data-loaded")).toBe("true");
  }

  /** The loaded query is already saved: the menu only lists queries */
  async offersNoSave() {
    expect(await this.sq.saveForm.count()).toBe(0);
  }

  /** The view is the bare dataset: the menu says there is nothing to save */
  async offersNothingToSave() {
    expect(await this.sq.saveForm.count()).toBe(0);
    await expect(this.sq.nothingToSave).toBeVisible();
  }

  async cannotSave() {
    expect(await this.sq.saveButton.isDisabled()).toBe(true);
  }

  async describesDefinition(text: string) {
    expect(await this.sq.definition.textContent()).toBe(text);
  }

  async rejectsName(error: string) {
    expect(await this.sq.nameError.textContent()).toBe(error);
    expect(await this.sq.saveButton.isDisabled()).toBe(true);
  }

  /** The save form explains how the open subset relates to a new query */
  async notesScope(text: string) {
    expect(await this.sq.scopeNotice.innerText()).toBe(text);
  }

  async showsEmptyList() {
    expect(await this.sq.emptyState.textContent()).toBe("No saved queries yet");
  }

  async rowReads(slug: string, text: string) {
    expect(await this.sq.getRow(slug).innerText()).toBe(text);
  }
}
