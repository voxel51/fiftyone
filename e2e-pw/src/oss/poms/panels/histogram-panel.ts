import { Locator, Page, expect } from "src/oss/fixtures";
import { expectScreenshot } from "src/oss/utils/screenshot";
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
    await this.afterLoad(() => this.selector.selectResult(field), field);
  }

  // run the action that reloads the histogram (mode switch, panel
  // foreground); pass a path to ignore sibling histograms' draws
  afterLoad<T>(action: () => Promise<T>, path?: string): Promise<T> {
    return this.eventUtils.after(
      "e2e:histograms:loaded",
      action,
      (e) => !path || (e.detail as { path?: string })?.path === path,
    );
  }
}

class HistogramAsserter {
  constructor(private readonly histogramPom: HistogramPom) {}

  async isLoaded() {
    expect(await this.histogramPom.locator.isVisible()).toBe(true);
  }

  /** One capture of the panel; draw it first with `afterLoad` */
  async hasScreenshot(name: string) {
    await expectScreenshot(this.histogramPom.locator, name);
  }

  async verifyField(field: string) {
    await this.histogramPom.selector.assert.verifyValue(field);
  }

  async verifyFields(fields: string[]) {
    await this.histogramPom.selector.assert.verifyResults(fields);
  }
}
