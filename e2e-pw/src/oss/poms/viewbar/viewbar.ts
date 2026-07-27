import { Locator, Page, expect } from "src/oss/fixtures";

/**
 * The view bar: a row of stage cards, an insert slot between each pair, and a
 * portaled editor popover for the stage being edited.
 *
 * Parameters must be filled in declaration order — the bar disables a param
 * until the required ones declared before it are satisfied, and refuses to
 * close a stage whose required params are still empty.
 */
export class ViewBarPom {
  readonly page: Page;
  readonly locator: Locator;
  readonly assert: ViewBarAsserter;

  constructor(page: Page) {
    this.page = page;
    this.assert = new ViewBarAsserter(this);
    this.locator = this.page.getByTestId("view-bar");
  }

  get applyBtn() {
    return this.locator.getByTestId("btn-apply-view-bar");
  }

  get viewStages() {
    return this.locator.getByTestId("view-stage-container");
  }

  /** The open stage editor. Portaled to the body, so not under the bar. */
  get editor() {
    return this.page.getByTestId("view-stage-editor");
  }

  /** One parameter's control group inside the open editor. */
  param(name: string) {
    return this.editor.getByTestId(`view-stage-param-${name}`);
  }

  apply() {
    return this.applyBtn.click();
  }

  /** Appends a stage and leaves its editor open. */
  async addStage(name: string) {
    await this.locator.getByTitle("Insert stage").last().click();
    await this.page
      .getByRole("listbox")
      .getByRole("option", { name, exact: true })
      .click();
    await expect(this.editor).toBeVisible();
  }

  /** Reopens an already-applied stage's editor. */
  async editStage(index: number) {
    await this.viewStages.nth(index).getByTitle("Edit stage").click();
    await expect(this.editor).toBeVisible();
  }

  /** Types into a text, numeric, list or expression control. */
  async fill(param: string, value: string) {
    await this.param(param).getByRole("textbox").fill(value);
  }

  /** Picks a path in a field param's picker. */
  async chooseField(param: string, path: string) {
    await this.param(param).click();
    await this.page
      .locator("[data-headlessui-portal]")
      .getByRole("option", { name: path, exact: true })
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

  /** The value a control is showing, whatever kind of control it is. */
  async paramText(param: string, value: string) {
    await expect(this.viewBar.param(param).getByRole("textbox")).toHaveValue(
      value,
    );
  }

  async paramToggle(param: string, checked: boolean) {
    const toggle = this.viewBar.param(param).getByRole("checkbox");
    if (checked) {
      await expect(toggle).toBeChecked();
    } else {
      await expect(toggle).not.toBeChecked();
    }
  }

  /** A field param shows its path in the picker rather than anywhere else. */
  async paramField(param: string, path: string) {
    await expect(this.viewBar.param(param)).toContainText(path);
  }

  /** Which editor a hydrated param opened in. */
  async activeEditor(param: string, label: string) {
    await expect(
      this.viewBar.param(param).getByRole("tab", { name: label, exact: true }),
    ).toHaveAttribute("aria-selected", "true");
  }
}
