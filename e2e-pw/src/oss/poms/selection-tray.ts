import { Locator, Page, expect } from "src/oss/fixtures";
import { EventCondition, EventUtils } from "src/shared/event-utils";

const TRAY_SHOWN = "e2e:selection:tray-shown";
const SCOPE_SHOWN = "e2e:selection:scope-shown";
const SUBSETS_LISTED = "e2e:selection:subsets-listed";
const SUBSET_JOB = "e2e:selection:subset-job";
const TAGS_SHOWN = "e2e:selection:tags-shown";
const SAVED_SEGMENTS_SHOWN = "e2e:selection:saved-segments-shown";

/** Detail of `e2e:selection:tray-shown`: what the tray has committed */
export interface TrayShown {
  readonly loading: boolean;
  readonly explicit: boolean;
  readonly error: string | null;
  readonly cards: number;
  /** Captures per bucket, comma separated */
  readonly buckets: string;
  readonly episodes: number;
  readonly fullEpisodes: number;
  readonly segments: number;
  readonly segmentEpisodes: number;
  readonly groups: number;
  readonly outside: number;
}

/** Detail of `e2e:selection:scope-shown`: the samples tab's scope trigger */
interface ScopeShown {
  readonly label: string;
  readonly facet: string;
  readonly count: string;
}

