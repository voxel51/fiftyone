import { Locator, Page, expect } from "src/oss/fixtures";
import type { EventUtils } from "src/shared/event-utils";

/** The bar moves the keyboard a frame after an edit, then dispatches this */
const FOCUS_PLACED = "e2e:view-bar:focus-placed";
const STAGE_EDITOR = "e2e:view-bar:stage-editor";

/** Run `action`, resolving once a stage editor has opened or closed */
const afterStageEditor = <T>(
  eventUtils: EventUtils,
  open: boolean,
  action: () => Promise<T>,
) =>
  eventUtils.after(
    STAGE_EDITOR,
    action,
    (e) => (e.detail as { open: boolean }).open === open,
  );

/** Whether `locator` holds the keyboard, read once */
const isFocused = (locator: Locator) =>
  locator.evaluate((element) => element === document.activeElement);

/**
 * The view bar: a search row in the header, with the stage cards in a
 * second row the stages toggle opens under it. The popover for the stage
 * being edited is its own POM — {@link StageEditorPom} — returned by
 * `addStage` and `editStage`.
 */
export class ViewBarPom {
  readonly page: Page;
  readonly locator: Locator;
  readonly assert: ViewBarAsserter;

  /** The stage editor popover. One per page, open for at most one stage. */
  readonly stageEditor: StageEditorPom;

  constructor(
    page: Page,
    readonly eventUtils: EventUtils,
  ) {
    this.page = page;
    this.assert = new ViewBarAsserter(this);
    this.locator = this.page.getByTestId("view-bar");
    this.stageEditor = new StageEditorPom(page, eventUtils);
  }

  /** The stages row: the bar's second row, present while open. */
  get stagesRow() {
    return this.locator.getByTestId("view-bar-stages-row");
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
      name: "Search or ask in natural language",
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
    await this.eventUtils.after(
      "e2e:view-bar:search-settings",
      () => this.searchSettingsTrigger.click(),
      (e) => !(e.detail as { open: boolean }).open,
    );
  }

  /**
   * Makes the stages row visible. A bar holding stages opens it on its own;
   * an empty bar needs the toggle, which also lands the keyboard in the row
   * a frame later. The toggle's aria-expanded reflects the open state
   * synchronously and the row mounts in that commit, so this never races it.
   */
  async openStages() {
    const expanded = await this.stagesToggle.getAttribute("aria-expanded");
    if (expanded !== "true") {
      await this.eventUtils.after(FOCUS_PLACED, () =>
        this.stagesToggle.click(),
      );
    }
  }

  /**
   * Makes the stages of a non-empty bar visible. A view arriving from
   * anywhere but the search opens the row on its own, so this is the
   * idempotent path for the cases that do not; the row renders the view's
   * stages as it mounts.
   */
  async expand() {
    await this.openStages();
  }

  /**
   * Run `action` (e.g. an operator setting the view) and resolve once the
   * stages row it opens shows the view's stages
   */
  async afterStagesShown<T>(action: () => Promise<T>): Promise<T> {
    return this.eventUtils.after("e2e:view-bar:stages-shown", action);
  }

  /**
   * Types a stage name into the focused insert typeahead and inserts the
   * top match with Enter, returning its open editor.
   */
  async typeStage(name: string) {
    await this.page.keyboard.type(name);
    await afterStageEditor(this.eventUtils, true, () =>
      this.page.keyboard.press("Enter"),
    );
    return this.stageEditor;
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
    await afterStageEditor(this.eventUtils, true, () =>
      this.page
        .getByRole("listbox")
        .getByRole("option", { name, exact: true })
        .click(),
    );
    return this.stageEditor;
  }

  /** Reopens an already-applied stage's editor and returns it. */
  async editStage(index: number) {
    await afterStageEditor(this.eventUtils, true, () =>
      this.viewStages.nth(index).getByLabel("Edit stage").click(),
    );
    return this.stageEditor;
  }

