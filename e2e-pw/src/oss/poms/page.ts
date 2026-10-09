import { Page, expect } from "src/oss/fixtures";
import {
  EventCounter,
  EventUtils,
  type ObservedEvent,
} from "src/shared/event-utils";

export class PagePom {
  readonly assert: PageAsserter;

  constructor(
    private readonly page: Page,
    private readonly eventUtils: EventUtils,
  ) {
    this.assert = new PageAsserter(this);
  }

  /**
   * Install a counter for the global "Pixelating..." loading screen's mount
   * event. Counting installs at document start — arm BEFORE navigating to
   * the page whose load should be observed.
   */
  armGlobalLoadingScreenCounter(): Promise<EventCounter> {
    return this.eventUtils.initCounter("e2e:app:global-loading-screen");
  }

  get pathname() {
    return this.url.pathname;
  }

  get url() {
    return new URL(this.page.url());
  }

  getPage(pagename: string) {
    return this.page.getByTestId(`${pagename}-page`);
  }

  /** Load the index page, or `dataset` from the selector, once rendered */
  async loadDataset(dataset?: string) {
    if (!dataset) {
      await this.eventUtils.afterNavigation("e2e:app:page-change", () =>
        this.page.goto("/"),
      );
      return;
    }
    const results = (e: ObservedEvent) =>
      (e.detail as { cy?: string }).cy === "dataset";
    await this.eventUtils.after(
      "e2e:components:selector-results",
      () => this.page.getByTestId("selector-dataset").click(),
      results,
    );
    // The menu searches the server, so its list settles after the query
    await this.eventUtils.after(
      "e2e:components:selector-results",
      () => this.page.getByTestId("selector-dataset-search").fill(dataset),
      results,
    );
    await this.eventUtils.after("e2e:app:page-change", () =>
      this.page.getByTestId(`selector-result-${dataset}`).click(),
    );
  }

  /** Go back in history; resolves once the previous page has rendered */
  async goBack() {
    await this.eventUtils.after("e2e:app:page-change", () =>
      this.page.goBack(),
    );
  }
}

class PageAsserter {
  constructor(private readonly pagePom: PagePom) {}

  /**
   * Asserts that the global "Pixelating..." loading screen has fired exactly
   * once since the counter was armed. Firing more than once indicates that
   * the top-level Suspense boundary re-activated after initial page load,
   * which is a regression.
   */
  async hasHadOnlyOneGlobalLoadingScreen(counter: EventCounter) {
    expect(await counter.read(), JSON.stringify(await counter.timeline())).toBe(
      1,
    );
  }

  async verifyPage(pagename: string) {
    expect(await this.pagePom.getPage(pagename).isVisible()).toBe(true);
  }

  async verifyPathname(pathname: string) {
    expect(this.pagePom.pathname).toEqual(pathname);
  }
}
