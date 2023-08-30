import { Locator, Page, expect } from "src/oss/fixtures";
import { ModalPom } from ".";

export class DynamicGroupPaginationPom {
  readonly locator: Locator;
  readonly input: Locator;
  readonly assert: DynamicGroupPaginationAsserter;

  constructor(private readonly page: Page, private readonly modal: ModalPom) {
    this.locator = modal.locator.getByTestId("dynamic-group-pagination-bar");
    this.input = this.locator.getByTestId("dynamic-group-pagination-bar-input");
    this.assert = new DynamicGroupPaginationAsserter(this);
  }

  async navigatePage(page: number) {
    await this.input.fill(`${page}`);
    await this.modal.waitForCarouselToLoad();
  }

  getPageButton(page: number) {
    return this.locator.getByTestId(`dynamic-group-pagination-item-${page}`);
  }
}

class DynamicGroupPaginationAsserter {
  constructor(private readonly nestedGroupPom: DynamicGroupPaginationPom) {}

  async verifyPage(page: number) {
    const button = this.nestedGroupPom.getPageButton(page);
    await expect(button).toBeVisible();
    await expect(button).toHaveText(String(page));
  }

  async verifyTooltip(page: number, text: string) {
    const button = this.nestedGroupPom.getPageButton(page);
    await button.hover();
    const tooltip = this.nestedGroupPom.locator.getByTestId(`tooltip-${text}`);
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveText(text);
  }
}
