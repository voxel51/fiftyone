import { expect, Page } from "src/oss/fixtures";
import { EventUtils } from "src/shared/event-utils";

export class UrlPom {
  readonly assert: UrlAsserter;

  constructor(
    private readonly page: Page,
    private readonly eventUtils: EventUtils
  ) {
    this.assert = new UrlAsserter(this);
  }

  get groupSlice() {
    return this.searchParams.get("groupSlice");
  }

  get groupId() {
    return this.searchParams.get("groupId");
  }

  get sampleId() {
    return this.searchParams.get("sampleId");
  }

  get searchParams() {
    console.log(this.url.searchParams);
    return this.url.searchParams;
  }

  get url() {
    return new URL(this.page.url());
  }

  get view() {
    return this.searchParams.get("view");
  }

  async pageChange(wrap: () => Promise<unknown>) {
    const pageChange =
      this.eventUtils.getEventReceivedPromiseForPredicate("page-change");
    await wrap();
    await pageChange;
  }

  async back() {
    await this.pageChange(() => this.page.goBack());
  }

  async forward() {
    await this.pageChange(() => this.page.goForward());
  }
}

class UrlAsserter {
  constructor(private readonly urlPom: UrlPom) {}

  verifyGroupSlice(slice: string | null) {
    expect(this.urlPom.groupSlice).toEqual(slice);
  }

  verifyGroupId(groupId: string | null) {
    expect(this.urlPom.sampleId).toEqual(groupId);
  }

  verifySampleId(sampleId: string) {
    expect(this.urlPom.sampleId).toEqual(sampleId);
  }

  verifyView(viewName: string) {
    expect(this.urlPom.sampleId).toEqual(viewName);
  }
}
