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
      .locator(".monaco-editor");
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
    await this.page.keyboard.press("ControlOrMeta+KeyC");
    const text = await this.page.evaluate(() => navigator.clipboard.readText());
    return JSON.parse(text) as JSONValue;
  }

  /**
   * Select all the text within the code editor
   */
  async selectAllJSON() {
    await this.locator.click({ clickCount: 4 });
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
    await this.schemaManager.locator.getByTestId("scan").click();
    await event;
  }

  /**
   * Save the changes
   */
  async save() {
    const event = this.eventUtils.getEventReceivedPromiseForPredicate(
      "schema-manager-save-complete"
    );
    await this.schemaManager.footer.getByTestId("primary-button").click();
    await event;
  }

  /**
   * Discard the unsaved changes
   */
  async discard() {
    await this.schemaManager.footer.getByTestId("secondary-button").click();
  }

  /**
   * Toggle the visibility, i.e. make the field active or hidden
   */
  async toggleVisibility() {
    await this.schemaManager.locator.getByTestId("toggle-visibility").click();
  }

  /**
   * Wait for JSON validation to yield an invalid response
   *
   * @returns A promise
   */
  async expectInvalidJSON() {
    return this.eventUtils.getEventReceivedPromiseForPredicate(
      "schema-manager-invalid-json"
    );
  }

  /**
   * Wait for JSON validation to yield a valid response
   *
   * @returns A promise
   */
  async expectValidJSON() {
    return this.eventUtils.getEventReceivedPromiseForPredicate(
      "schema-manager-valid-json"
    );
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
