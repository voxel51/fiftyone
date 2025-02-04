import { Locator, Page, expect } from "src/oss/fixtures";
import { EventUtils } from "src/shared/event-utils";
import { SelectorPom } from "./selector";

export class PagePom {
  readonly assert: PageAsserter;
  readonly datasetSelector: SelectorPom;
  readonly locator: Locator;

  constructor(
    private readonly page: Page,
    private readonly eventUtils: EventUtils
  ) {
    this.assert = new PageAsserter(this);
    this.datasetSelector = new SelectorPom(page, eventUtils, "dataset");
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

  async loadDataset(dataset?: string) {
    if (!dataset) {
      await this.page.goto("/");
    } else {
      await this.datasetSelector.openResults();
      await this.datasetSelector.selectResult(dataset);
    }
    await this.page.waitForSelector(
      `[data-cy=${dataset ? "dataset" : "index"}-page]`,
      {
        state: "visible",
      }
    );
  }
}

class PageAsserter {
  constructor(private readonly pagePom: PagePom) {}

  async verifyPage(pagename: string) {
    await expect(this.pagePom.getPage(pagename)).toBeVisible();
  }

  async verifyPathname(pathname: string) {
    expect(this.pagePom.pathname).toEqual(pathname);
  }

  async verifyDataset(datasetName: string) {
    await this.pagePom.datasetSelector.assert.verifyValue(datasetName);
    expect(this.pagePom.pathname).toEqual(`/datasets/${datasetName}`);
  }

  async verifyDatasets(datasetNames: string[]) {
    await this.pagePom.datasetSelector.assert.verifyResults(datasetNames);
  }
}
