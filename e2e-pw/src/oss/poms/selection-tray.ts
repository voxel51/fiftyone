import { Locator, Page, expect } from "src/oss/fixtures";

/** The grid's persistent selection and bulk action bar. */
export class SelectionTrayPom {
  readonly locator: Locator;

  constructor(private readonly page: Page) {
    this.locator = page.getByRole("region", { name: "Selection" });
  }

  async tagSamples(tag: string) {
    const trigger = this.locator.getByRole("button", {
      name: "Tag",
      exact: true,
    });
    await trigger.click();
    await this.page
      .getByRole("textbox", { name: "Create or find tag" })
      .fill(tag);
    await this.page.getByRole("button", { name: `Create “${tag}”` }).click();
    await expect(
      this.page.getByRole("button", { name: tag, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await trigger.click();
  }
}