interface TagsShown {
  readonly target: string;
  readonly busy: boolean;
  readonly all: string;
  readonly error: string | null;
}

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

  /**
   * Run `action` and resolve once the tray has settled (not loading) on a
   * state `matches` accepts because of it
   */
  async afterTray<T>(
    matches: (shown: TrayShown) => boolean,
    action: () => Promise<T>,
  ): Promise<T> {
    return this.eventUtils.after(TRAY_SHOWN, action, (e) => {
      const shown = e.detail as TrayShown;
      return !shown.loading && matches(shown);
    });
  }

  /** {@link afterTray} for `count` captures in the target bucket */
  async afterSelected<T>(count: number, action: () => Promise<T>) {
    return this.afterTray(
      (shown) => shown.explicit && shown.cards === count,
      action,
    );
  }

  /**
   * {@link afterTray} for the tray targeting all current results, counted as
   * `count` parents when given
   */
  async afterResults<T>(action: () => Promise<T>, count?: number) {
    return this.afterTray(
      (shown) =>
        !shown.explicit && (count === undefined || shown.episodes === count),
      action,
    );
  }

  /** {@link afterTray} for buckets holding `sizes` captures ("1,1") */
  async afterBuckets<T>(sizes: string, action: () => Promise<T>) {
    return this.afterTray((shown) => shown.buckets === sizes, action);
  }

  /** The tray settles on its own as a page loads; resolve once `matches` */
  async untilTray(matches: (shown: TrayShown) => boolean) {
    const settled = (shown?: unknown) =>
      !!shown && !(shown as TrayShown).loading && matches(shown as TrayShown);
    await this.eventUtils.untilState(
      TRAY_SHOWN,
      async () =>
        settled((await this.eventUtils.latest([TRAY_SHOWN]))[TRAY_SHOWN]),
      (e) => settled(e.detail),
    );
  }

  /**
   * The scope trigger names `label` with its count loaded — exactly
   * `expected.count`, and `expected.facet`, when given
   */
  scopeShown(expected: {
    label: string;
    count?: string;
    facet?: string;
  }): EventCondition {
    return {
      events: SCOPE_SHOWN,
      predicate: (e) => {
        const shown = e.detail as ScopeShown;
        return (
          shown.label === expected.label &&
          (expected.count === undefined
            ? shown.count !== ""
            : shown.count === expected.count) &&
          (expected.facet === undefined || shown.facet === expected.facet)
        );
      },
    };
  }

  /** Run `action` and resolve once {@link scopeShown} holds because of it */
  async afterScope<T>(
    expected: { label: string; count?: string; facet?: string },
    action: () => Promise<T>,
  ): Promise<T> {
    const { events, predicate } = this.scopeShown(expected);
    return this.eventUtils.after(events, action, predicate);
  }

  /**
   * A grid tile's saved-segment badge has loaded `count` segments, titled to
   * match `title`, when given
   */
  savedSegmentsShown(expected: {
    count?: number;
    title?: RegExp;
  }): EventCondition {
    return {
      events: SAVED_SEGMENTS_SHOWN,
      predicate: (e) => {
        const shown = e.detail as {
          count: number;
          loading: boolean;
          title: string;
        };
        return (
          !shown.loading &&
          (expected.count === undefined || shown.count === expected.count) &&
          (expected.title === undefined || expected.title.test(shown.title))
        );
      },
    };
  }

  private async afterTags<T>(
    matches: (shown: TagsShown) => boolean,
    action: () => Promise<T>,
  ): Promise<T> {
    return this.eventUtils.after(TAGS_SHOWN, action, (e) =>
      matches(e.detail as TagsShown),
    );
  }

  private get tagTrigger() {
    return this.locator.getByRole("button", { name: "Tag", exact: true });
  }

  async clear() {
    await this.locator.getByRole("button", { name: "Clear selection" }).click();
  }

  async undo() {
    await this.locator.getByRole("button", { name: "Undo" }).click();
  }

  private async createTag(tag: string) {
    await this.page
      .getByRole("textbox", { name: "Create or find tag" })
      .fill(tag);
    await this.afterTags(
      (shown) => !shown.busy && shown.all.split("\n").includes(tag),
      () => this.page.getByRole("button", { name: `Create “${tag}”` }).click(),
    );
    expect(
      await this.page
        .getByRole("button", { name: tag, exact: true })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  }

  async tagSamples(tag: string) {
    await this.openTagPicker();
    await this.createTag(tag);
    await this.closeTagPicker();
  }

  /** Open the tag picker, resolving once it has read the scope's tags */
  async openTagPicker() {
    await this.afterTags(
      (shown) => !shown.busy,
      () => this.tagTrigger.click(),
    );
  }

  async closeTagPicker() {
    await this.tagTrigger.click();
  }

  /** Switch the open tag picker to label tags, once it has read them */
  async chooseLabelTags() {
    await this.afterTags(
      (shown) => shown.target === "labels" && !shown.busy,
      () => this.page.getByRole("radio", { name: "Labels" }).click(),
    );
  }

  async tagLabels(tag: string) {
    await this.openTagPicker();
    await this.chooseLabelTags();
    await this.createTag(tag);
    await this.closeTagPicker();
  }

  /** Add a second bucket, which becomes the empty target */
  async addBucket() {
    await this.afterTray(
      (shown) => shown.buckets.split(",").length === 2,
      () =>
        this.locator.getByRole("button", { name: "Sort into buckets" }).click(),
    );
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

  /**
   * Open the scope picker, resolving once its subsets have listed (`count`
   * of them, when given)
   */
  async openScope(count?: number) {
    await this.eventUtils.after(
      SUBSETS_LISTED,
      () => this.scope.click(),
      (e) =>
        count === undefined || (e.detail as { count: number }).count === count,
    );
  }

  /** The scope trigger as last committed */
  private async currentScope(): Promise<ScopeShown | undefined> {
    const shown = (await this.eventUtils.latest([SCOPE_SHOWN]))[SCOPE_SHOWN];
    return shown as unknown as ScopeShown | undefined;
  }

  /** Browse every sample; a no-op when the scope already does */
  async chooseAllSamples() {
    if ((await this.currentScope())?.label === "All samples") return;
    await this.openScope();
    await this.afterScope({ label: "All samples" }, () =>
      this.page.getByTestId("samples-scope-all").click(),
    );
  }

  /**
   * Browse the saved subset `name` (its `kind` row, when it offers several),
   * resolving once the trigger shows it with `count` when given
   */
  async chooseSubset(name: string, kind?: string, count?: string) {
    const current = await this.currentScope();
    await this.openScope();
    const choice = this.subsetChoices(name);
    const choose = () =>
      (kind ? choice.filter({ hasText: kind }) : choice).click();
    // re-choosing the scope already browsed changes nothing to wait on
    if (
      current?.label === name &&
      (kind === undefined || current.facet === kind) &&
      (count === undefined || current.count === count)
    ) {
      await choose();
      return;
    }
    await this.afterScope({ label: name, count, facet: kind }, choose);
  }

  /**
   * Save the current scope as the new subset `name`, resolving once its
   * members are saved
   */
  async createSubset(
    name: string,
    groupScope?: "Selected samples" | "All slices of these groups",
  ) {
    // outside a subset the action lists subsets first; inside one it is the form
    const listed =
      (await this.locator
        .getByRole("button", { name: "Add to subset", exact: true })
        .count()) > 0;
    await this.locator
      .getByRole("button", { name: /^(Add to subset|Save as new subset)$/ })
      .click();
    if (groupScope)
      await this.page.getByRole("radio", { name: groupScope }).click();
    if (listed)
      await this.page
        .getByRole("button", { name: "New subset", exact: true })
        .click();
    await this.page
      .getByRole("textbox", { name: "New subset name" })
      .fill(name);
    await this.afterSaved(name, () =>
      this.page.getByRole("button", { name: "Create subset" }).click(),
    );
  }

  private async afterSaved<T>(name: string, action: () => Promise<T>) {
    return this.eventUtils.after(SUBSET_JOB, action, (e) => {
      const job = e.detail as { subsetName: string; result: boolean };
      return job.subsetName === name && job.result;
    });
  }

  /** Browse the subset just saved as `name`, showing `count` when given */
  async openCreatedSubset(name: string, count?: string) {
    await this.afterScope({ label: name, count }, () =>
      this.page.getByRole("button", { name: "Open subset" }).click(),
    );
  }

  /** Add the current scope to the saved subset `name` */
  async addToSubset(name: string) {
    await this.locator.getByRole("button", { name: "Add to subset" }).click();
    await this.afterSaved(name, () =>
      this.page
        .getByRole("button", {
          name: new RegExp(`^${escapeRegex(name)}(?:\\s|$)`),
        })
        .click(),
    );
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

  private async text() {
    return (await this.tray.locator.textContent()) ?? "";
  }

  async contains(text: string | RegExp) {
    const shown = await this.text();
    if (typeof text === "string") expect(shown).toContain(text);
    else expect(shown).toMatch(text);
  }

  async targetsAllResults() {
    await this.contains("Act on all samples in the grid");
  }

  async selectedSamples(count: number) {
    await this.contains(
      new RegExp(
        `(?<!\\d)${count}(?!\\d)\\s*sample${count === 1 ? "" : "s"} selected`,
      ),
    );
    expect(await this.tray.cards.count()).toBe(count);
  }

  async cardsHaveNames(names: readonly string[]) {
    expect(await this.tray.cards.count()).toBe(names.length);
    for (const name of names)
      expect(await this.tray.getCard(name).isVisible()).toBe(true);
  }

  async noCards() {
    expect(await this.tray.cards.count()).toBe(0);
  }

  async scopeContains(text: string | RegExp) {
    const shown = (await this.tray.scope.textContent()) ?? "";
    if (typeof text === "string") expect(shown).toContain(text);
    else expect(shown).toMatch(text);
  }

  async subsetScope(name: string, count: number) {
    await this.scopeContains(name);
    await this.scopeContains(
      new RegExp(`(?<!\\d)${count}(?!\\d)\\s*sample${count === 1 ? "" : "s"}`),
    );
  }

  async outsideResults(count: number) {
    await this.contains(
      new RegExp(
        `(?<!\\d)${count}(?!\\d)\\s*sample${count === 1 ? "" : "s"} not in current results`,
      ),
    );
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
