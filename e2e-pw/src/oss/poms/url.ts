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
    return this.searchParams.get("slice");
  }

  get groupId() {
    return this.searchParams.get("groupId");
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

  get view() {
    return this.searchParams.get("view");
  }

  async pageChange<T>(wrap: () => Promise<T>): Promise<T> {
    const pageChange =
      this.eventUtils.getEventReceivedPromiseForPredicate("page-change");
    const result = await wrap();
    await pageChange;
    return result;
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
    expect(this.urlPom.id).toEqual(groupId);
  }

  verifySampleId(id: string) {
    expect(this.urlPom.id).toEqual(id);
  }

  verifyView(viewName: string) {
    expect(this.urlPom.id).toEqual(viewName);
  }
}
