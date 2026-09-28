import { Locator, Page, expect } from "src/oss/fixtures";

/** The grid's persistent action bar, captured cards, and saved scope picker. */
export class SelectionTrayPom {
  readonly locator: Locator;
  readonly assert: SelectionTrayAsserter;

  constructor(private readonly page: Page) {
    this.locator = page.getByRole("region", { name: "Selection" });
    this.assert = new SelectionTrayAsserter(this);
  }

  get scope() {
    return this.page.getByTestId("samples-scope-trigger");
  }

  subsetChoices(name: string) {
    return this.page
      .locator('[data-cy^="samples-scope-subset-"]')
      .filter({ hasText: name });
  }

  get cards() {
    return this.locator.getByRole("article");
  }

  getCard(name: string) {
    return this.cards.filter({
      has: this.page.getByRole("button", { name: `Open ${name}` }),
    });
  }

  bucket(name: string) {
    return this.locator.getByRole("group", {
      name: `Selected samples in ${name}`,
    });
  }

  bucketCard(name: string, fileName: string) {
    return this.bucket(name).getByRole("article", {
      name: `${fileName}, Sample`,
    });
  }

  async clear() {
    await this.locator.getByRole("button", { name: "Clear selection" }).click();
  }

  async undo() {
    await this.locator.getByRole("button", { name: "Undo" }).click();
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

  async openTagPicker() {
    await this.locator
      .getByRole("button", { name: "Tag", exact: true })
      .click();
    await expect(
      this.page.getByRole("textbox", { name: "Create or find tag" }),
    ).toBeVisible();
  }

  async closeTagPicker() {
    await this.locator
      .getByRole("button", { name: "Tag", exact: true })
      .click();
  }

  async tagLabels(tag: string) {
    await this.openTagPicker();
    await this.page.getByRole("radio", { name: "Labels" }).click();
    await this.page
      .getByRole("textbox", { name: "Create or find tag" })
      .fill(tag);
    await this.page.getByRole("button", { name: `Create “${tag}”` }).click();
    await expect(
      this.page.getByRole("button", { name: tag, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await this.closeTagPicker();
  }

  async addBucket() {
    await this.locator
      .getByRole("button", { name: "Sort into buckets" })
      .click();
    await expect(
      this.locator.getByRole("group", { name: "Selection buckets" }),
    ).toBeVisible();
  }

  async targetBucket(name: string) {
    await this.locator
      .getByRole("button", {
        name: new RegExp(
          `^${escapeRegex(name)}, .*Actions apply to this bucket when pressed\\.$`,
        ),
      })
      .click();
  }

  async clearBucket(name: string) {
    await this.locator.getByRole("button", { name: `Clear ${name}` }).click();
  }

  async openScope() {
    await this.scope.click();
    await expect(this.page.getByTestId("samples-scope-all")).toBeVisible();
  }

  async chooseAllSamples() {
    await this.openScope();
    await this.page.getByTestId("samples-scope-all").click();
  }

  async chooseSubset(name: string, kind?: string) {
    await this.openScope();
    const choice = this.subsetChoices(name);
    await (kind ? choice.filter({ hasText: kind }) : choice).click();
    await expect(this.scope).toContainText(name);
  }

  async createSubset(
    name: string,
    groupScope?: "Selected samples" | "All slices of these groups",
  ) {
    await this.locator
      .getByRole("button", { name: /^(Add to subset|Save as new subset)$/ })
      .click();
    if (groupScope)
      await this.page.getByRole("radio", { name: groupScope }).click();
    const newSubset = this.page.getByRole("button", {
      name: "New subset",
      exact: true,
    });
    const nameInput = this.page.getByRole("textbox", {
      name: "New subset name",
    });
    await expect(newSubset.or(nameInput).first()).toBeVisible();
    if (await newSubset.isVisible()) await newSubset.click();
    await nameInput.fill(name);
    await this.page.getByRole("button", { name: "Create subset" }).click();
    await expect(
      this.page.getByRole("button", { name: "Open subset" }),
    ).toBeVisible();
  }

  async openCreatedSubset() {
    await this.page.getByRole("button", { name: "Open subset" }).click();
  }

  async addToSubset(name: string) {
    await this.locator.getByRole("button", { name: "Add to subset" }).click();
    await this.page
      .getByRole("button", {
        name: new RegExp(`^${escapeRegex(name)}(?:\\s|$)`),
      })
      .click();
    await expect(
      this.page.getByRole("button", { name: "Open subset" }),
    ).toBeVisible();
  }

  async removeSelectedFromSubset() {
    await this.locator
      .getByRole("button", { name: "Remove from subset" })
      .click();
    await this.page.getByRole("button", { name: "Remove selected" }).click();
  }

  async deleteSubset(name: string) {
    await this.openScope();
    await this.subsetChoices(name).hover();
    await this.page.getByRole("button", { name: `Delete ${name}` }).click();
    await this.page.getByRole("button", { name: "Delete subset" }).click();
  }
}

class SelectionTrayAsserter {
  constructor(private readonly tray: SelectionTrayPom) {}

  async targetsAllResults() {
    await expect(this.tray.locator).toContainText(
      "Act on all samples in the grid",
    );
  }

  async selectedSamples(count: number) {
    await expect(this.tray.locator).toContainText(
      new RegExp(
        `(?<!\\d)${count}(?!\\d)\\s*sample${count === 1 ? "" : "s"} selected`,
      ),
    );
    await expect(this.tray.cards).toHaveCount(count);
  }

  async cardsHaveNames(names: readonly string[]) {
    await expect(this.tray.cards).toHaveCount(names.length);
    for (const name of names)
      await expect(this.tray.getCard(name)).toBeVisible();
  }

  async subsetScope(name: string, count: number) {
    await expect(this.tray.scope).toContainText(name);
    await expect(this.tray.scope).toContainText(
      new RegExp(`(?<!\\d)${count}(?!\\d)\\s*sample${count === 1 ? "" : "s"}`),
    );
  }

  async outsideResults(count: number) {
    await expect(this.tray.locator).toContainText(
      new RegExp(
        `(?<!\\d)${count}(?!\\d)\\s*sample${count === 1 ? "" : "s"} not in current results`,
      ),
    );
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
