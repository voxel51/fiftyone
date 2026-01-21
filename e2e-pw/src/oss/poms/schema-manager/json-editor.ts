import { Page } from "src/oss/fixtures";
import type { SchemaManagerPom } from ".";

export class JSONEditorPom {
  readonly assert: JSONEditorAsserter;

  constructor(
    readonly page: Page,
    readonly field: string,
    readonly schemaManager: SchemaManagerPom
  ) {
    this.assert = new JSONEditorAsserter(this);
  }

  get container() {
    return this.schemaManager.container
      .getByTestId(`json-editor`)
      .locator(".monaco-editor")
      .nth(0);
  }

  async getJSON() {
    await this.page.keyboard.press("ControlOrMeta+KeyA");
    return await this.container.textContent();
  }

  async setJSON() {
    await this.container.focus();
    await this.page.keyboard.press("ControlOrMeta+KeyA");
    this.page.keyboard.type("hello\n");
  }
}

class JSONEditorAsserter {
  constructor(private readonly jsonEditorPom: JSONEditorPom) {}
}
