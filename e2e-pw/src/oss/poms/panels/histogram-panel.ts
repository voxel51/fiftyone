import { Locator, Page, expect } from "src/oss/fixtures";
import { EventUtils } from "src/shared/event-utils";
import { SelectorPom } from "../selector";

export class HistogramPom {
  readonly assert: HistogramAsserter;
  readonly locator: Locator;
  readonly selector: SelectorPom;

  constructor(
    private readonly page: Page,
    private readonly eventUtils: EventUtils,
  ) {
    this.assert = new HistogramAsserter(this);

    this.locator = this.page.getByTestId("histograms-container");
    this.selector = new SelectorPom(this.locator, eventUtils, "histograms");
  }

  async selectField(field: string) {
    await this.eventUtils.after(`histogram-${field}`, () =>
      this.selector.selectResult(field),
    );
  }

  // run the action that reloads the histogram (mode switch, panel
  // foreground); pass a path to ignore sibling histograms' draws
  afterLoad<T>(action: () => Promise<T>, path?: string): Promise<T> {
    return this.eventUtils.after(
      "histograms-loaded",
      action,
      (e) => !path || (e.detail as { path?: string })?.path === path,
    );
  }
}

class HistogramAsserter {
  constructor(private readonly histogramPom: HistogramPom) {}

  async isLoaded() {
    await expect(this.histogramPom.locator).toBeVisible();
  }

  async verifyField(field: string) {
    await this.histogramPom.selector.assert.verifyValue(field);
  }

  async verifyFields(fields: string[]) {
    await this.histogramPom.selector.assert.verifyResults(fields);
  }
}
