import { expect, Page } from "src/oss/fixtures";
import { EventUtils } from "src/shared/event-utils";

export class UrlPom {
  readonly assert: UrlAsserter;

  constructor(
    private readonly page: Page,
    private readonly eventUtils: EventUtils,
  ) {
    this.assert = new UrlAsserter(this);
  }

  get id() {
    return this.searchParams.get("id");
  }

  get searchParams() {
    return this.url.searchParams;
  }

  get url() {
    return new URL(this.page.url());
  }

  pageChange<T>(wrap: () => Promise<T>): Promise<T> {
    return this.eventUtils.after("e2e:app:page-change", wrap);
  }

  async back() {
    await this.pageChange(() => this.page.goBack());
  }
}

class UrlAsserter {
  constructor(private readonly urlPom: UrlPom) {}

  verifySampleId(id: string) {
    expect(this.urlPom.id).toEqual(id);
  }
}
