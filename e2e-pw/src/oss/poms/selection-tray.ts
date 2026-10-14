import { Locator, Page, expect } from "src/oss/fixtures";
import { collapseWhitespace } from "src/oss/utils";
import { EventUtils } from "src/shared/event-utils";

const SETTLED = "e2e:selection-tray:settled";
const SCOPE_SHOWN = "e2e:selection-scope:shown";
const SUBSETS_LISTED = "e2e:subsets:listed";
const SUBSETS_DELETED = "e2e:subsets:deleted";
const JOB_SETTLED = "e2e:subset-job:settled";
const TAGS_APPLIED = "e2e:tags:applied";

type Settled = { cards: number; settled: boolean; outside: number };
type ScopeShown = { label: string; subset: boolean };

/** The grid's persistent action bar, captured cards, and saved scope picker. */
export class SelectionTrayPom {
  readonly locator: Locator;
  readonly assert: SelectionTrayAsserter;

  constructor(
    private readonly page: Page,
    private readonly eventUtils: EventUtils,
  ) {
    this.locator = page.getByRole("region", { name: "Selection" });
    this.assert = new SelectionTrayAsserter(this);
  }

  get scope() {
    return this.page.getByTestId("samples-scope-trigger");
  }

  get entryCounts() {
    return this.page.getByTestId("entry-counts");
  }

  /** The open subset's note on the saved queries it was captured from */
  get subsetSource() {
    return this.page.getByTestId("samples-scope-subset-source");
  }

  subsetChoices(name: string) {
    return this.page
      .locator('[data-cy^="samples-scope-subset-"]')
      .filter({ hasText: name });
  }

  get cards() {
    return this.locator.getByRole("article");
  }

  async getSelectedSampleNames() {
    const buttons = await this.cards
      .getByRole("button", { name: /^Open / })
      .all();
    return Promise.all(
      buttons.map(async (button) =>
        (await button.getAttribute("aria-label"))!.replace(/^Open /, ""),
      ),
    );
  }

  /** The cards of one section of the split tray */
  section(name: string) {
    return this.locator.getByRole("group", {
      name: `Selected samples in ${name}`,
    });
  }

  /** File names of the cards in one section, in order */
  async sectionCardNames(name: string) {
    const labels = await this.section(name)
      .getByRole("article")
      .evaluateAll((cards) =>
        cards.map((card) => card.getAttribute("aria-label") ?? ""),
      );
    return labels.map((label) => label.replace(/, Sample$/, ""));
  }

  /**
   * Run `action` and resolve once the tray has settled on `cards` titled
   * cards and, when given, `outside` of them outside the current results
   */
  afterSettled<T>(
    action: () => Promise<T>,
    { cards, outside = 0 }: { cards: number; outside?: number },
  ): Promise<T> {
    return this.eventUtils.after(SETTLED, action, (e) => {
      const detail = e.detail as Settled;
      return (
        detail.settled && detail.cards === cards && detail.outside === outside
      );
    });
  }

  /**
   * Resolve once the tray, with nothing captured, has loaded the results it
   * acts on, and when given, shows that `summary` of them. With nothing
   * selected the tray is quiet unless the results are segments, so only its
   * last settle tells loaded from loading.
   */
  async untilSettledEmpty(summary?: string) {
    const isSettledEmpty = (detail: unknown) => {
      const settled = detail as Settled;
      return settled.settled && settled.cards === 0;
    };
    await this.eventUtils.untilState(
      SETTLED,
      async () => {
        const latest = (await this.eventUtils.recorded(SETTLED)).at(-1);
        return (
          latest !== undefined &&
          isSettledEmpty(latest) &&
          (summary === undefined ||
            (await this.locator.getByText(summary, { exact: true }).count()) ===
              1)
        );
      },
      (e) => isSettledEmpty(e.detail),
    );
    if (summary !== undefined)
      expect(
        await this.locator.getByText(summary, { exact: true }).count(),
      ).toBe(1);
  }

  /** Clear one kind in a mixed selection, retaining the other cards. */
  async clearKind(kind: string, cards: number) {
    await this.afterSettled(
      () =>
        this.locator
          .getByRole("button", { name: `Clear selected ${kind}`, exact: true })
          .click(),
      { cards },
    );
  }

