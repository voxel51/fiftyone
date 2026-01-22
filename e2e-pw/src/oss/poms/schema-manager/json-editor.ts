import { expect, Page } from "src/oss/fixtures";
import type { EventUtils } from "src/shared/event-utils";
import type { SchemaManagerPom } from ".";

type JSONValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JSONValue }
  | Array<JSONValue>;

/**
 * The JSON editor view for a field in the schema manager
 */
export class JSONEditorPom {
  readonly assert: JSONEditorAsserter;

  constructor(
    readonly page: Page,
    readonly eventUtils: EventUtils,
    readonly field: string,
    readonly schemaManager: SchemaManagerPom
  ) {
    this.assert = new JSONEditorAsserter(this);
  }

  /**
   * The code editor's locator
   */
  get locator() {
    return this.schemaManager.locator
      .getByTestId("json-editor")
      .locator(".monaco-editor")
      .nth(0);
  }

  /**
   * Get the error strings from label schema validation, if present
   *
   * @returns the error strings
   */
  async getErrors() {
    const items = this.schemaManager.locator
      .getByTestId("errors-list")
      .locator("li");
    return await Promise.all(
      (await items.all()).map((item) => item.textContent())
    );
  }

  /**
   * Get the current json data
   *
   * @returns The json
   */
  async getJSON() {
    await this.selectAllJSON();
    const text = await this.page.evaluate(() => navigator.clipboard.readText());
    return JSON.parse(text) as JSONValue;
  }

  /**
   * Select all the text within the code editor
   */
  async selectAllJSON() {
    await this.locator.click();
    // select all text twice, once is not enough for "all text" surprisingly
    await this.page.keyboard.press("ControlOrMeta+KeyA");
    await this.page.keyboard.press("ControlOrMeta+KeyA");
  }

  /**
   * Set the JSON editor's value
   *
   * @param json The json data
   */
  async setJSON(json: JSONValue) {
    await this.page.evaluate(
      (json) => navigator.clipboard.writeText(json),
      JSON.stringify(json, undefined, 2)
    );
    await this.selectAllJSON();
    await this.page.keyboard.press("ControlOrMeta+KeyV");
  }

  /**
   * Scan the dataset and populate label schema values
   */
  async scan() {
    const event = this.eventUtils.getEventReceivedPromiseForPredicate(
      "schema-manager-scan-complete"
    );
    await this.locator.getByTestId("scan").click();
    await event;
  }

  /**
   * Save the changes
   */
  async save() {
    const event = this.eventUtils.getEventReceivedPromiseForPredicate(
      "schema-manager-save-complete"
    );
    await this.locator.getByTestId("save").click();
    await event;
  }

  /**
   * Discard the unsaved changes
   *
   *
   */
  async discard() {
    const event = this.eventUtils.getEventReceivedPromiseForPredicate(
      "schema-manager-discard-complete"
    );
    await this.locator.getByTestId("discard").click();
    await event;
  }

  /**
   * Toggle the visibility, i.e. make the field active or hidden
   */
  async toggleVisibility() {
    await this.locator.getByTestId("toggle-visibility").click();
  }
}

/**
 * JSON editor view asserter
 */
class JSONEditorAsserter {
  constructor(private readonly jsonEditorPom: JSONEditorPom) {}

  /**
   * Does the json match
   *
   * @param json The json to compare
   */
  async hasJSON(json: JSONValue) {
    const current = await this.jsonEditorPom.getJSON();
    expect(current).toStrictEqual(json);
  }

  /**
   * Do the errors match
   *
   * @param errors The error strings to compare
   */
  async hasErrors(errors: string[]) {
    expect(await this.jsonEditorPom.getErrors()).toStrictEqual(errors);
  }
}