  async removeStage(index: number) {
    await this.openStages();
    await this.viewStages.nth(index).getByLabel("Remove stage").click();
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

  constructor(
    page: Page,
    private readonly eventUtils: EventUtils,
  ) {
    this.page = page;
    this.assert = new StageEditorAsserter(this);
    this.locator = page.getByTestId("view-stage-editor");
  }

  /** The expression editor's suggestion rows (portaled). */
  get suggestions() {
    return this.page.locator('[id^="view-bar-suggestion-"]');
  }

  /** One parameter's control group. */
  param(name: string) {
    return this.locator.getByTestId(`view-stage-param-${name}`);
  }

  /** Types into a text, numeric, list or expression control. */
  async fill(param: string, value: string) {
    await this.param(param).getByRole("textbox").fill(value);
  }

  /**
   * Commits the stage from a param's input — Enter finishes AND applies,
   * closing the editor and moving the keyboard to the next insert slot.
   */
  async commit(param: string) {
    await this.closing(() =>
      this.param(param).getByRole("textbox").press("Enter"),
    );
  }

  /** Enter wherever the keyboard is in the editor: finishes and applies. */
  async finish() {
    await this.closing(() => this.page.keyboard.press("Enter"));
  }

  /** Escape closes the editor and puts the keyboard back on its pill. */
  async dismiss() {
    await this.closing(() => this.page.keyboard.press("Escape"));
  }

  /**
   * Accept the suggestion row showing `text`, by click or by Enter; the
   * editor puts the caret back after the completion a frame later.
   */
  async acceptSuggestion(text: string, gesture: "mouse" | "keyboard") {
    await this.eventUtils.after(FOCUS_PLACED, () =>
      gesture === "mouse"
        ? this.suggestions.filter({ hasText: text }).first().click()
        : this.page.keyboard.press("Enter"),
    );
  }

  private async closing(action: () => Promise<void>) {
    await afterStageEditor(this.eventUtils, false, () =>
      this.eventUtils.after(FOCUS_PLACED, action),
    );
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
    expect(await this.viewBar.locator.isVisible()).toBe(true);
  }

  async hasViewStage(text: string) {
    expect(
      (await this.viewBar.viewStages.allTextContents()).join(" "),
    ).toContain(text);
  }

  async stageCount(n: number) {
    expect(await this.viewBar.viewStages.count()).toBe(n);
  }

  /**
   * The stage typeahead holds the keyboard with its stage list dropped —
   * the state an opened empty stages row lands in.
   */
  async stageTypeaheadIsReady() {
    expect(await isFocused(this.viewBar.insertTypeahead)).toBe(true);
    expect(
      await this.viewBar.page
        .getByRole("listbox")
        .getByRole("option")
        .first()
        .isVisible(),
    ).toBe(true);
  }

  /** The insert typeahead holds the keyboard. */
  async insertTypeaheadIsFocused() {
    expect(await isFocused(this.viewBar.insertTypeahead)).toBe(true);
  }

  /** The keyboard is back on the pill of the stage at `index`. */
  async stageIsFocused(index: number) {
    expect(
      await isFocused(
        this.viewBar.viewStages.nth(index).getByLabel("Edit stage"),
      ),
    ).toBe(true);
  }

  async stagesRowIsHidden() {
    expect(await this.viewBar.stagesRow.isVisible()).toBe(false);
  }

  /** The history dropdown offers `query` as a previous search. */
  async searchHistoryOffers(query: string) {
    expect(
      await this.viewBar.searchHistory
        .getByRole("option", { name: query, exact: true })
        .isVisible(),
    ).toBe(true);
  }
}

class StageEditorAsserter {
  constructor(private readonly editor: StageEditorPom) {}

  async isOpen() {
    expect(await this.editor.locator.isVisible()).toBe(true);
  }

  async isClosed() {
    expect(await this.editor.locator.isVisible()).toBe(false);
  }

  /** The value a control is showing, whatever kind of control it is. */
  async paramText(param: string, value: string) {
    const control = this.editor.param(param);
    // Monaco's textbox holds only the text around its cursor, so an
    // expression is read from the editor's model
    const text =
      (await control.locator(".monaco-editor").count()) > 0
        ? await control.evaluate((element) => {
            const monaco = (
              window as unknown as {
                monaco: {
                  editor: {
                    getEditors: () => {
                      getContainerDomNode: () => HTMLElement;
                      getValue: () => string;
                    }[];
                  };
                };
              }
            ).monaco;
            return monaco.editor
              .getEditors()
              .find((editor) => element.contains(editor.getContainerDomNode()))
              ?.getValue();
          })
        : await control.getByRole("textbox").inputValue();
    expect(text).toBe(value);
  }

  async paramToggle(param: string, checked: boolean) {
    expect(
      await this.editor.param(param).getByRole("checkbox").isChecked(),
    ).toBe(checked);
  }

  /** A field param shows its path in the picker rather than anywhere else. */
  async paramField(param: string, path: string) {
    expect(await this.editor.param(param).textContent()).toContain(path);
  }

  /** Which editor a hydrated param opened in. */
  async activeEditor(param: string, label: string) {
    expect(
      await this.editor
        .param(param)
        .getByRole("tab", { name: label, exact: true })
        .getAttribute("aria-selected"),
    ).toBe("true");
  }

  /** The control for `param` holds the keyboard. */
  async paramIsFocused(param: string) {
    expect(await isFocused(this.editor.param(param).getByRole("textbox"))).toBe(
      true,
    );
  }
}
