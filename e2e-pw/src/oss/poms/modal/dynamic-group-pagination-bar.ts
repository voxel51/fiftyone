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

  async navigatePage(page: number) {
    await this.getPageButton(page).click();
    await this.modal.waitForCarouselToLoad();
  }

  getPageButton(page: number) {
    return this.locator.getByTestId(`dynamic-group-pagination-item-${page}`);
  }

  getTooltip(text: string) {
    return this.page.getByTestId(`tooltip-${text}`);
  }

  /** Hover a page button until its `text` tooltip opens (after a delay) */
  async hoverPage(page: number, text: string) {
    await this.getPageButton(page).hover();
    const tooltip = this.getTooltip(text);
    await tooltip.waitFor();
    return tooltip;
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
