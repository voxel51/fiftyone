import { expect, Locator, Page } from "src/oss/fixtures";
import { EventUtils } from "src/shared/event-utils";

export class SelectorPom {
  readonly assert: SelectorAsserter;
  readonly input: Locator;
  readonly results: Locator;
  readonly resultsContainer: Locator;

  constructor(
    private readonly parent: Locator | Page,
    private readonly eventUtils: EventUtils,
    private readonly title: string,
  ) {
    this.assert = new SelectorAsserter(this);
    this.input = this.parent.getByTestId(`selector-${this.title}`);
    this.resultsContainer = this.parent.getByTestId(
      `selector-results-container-${this.title}`,
    );
    // Rows are divs in the legacy selector and option buttons in a voodo
    // Combobox (the dataset picker)
    this.results = this.resultsContainer.locator(
      ":scope > div, :scope > [role='option']",
    );
  }

  async selectResult(value: string) {
    await this.input.fill(value);
    await this.input.press("Enter");
    await this.assert.verifyValue(value);
  }

  async openResults() {
    await this.eventUtils.after(
      "e2e:components:selector-results",
      // a click delivers focus events even when the page lacks browser focus
      () => this.input.click(),
      (e) => (e.detail as { cy?: string }).cy === this.title,
    );
  }

  async closeResults() {
    await this.eventUtils.after(
      "e2e:components:selector-results-closed",
      // a blur is ignored while the pointer is over the results
      () => this.input.press("Escape"),
      (e) => (e.detail as { cy?: string }).cy === this.title,
    );
  }
}

class SelectorAsserter {
  constructor(private readonly selectorPom: SelectorPom) {}

  async verifyValue(value: string) {
    expect(await this.selectorPom.input.inputValue()).toBe(value);
  }

  async verifyResults(values: string[]) {
    const count = await this.selectorPom.results.count();
    expect(count).toBe(values.length);

    for (let index = 0; index < values.length; index++) {
      expect(
        await this.selectorPom.resultsContainer
          .getByTestId(`selector-result-${values[index]}`)
          .isVisible(),
      ).toBe(true);
    }
  }
}
