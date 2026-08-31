import { Locator, Page, expect } from "src/oss/fixtures";

/**
 * The view bar: a row of stage cards with an insert slot between each pair.
 * The popover for the stage being edited is its own POM —
 * {@link StageEditorPom} — returned by `addStage` and `editStage`.
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

  get applyBtn() {
    return this.locator.getByTestId("btn-apply-view-bar");
  }

  get viewStages() {
    return this.locator.getByTestId("view-stage-container");
  }

  /** The collapsed "Current view · N stages" summary chip. */
  get currentViewChip() {
    return this.locator.getByTestId("view-bar-current-view");
  }

  /** The typeahead input an insert slot opens into. */
  get insertTypeahead() {
    return this.locator.getByPlaceholder("Add stage…");
  }

  /**
   * Expands a collapsed bar into its stage pills. A bar hydrated from a
   * saved view starts as the summary chip; clicking it is the expansion
   * gesture.
   */
  async expand() {
    await this.currentViewChip.click();
    await expect(this.viewStages.first()).toBeVisible();
  }

  apply() {
    return this.applyBtn.click();
  }

  /** Appends a stage and returns its open editor. */
  async addStage(name: string) {
    await this.locator.getByLabel("Insert stage").last().click();
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
