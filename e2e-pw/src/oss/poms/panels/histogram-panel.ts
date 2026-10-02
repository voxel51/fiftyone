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

  /** Select `field`; resolves with its drawn bars (see {@link afterLoad}) */
  selectField(field: string): Promise<string> {
    return this.afterLoad(() => this.selector.selectResult(field), field);
  }

  /**
   * Run the action that (re)draws a histogram (opening the panel, a mode
   * switch, a field choice) and resolve with its bars as `key:count` in axis
   * order; pass a path to ignore sibling histograms' draws
   */
  async afterLoad(
    action: () => Promise<unknown>,
    path?: string,
  ): Promise<string> {
    let bars = "";
    await this.eventUtils.after("e2e:histograms:loaded", action, (e) => {
      const detail = e.detail as { path?: string; bars?: string };
      if (path && detail?.path !== path) return false;
      bars = detail?.bars ?? "";
      return true;
    });
    return bars;
  }
}

class HistogramAsserter {
  constructor(private readonly histogramPom: HistogramPom) {}

  async isLoaded() {
    expect(await this.histogramPom.locator.isVisible()).toBe(true);
  }

  async verifyField(field: string) {
    await this.histogramPom.selector.assert.verifyValue(field);
  }

  async verifyFields(fields: string[]) {
    await this.histogramPom.selector.assert.verifyResults(fields);
  }
}