  async clear() {
    await this.afterSettled(
      () =>
        this.locator.getByRole("button", { name: "Clear selection" }).click(),
      { cards: 0 },
    );
  }

  /** Undo the tray's last change, which leaves `cards` cards */
  async undo(cards: number) {
    await this.afterSettled(
      () => this.locator.getByRole("button", { name: "Undo" }).click(),
      { cards },
    );
  }

  /** Redo the change an undo took back, which leaves `cards` cards */
  async redo(cards: number) {
    await this.afterSettled(
      () => this.locator.getByRole("button", { name: "Redo" }).click(),
      { cards },
    );
  }

  /**
   * Tag the selected samples with a new tag. With nothing selected, the
   * picker tags every result only once `allInView` consents to it
   */
  async tagSamples(tag: string, { allInView = false } = {}) {
    await this.openTagPicker({ allInView });
    await this.createTag(tag);
    await this.closeTagPicker();
  }

  /** Add a tag the dataset already has to the selected samples */
  async addExistingTag(tag: string) {
    await this.openTagPicker();
    await this.page
      .getByRole("group", { name: tag, exact: true })
      .getByRole("button", { name: "Add", exact: true })
      .click();
    await this.applyTags(tag);
    await this.closeTagPicker();
  }

  async openTagPicker({ allInView = false } = {}) {
    await this.locator
      .getByRole("button", { name: "Tag", exact: true })
      .click();
    await expect(
      this.page.getByRole("textbox", { name: "Create or find tag" }),
    ).toBeVisible();
    if (allInView)
      await this.page
        .getByRole("button", { name: /^Tag all .* in view$/ })
        .click();
  }

  /** Close the tag picker with its own Done; the Tag button only opens it */
  async closeTagPicker() {
    await this.page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(
      this.page.getByRole("textbox", { name: "Create or find tag" }),
    ).toBeHidden();
  }

  /** Tag the labels of the selected samples, or of every result */
  async tagLabels(tag: string, { allInView = false } = {}) {
    await this.openTagPicker({ allInView });
    await this.page.getByRole("radio", { name: "Labels" }).click();
    await this.createTag(tag);
    await this.closeTagPicker();
  }

  /** Create `tag` in the open picker and apply it */
  private async createTag(tag: string) {
    // the field enables once the picker has loaded its targets' tags
    await this.page
      .getByRole("textbox", { name: "Create or find tag" })
      .fill(tag);
    await this.page.getByRole("button", { name: `Create “${tag}”` }).click();
    await this.applyTags(tag);
  }

  /** Apply the staged change to `tag`, resolving once it has been written */
  private async applyTags(tag: string) {
    // staging is local to the picker: the row offers to undo it at once
    await expect(
      this.page
        .getByRole("group", { name: tag, exact: true })
        .getByRole("button", { name: "Undo", exact: true }),
    ).toBeVisible();
    await this.eventUtils.after(TAGS_APPLIED, () =>
      this.page.getByRole("button", { name: /^Apply to / }).click(),
    );
  }

  /** Split the tray into sections; the first keeps what is picked */
  async split() {
    await this.locator
      .getByRole("button", {
        name: "Create splits and select into multiple sections",
      })
      .click();
    await expect(
      this.locator.getByRole("group", { name: "Selection sections" }),
    ).toBeVisible();
  }

  /** Make one section active, so clicks land there and actions apply there */
  async activateSection(name: string) {
    const section = this.locator.getByRole("region", {
      name: new RegExp(`^${escapeRegex(name)},`),
    });
    await section.getByRole("button", { name, exact: true }).click();
    // component-only: being active is the section's own pressed state
    await expect(section).toHaveAttribute("data-active", "true");
  }

