import { Locator, Page, expect } from "src/oss/fixtures";

/**
 * The view bar: a search row in the header, with the stage cards in a
 * portaled second row the stages toggle opens. The popover for the stage
 * being edited is its own POM — {@link StageEditorPom} — returned by
 * `addStage` and `editStage`.
 */
export class ViewBarPom {
  readonly page: Page;
  readonly locator: Locator;
  readonly assert: ViewBarAsserter;

  /** The stage editor popover. One per page, open for at most one stage. */
  readonly stageEditor: StageEditorPom;

  constructor(page: Page) {
    this.page = page;
    this.assert = new ViewBarAsserter(this);
    this.locator = this.page.getByTestId("view-bar");
    this.stageEditor = new StageEditorPom(page);
  }

  /** The stages row — portaled to the body, so found at the page level. */
  get stagesRow() {
    return this.page.getByTestId("view-bar-stages-row");
  }

  /** The search row's right-edge toggle that opens the stages row. */
  get stagesToggle() {
    return this.locator.getByTestId("view-bar-stages-toggle");
  }

  get viewStages() {
    return this.stagesRow.getByTestId("view-stage-container");
  }

  /** The similarity search field in the bar's first row (a voodo Combobox). */
  get searchInput() {
    return this.locator.getByRole("combobox", {
      name: "Search by natural language",
    });
  }

  /** The typeahead input an insert slot opens into. */
  get insertTypeahead() {
    return this.stagesRow.getByPlaceholder("Add stage…");
  }

  /** The previous-queries list under the search field (portaled). */
  get searchHistory() {
    // The list has no name of its own; while the stages row is folded it is
    // the only listbox on the page
    return this.page.getByRole("listbox");
  }

  /** Clears any draft query and drops focus from the search input. */
  async clearSearch() {
    await this.searchInput.press("Escape");
    await this.searchInput.blur();
  }

  /** Focuses the search input, which opens its history dropdown. */
  async openSearchHistory() {
    await this.searchInput.click();
  }

  /** The magnifying glass that opens the search settings popover. */
  get searchSettingsTrigger() {
    return this.locator.getByTestId("view-bar-search-settings-trigger");
  }

  /** The search settings popover (portaled). */
  get searchSettings() {
    return this.page.getByTestId("view-bar-search-settings");
  }

  /** Sets the search's match count through the magnifier's settings. */
  async setSearchMatches(k: number) {
    await this.searchSettingsTrigger.click();
    await this.searchSettings.getByTestId("search-settings-k").fill(String(k));
    await this.searchSettingsTrigger.click();
    await expect(this.searchSettings).toBeHidden();
  }

  /**
   * Makes the stages row visible. A bar holding stages opens it on its own;
   * an empty bar needs the toggle. The toggle's aria-expanded reflects the
   * open state synchronously, so this never races the row's portal mount.
   */
  async openStages() {
    const expanded = await this.stagesToggle.getAttribute("aria-expanded");
    if (expanded !== "true") {
      await this.stagesToggle.click();
    }
    await expect(this.stagesRow).toBeVisible();
  }

  /**
   * Makes the stages of a non-empty bar visible. Only bar-originated actions
   * open the row on their own (a quick search landing); a view applied from
   * outside stays folded behind the toggle, so this opens it when needed.
   */
  async expand() {
    await this.openStages();
    await expect(this.viewStages.first()).toBeVisible();
  }

  /** Appends a stage and returns its open editor. */
  async addStage(name: string) {
    await this.openStages();
    // An empty row pins its insert slot open — the typeahead input IS the
    // slot, so there is no "+" button to click. Focusing it opens the list.
    await this.stagesRow
      .getByLabel("Insert stage")
      .last()
      .or(this.insertTypeahead)
      .click();
    await this.page
      .getByRole("listbox")
      .getByRole("option", { name, exact: true })
      .click();
    await this.stageEditor.assert.isOpen();
    return this.stageEditor;
  }

