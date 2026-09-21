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
    const results = await this.eventUtils.arm(`selector-results-${this.title}`);
    await this.input.focus();
    await results.received;
  }

  async closeResults() {
    this.input.blur();
  }
}

class SelectorAsserter {
  constructor(private readonly selectorPom: SelectorPom) {}

  async verifyValue(value: string) {
    await expect(this.selectorPom.input).toHaveValue(value);
  }

  async verifyResults(values: string[]) {
    const count = await this.selectorPom.results.count();
    expect(count).toBe(values.length);

    for (let index = 0; index < values.length; index++) {
      await expect(
        this.selectorPom.resultsContainer.getByTestId(
          `selector-result-${values[index]}`,
        ),
      ).toBeVisible();
    }
  }
}