  /**
   * Drag the card for `name` from one section onto another, which moves it
   * there, or with `copy` (Alt held) copies it
   */
  async dragCard(
    name: string,
    from: string,
    to: string,
    { copy = false } = {},
  ) {
    const card = (section: string) =>
      this.section(section).getByRole("article", {
        name: new RegExp(`^${escapeRegex(name)},`),
      });
    const target = this.locator.getByRole("region", {
      name: new RegExp(`^${escapeRegex(to)},`),
    });
    if (copy) await this.page.keyboard.down("Alt");
    await card(from).dragTo(target);
    if (copy) await this.page.keyboard.up("Alt");
    // component-only: a drop moves the card between sections in place; nothing loads
    await expect(card(to)).toHaveCount(1);
  }

  /**
   * Point at `target` (a grid tile or a tray card) and press a section's
   * number, which sorts it into that section, or out when it is there,
   * making the section if needed; resolves once `cards` cards have settled
   */
  async sortWithKey(target: Locator, key: number, cards: number) {
    await target.hover();
    await this.afterSettled(() => this.page.keyboard.press(String(key)), {
      cards,
    });
  }

  /** Clear one section, leaving `cards` cards across the others */
  async clearSection(name: string, cards: number) {
    await this.afterSettled(
      () =>
        this.locator
          .getByRole("button", {
            name: new RegExp(`^Clear [\\d,]+ from ${escapeRegex(name)}$`),
          })
          .click(),
      { cards },
    );
  }

  /** Open the scope picker, resolving once its subsets have loaded */
  async openScope() {
    await this.eventUtils.after(SUBSETS_LISTED, () => this.scope.click());
  }

  async chooseAllSamples() {
    await this.openScope();
    await this.eventUtils.after(
      SCOPE_SHOWN,
      () => this.page.getByTestId("samples-scope-all").click(),
      (e) => !(e.detail as ScopeShown).subset,
    );
  }

  async chooseSubset(name: string, kind?: string) {
    await this.openScope();
    const choice = this.subsetChoices(name);
    await this.eventUtils.after(
      SCOPE_SHOWN,
      () => (kind ? choice.filter({ hasText: kind }) : choice).click(),
      (e) => (e.detail as ScopeShown).label === name,
    );
  }

  /**
   * Save the action target as a new subset, resolving once its members
   * have been added. Nothing selected targets every result.
   */
  async createSubset(
    name: string,
    groupScope?: "Selected samples" | "All slices of these groups",
  ) {
    const add = this.locator.getByRole("button", {
      name: "Save as subset",
      exact: true,
    });
    // An open subset offers only a new one; otherwise the existing subsets
    // are listed first
    if (await add.count()) {
      await this.eventUtils.after(SUBSETS_LISTED, () => add.click());
    } else {
      await this.locator
        .getByRole("button", { name: "Save as new subset" })
        .click();
    }
    if (groupScope)
      await this.page.getByRole("radio", { name: groupScope }).click();
    const newSubset = this.page.getByRole("button", {
      name: "New subset",
      exact: true,
    });
    if (await newSubset.count()) await newSubset.click();
    await this.page
      .getByRole("textbox", { name: "New subset name" })
      .fill(name);
    await this.afterJob(() =>
      this.page.getByRole("button", { name: "Save subset" }).click(),
    );
  }

  /** Add the action target to an existing subset */
  async addToSubset(name: string) {
    await this.eventUtils.after(SUBSETS_LISTED, () =>
      this.locator.getByRole("button", { name: "Save as subset" }).click(),
    );
    await this.afterJob(() =>
      this.page
        .getByRole("button", {
          name: new RegExp(`^${escapeRegex(name)}(?:\\s|$)`),
        })
        .click(),
    );
  }

  /** Open the subset a finished add saved to, which starts with no captures */
  async openCreatedSubset() {
    await this.eventUtils.after(
      SCOPE_SHOWN,
      () => this.page.getByRole("button", { name: "Open subset" }).click(),
      (e) => (e.detail as ScopeShown).subset,
    );
  }

  /** Remove the selection from the open subset, which clears the tray */
  async removeSelectedFromSubset() {
    await this.locator
      .getByRole("button", { name: "Remove from subset" })
      .click();
    await this.afterSettled(
      () => this.page.getByRole("button", { name: "Remove selected" }).click(),
      { cards: 0 },
    );
  }

