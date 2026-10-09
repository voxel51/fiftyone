import { Locator, Page, expect } from "src/oss/fixtures";
import { expectScreenshot } from "src/oss/utils/screenshot";
import { EventUtils } from "src/shared/event-utils";
import { SelectorPom } from "../selector";

/** A hover tooltip is DOM drawn over the chart, not part of it */
const CHART_ONLY =
  ".recharts-tooltip-wrapper { visibility: hidden !important; }";

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

  /** Select `field`; resolves once its histogram has drawn */
  selectField(field: string): Promise<void> {
    return this.afterLoad(() => this.selector.selectResult(field), field);
  }

  /**
   * Run the action that (re)draws a histogram (opening the panel, a mode
   * switch, a field choice) and resolve once it has drawn; pass a path to
   * ignore sibling histograms' draws
   */
  async afterLoad(action: () => Promise<unknown>, path?: string) {
    await this.eventUtils.after(
      "e2e:histograms:loaded",
      action,
      (e) => !path || (e.detail as { path?: string })?.path === path,
    );
  }

  /** The drawn chart of `path`'s histogram */
  chart(path: string): Locator {
    return this.page.locator(`[id="histogram-${path}"] svg.recharts-surface`);
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

  /**
   * The chart `path`'s histogram drew (its bars and axes) matches the `name`
   * baseline; draw it first with {@link HistogramPom.afterLoad}
   */
  async hasScreenshot(path: string, name: string) {
    await expectScreenshot(this.histogramPom.chart(path), name, {
      style: CHART_ONLY,
    });
  }
}
