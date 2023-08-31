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
    private readonly title: string
  ) {
    this.assert = new SelectorAsserter(this);
    this.input = this.parent.getByTestId(`selector-${this.title}`);
    this.resultsContainer = this.parent.getByTestId(
      `selector-results-container-${this.title}`
    );
    this.results = this.resultsContainer.locator("> div");
  }

  async selectResult(value: string) {
    await this.input.fill(value);
    await this.input.press("Enter");
    await this.assert.verifyValue(value);
  }

  async openResults() {
    const promise = this.eventUtils.getEventReceivedPromiseForPredicate(
      `selector-results-${this.title}`,
      () => {
        return true;
      }
    );
    await this.input.focus();
    await promise;
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
      const visible = await this.selectorPom.resultsContainer
        .getByTestId(`selector-result-${values[index]}`)
        .isVisible();
      expect(visible).toBe(true);
    }

    await this.selectorPom.closeResults();
  }
}