  async deleteSubset(name: string) {
    await this.openScope();
    await this.subsetChoices(name).hover();
    await this.page.getByRole("button", { name: `Edit ${name}` }).click();
    await this.page.getByRole("button", { name: "Delete subset" }).click();
    await expect(
      this.page.getByRole("heading", { name: `Delete ${name}` }),
    ).toBeVisible();
    await this.eventUtils.after(SUBSETS_DELETED, () =>
      this.page.getByRole("button", { name: "Delete subset" }).click(),
    );
  }

  private afterJob(action: () => Promise<void>) {
    return this.eventUtils.after(
      JOB_SETTLED,
      action,
      (e) => (e.detail as { state: string }).state === "completed",
    );
  }
}

const plural = (count: number) => `sample${count === 1 ? "" : "s"}`;

class SelectionTrayAsserter {
  constructor(private readonly tray: SelectionTrayPom) {}

  /** The tag picker is not open */
  async showsNoTagPicker() {
    await expect(
      this.tray.locator
        .page()
        .getByRole("textbox", { name: "Create or find tag" }),
    ).toBeHidden();
  }

  /** Nothing is selected, so actions target every result */
  async targetsAllResults() {
    expect(await this.tray.locator.locator("[data-kind]").count()).toBe(0);
    expect(await this.tray.cards.count()).toBe(0);
  }

  /** The tray counts `count` selected samples and shows a card for each */
  async selectedSamples(count: number) {
    const pill = this.tray.locator.locator("[data-kind]").first();
    expect((await pill.innerText()).replace(/\s+/g, " ").trim()).toBe(
      `${count} ${plural(count)} selected`,
    );
    expect(await this.tray.cards.count()).toBe(count);
  }

  /** The summary pills read exactly `texts`, in order */
  async pills(texts: readonly string[]) {
    const pills = await this.tray.locator
      .locator("[data-kind]")
      .evaluateAll((nodes) =>
        nodes.map((node) => (node as HTMLElement).innerText),
      );
    expect(pills.map((text) => text.replace(/\s+/g, " ").trim())).toEqual(
      texts,
    );
  }

  /** The cards read exactly `labels`, in order: a name and what it holds */
  async cardLabels(labels: readonly string[]) {
    expect(
      await this.tray.cards.evaluateAll((cards) =>
        cards.map((card) => card.getAttribute("aria-label") ?? ""),
      ),
    ).toEqual(labels);
  }

  /** The cards are exactly `names`, in any order */
  async cardsHaveNames(names: readonly string[]) {
    expect([...(await this.tray.getSelectedSampleNames())].sort()).toEqual(
      [...names].sort(),
    );
  }

  async sectionHasCards(section: string, names: readonly string[]) {
    expect(await this.tray.sectionCardNames(section)).toEqual(names);
  }

  /** The tab names the subset, and the grid counts `count` samples in it */
  async subsetScope(name: string, count: number) {
    expect(await this.tray.scope.getByText(name, { exact: true }).count()).toBe(
      1,
    );
    expect(
      (await this.tray.entryCounts.textContent())?.replace(/\s+/g, " ").trim(),
    ).toBe(`${count} ${plural(count)}`);
  }

  /** The scope picker's row for `name` reads exactly `text` */
  async subsetChoiceReads(name: string, text: string) {
    expect(
      collapseWhitespace(await this.tray.subsetChoices(name).innerText()),
    ).toBe(text);
  }

  /** The scope tab describes the open subset as exactly `title` */
  async describesScope(title: string) {
    expect(await this.tray.scope.getAttribute("title")).toBe(title);
  }

  /** The open subset lists the saved queries it was captured from */
  async capturedFrom(text: string) {
    expect(await this.tray.subsetSource.textContent()).toBe(text);
  }

  async outsideResults(count: number) {
    expect(
      await this.tray.locator
        .getByText(`${count} ${plural(count)} not in view`, {
          exact: true,
        })
        .count(),
    ).toBe(1);
  }

  /** The open scope picker lists no saved subsets */
  async listsNoSubsets() {
    expect(await this.tray.subsetChoices("").count()).toBe(0);
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
