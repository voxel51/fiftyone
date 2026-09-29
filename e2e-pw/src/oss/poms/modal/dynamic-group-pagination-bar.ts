import { Locator, Page, expect } from "src/oss/fixtures";
import { collapseWhitespace } from "src/oss/utils";
import { ModalPom } from ".";

export class DynamicGroupPaginationPom {
  readonly locator: Locator;
  readonly input: Locator;
  readonly assert: DynamicGroupPaginationAsserter;

  constructor(
    private readonly page: Page,
    private readonly modal: ModalPom,
  ) {
    this.locator = modal.locator.getByTestId("dynamic-group-pagination-bar");
    this.input = this.locator.getByTestId("dynamic-group-pagination-bar-input");
    this.assert = new DynamicGroupPaginationAsserter(this);
  }

  /** Run `action` and resolve once the bar shows its pages because of it */
  afterShown<T>(action: () => Promise<T>): Promise<T> {
    return this.modal.eventUtils.after(
      "e2e:modal:dynamic-group-pagination",
      action,
    );
  }

  /** Page to another group element, resolving once the sidebar shows it */
  async navigatePage(page: number) {
    const current = await this.modal.sidebar.getSampleId();
    await this.modal.sidebar.afterEntryChanged("id", current, () =>
      this.getPageButton(page).click(),
    );
  }

  getPageButton(page: number) {
    return this.locator.getByTestId(`dynamic-group-pagination-item-${page}`);
  }

  getTooltip(text: string) {
    return this.page.getByTestId(`tooltip-${text}`);
  }

  /** Hover a page button; its `text` tooltip opens after a delay */
  async hoverPage(page: number, text: string) {
    await this.getPageButton(page).hover();
    return this.getTooltip(text);
  }
}

class DynamicGroupPaginationAsserter {
  constructor(private readonly nestedGroupPom: DynamicGroupPaginationPom) {}

  async verifyPage(page: number) {
    const button = this.nestedGroupPom.getPageButton(page);
    expect(await button.isVisible()).toBe(true);
    expect(collapseWhitespace(await button.textContent())).toBe(String(page));
  }

  async verifyTooltip(page: number, text: string) {
    const tooltip = await this.nestedGroupPom.hoverPage(page, text);
    expect(collapseWhitespace(await tooltip.textContent())).toBe(text);
  }

  async verifyTooltips(pages: { [page: number]: string }) {
    for (const page in pages) {
      await this.verifyTooltip(Number(page), pages[page]);
    }
  }
}