  /** Reopens an already-applied stage's editor and returns it. */
  async editStage(index: number) {
    await this.viewStages.nth(index).getByLabel("Edit stage").click();
    await this.stageEditor.assert.isOpen();
    return this.stageEditor;
  }
}

/**
 * The editor popover for the stage being edited. Portaled to the body, so
 * not under the bar.
 *
 * Parameters must be filled in declaration order — the editor disables a
 * param until the required ones declared before it are satisfied, and
 * refuses to close while a required param is still empty.
 */
export class StageEditorPom {
  readonly page: Page;
  readonly locator: Locator;
  readonly assert: StageEditorAsserter;

  constructor(page: Page) {
    this.page = page;
    this.assert = new StageEditorAsserter(this);
    this.locator = page.getByTestId("view-stage-editor");
  }

  /** One parameter's control group. */
  param(name: string) {
    return this.locator.getByTestId(`view-stage-param-${name}`);
  }

  /** Types into a text, numeric, list or expression control. */
  async fill(param: string, value: string) {
    await this.param(param).getByRole("textbox").fill(value);
  }

  /** Commits the stage from a param's input — Enter finishes AND applies. */
  async commit(param: string) {
    await this.param(param).getByRole("textbox").press("Enter");
  }

  /** Picks an option in a param's picker, e.g. a field param's path. */
  async pick(param: string, option: string) {
    await this.param(param).click();
    await this.page
      .locator("[data-headlessui-portal]")
      .getByRole("option", { name: option, exact: true })
      .click();
  }

  async setToggle(param: string, checked: boolean) {
    const toggle = this.param(param).getByRole("checkbox");
    if ((await toggle.isChecked()) !== checked) {
      await toggle.click();
    }
  }

  /** Switches a param to one of its editors: `field`, `text`, `expr`, `json`. */
  async chooseEditor(param: string, label: string) {
    await this.param(param)
      .getByRole("tab", { name: label, exact: true })
      .click();
  }
}

class ViewBarAsserter {
  constructor(private readonly viewBar: ViewBarPom) {}

  async isVisible() {
    await expect(this.viewBar.locator).toBeVisible();
  }

  async hasViewStage(text: string) {
    await expect(this.viewBar.viewStages).toContainText(text);
  }

  async stageCount(n: number) {
    await expect(this.viewBar.viewStages).toHaveCount(n);
  }

  /**
   * The stage typeahead holds the keyboard with its stage list dropped —
   * the state an opened empty stages row lands in.
   */
  async stageTypeaheadIsReady() {
    await expect(this.viewBar.insertTypeahead).toBeFocused();
    await expect(
      this.viewBar.page.getByRole("listbox").getByRole("option").first(),
    ).toBeVisible();
  }

  /** The history dropdown offers `query` as a previous search. */
  async searchHistoryOffers(query: string) {
    await expect(
      this.viewBar.searchHistory.getByRole("option", {
        name: query,
        exact: true,
      }),
    ).toBeVisible();
  }
}

class StageEditorAsserter {
  constructor(private readonly editor: StageEditorPom) {}

  async isOpen() {
    await expect(this.editor.locator).toBeVisible();
  }

  async isClosed() {
    await expect(this.editor.locator).toBeHidden();
  }

  /** The value a control is showing, whatever kind of control it is. */
  async paramText(param: string, value: string) {
    await expect(this.editor.param(param).getByRole("textbox")).toHaveValue(
      value,
    );
  }

  async paramToggle(param: string, checked: boolean) {
    const toggle = this.editor.param(param).getByRole("checkbox");
    if (checked) {
      await expect(toggle).toBeChecked();
    } else {
      await expect(toggle).not.toBeChecked();
    }
  }

  /** A field param shows its path in the picker rather than anywhere else. */
  async paramField(param: string, path: string) {
    await expect(this.editor.param(param)).toContainText(path);
  }

  /** Which editor a hydrated param opened in. */
  async activeEditor(param: string, label: string) {
    await expect(
      this.editor.param(param).getByRole("tab", { name: label, exact: true }),
    ).toHaveAttribute("aria-selected", "true");
  }
}
