import { Locator, Page, expect } from "src/oss/fixtures";
import { Duration } from "src/oss/utils";

/**
 * The modal sidebar in 'Explore' mode
 */
export class ModalSidebarPom {
  readonly page: Page;
  readonly locator: Locator;
  readonly assert: ModalSidebarAsserter;

  /**
   * Creates an instance of ModalSidebarPom
   *
   * @param page - The Playwright Page object used to locate elements within
   *  the modal sidebar
   */
  constructor(page: Page) {
    this.page = page;

    this.assert = new ModalSidebarAsserter(this);
    this.locator = page.getByTestId("modal").getByTestId("sidebar");
  }

  /**
   * Applies a filter by clicking the checkbox associated with the given label
   *
   * @param label - The label text of the filter checkbox to click
   */
  async applyFilter(label: string) {
    const selectionDiv = this.locator
      .getByTestId("checkbox-" + label)
      .getByTitle(label);
    await selectionDiv.click({ force: true });
  }

  /**
   * Fills a search input for the specified sidebar field and submits by
   * pressing Enter
   *
   * @param field - The field identifier for the search input
   * @param search - The search string to enter
   */
  async applySearch(field: string, search: string) {
    const input = this.locator.getByTestId(`selector-sidebar-search-${field}`);
    await input.fill(search);
    await input.press("Enter");
  }

  /**
   * Clears all active filters for a given sidebar group.
   * @param name - The name of the sidebar group whose filters should be
   *  cleared
   */
  async clearGroupFilters(name: string) {
    return this.locator.getByTestId(`clear-filters-${name}`).click();
  }

  /**
   * Clicks the dropdown arrow for a specified sidebar field to expand or
   * collapse it
   *
   * @param field - The field identifier whose dropdown arrow should be clicked
   */
  async clickFieldDropdown(field: string) {
    return this.locator
      .getByTestId(`sidebar-field-arrow-enabled-${field}`)
      .click();
  }

  /**
   * Returns the locator for the sidebar field container of the specified field
   *
   * @param field - The field identifier to locate
   * @returns A Locator pointing to the sidebar field container element
   */
  getSidebarField(field: string) {
    return this.locator.getByTestId(`sidebar-field-container-${field}`);
  }

  /**
   * Returns the locator for a sidebar entry with the specified key
   *
   * @param key - The key identifier of the sidebar entry
   * @returns A Locator pointing to the sidebar entry element
   */
  getSidebarEntry(key: string) {
    return this.locator.getByTestId(`sidebar-entry-${key}`);
  }

  /**
   * Retrieves the text content of a sidebar entry by its key
   *
   * @param key - The key identifier of the sidebar entry
   * @returns A promise resolving to the text content of the entry, or null if
   *  not found
   */
  async getSidebarEntryText(key: string) {
    return this.getSidebarEntry(key).textContent();
  }

  /**
   * Retrieves the number of sample tags displayed in the sidebar
   * @returns A promise resolving to the sample tag count as a number
   */
  async getSampleTagCount() {
    return Number(await this.getSidebarEntryText("tags"));
  }

  /**
   * Retrieves the total count of label tags from the `_label_tags` field entry
   *
   *  @returns A promise resolving to the label tag count as a number.
   */
  async getLabelTagCount() {
    return Number(
      await this.getSidebarField("_label_tags")
        .getByTestId("entry-count-all")
        .textContent()
    );
  }

  /**
   * Retrieves the ID of the currently displayed sample
   *
   * @returns A promise resolving to the sample ID string, or null if not found
   */
  async getSampleId() {
    return this.getSidebarEntryText("id");
  }

  /**
   * Retrieves the filepath of the currently displayed sample.
   * @param abs - If true (default), returns the absolute path. If false,
   *  returns only the filename.
   * @returns A promise resolving to the filepath string
   */
  async getSampleFilepath(abs = true) {
    const absPath = await this.getSidebarEntryText("filepath");

    if (!abs) {
      return absPath.split("/").at(-1);
    }

    return absPath;
  }

  /**
   * Hovers over a sidebar field and clicks the quick edit button to open
   * inline editing
   *
   * @param field - The field identifier to quick edit
   */
  async quickEdit(field: string) {
    const locator = this.getSidebarField(field);
    await locator.hover();
    await locator.getByTestId("quick-edit").click();
  }

  /**
   * Switches the sidebar between "annotate" and "explore" modes
   *
   * @param mode - The mode to switch to, either "annotate" or "explore"
   */
  async switchMode(mode: "annotate" | "explore") {
    await this.locator.getByTestId(mode).click();
  }

  /**
   * Toggles the checkbox for a specific label field in the sidebar
   *
   * @param field - The field identifier whose label checkbox should be toggled
   */
  async toggleLabelCheckbox(field: string) {
    await this.locator.getByTestId(`checkbox-${field}`).click();
  }

  /**
   * Toggles the expansion state of a sidebar group by clicking its header
   * entry
   *
   * @param name - The name of the sidebar group to expand or collapse
   */
  async toggleSidebarGroup(name: string) {
    await this.locator.getByTestId(`sidebar-group-entry-${name}`).click();
  }
}

/**
 * The modal sidebar asserter in 'Explore' mode
 */
class ModalSidebarAsserter {
  /**
   * Creates an instance of SidebarAsserter.
   *
   * @param modalSidebarPom - The ModalSidebarPom instance used to access
   *  sidebar elements
   */
  constructor(private readonly modalSidebarPom: ModalSidebarPom) {}

  /**
   * Asserts that a sidebar entry's text content matches the expected value.
   * @param key - The key identifier of the sidebar entry.
   * @param value - The expected text content.
   */
  async verifySidebarEntryText(key: string, value: string) {
    const text = await this.modalSidebarPom.getSidebarEntryText(key);
    expect(text).toBe(value);
  }

  /**
   * Waits until a sidebar entry's text content equals the expected value, with
   * a 5-second timeout.
   *
   * @param key - The key identifier of the sidebar entry to watch
   * @param value - The expected text content to wait for
   * @returns A promise that resolves when the entry text matches the expected value
   */
  async waitUntilSidebarEntryTextEquals(key: string, value: string) {
    return this.modalSidebarPom.page.waitForFunction(
      ({ key_, value_ }: { key_: string; value_: string }) => {
        return (
          document.querySelector(`[data-cy='sidebar-entry-${key_}']`)
            .textContent === value_
        );
      },
      { key_: key, value_: value },
      { timeout: 5000 }
    );
  }

  /**
   * Waits until multiple sidebar entries each match their expected text values
   * concurrently
   *
   * @param entries - A map of sidebar entry keys to their expected text
   *  content values
   * @returns A promise that resolves when all entries match their expected
   *  values
   */
  async waitUntilSidebarEntryTextEqualsMultiple(entries: {
    [key: string]: string;
  }) {
    await Promise.all(
      Object.entries(entries).map(([key, value]) =>
        this.waitUntilSidebarEntryTextEquals(key, value)
      )
    );
  }

  /**
   * Asserts that multiple sidebar entries each match their expected text
   * content values
   *
   * @param entries - A map of sidebar entry keys to their expected text
   *  content values
   */
  async verifySidebarEntryTexts(entries: { [key: string]: string }) {
    await Promise.all(
      Object.entries(entries).map(([key, value]) =>
        this.verifySidebarEntryText(key, value)
      )
    );
  }

  /**
   * Waits until the sample tag count in the sidebar equals the expected count,
   * with a 1-second timeout
   *
   * @param count - The expected number of sample tags
   */
  async verifySampleTagCount(count: number) {
    await this.modalSidebarPom.page.waitForFunction(
      (count_) => {
        return (
          Number(
            document.querySelector("#modal [data-cy='sidebar-entry-tags']")
              .textContent
          ) === count_
        );
      },
      count,
      {
        timeout: Duration.Seconds(1),
      }
    );
  }

  /**
   * Asserts that a sidebar entry for the given key contains the expected
   * key-value pairs, verifying both the key and value elements are rendered
   * with the correct text
   *
   * @param key - The key identifier of the sidebar entry containing the object
   * @param obj - A map of key-value pairs expected to be present in the
   *  sidebar entry
   */
  async verifyObject(key: string, obj: { [key: string]: string }) {
    const locator = this.modalSidebarPom.getSidebarEntry(key);

    for (const k in obj) {
      const v = obj[k];
      const entry = locator.getByTestId(`key-value-${k}-${v}`);

      await expect(entry.getByTestId(`key-${k}`)).toHaveText(k);
      await expect(entry.getByTestId(`value-${v}`)).toHaveText(v);
    }
  }

  /**
   * Waits until the label tag count in the sidebar equals the expected count,
   * with a 1-second timeout.
   *
   * @param count - The expected number of label tags
   */
  async verifyLabelTagCount(count: number) {
    await this.modalSidebarPom.page.waitForFunction(
      (count_) => {
        return (
          Number(
            document.querySelector(
              "#modal [data-cy='sidebar-field-container-_label_tags'] [data-cy='entry-count-all']"
            ).textContent
          ) === count_
        );
      },
      count,
      {
        timeout: Duration.Seconds(1),
      }
    );
  }

  /**
   * Assert that annotation is disabled with a specific message
   */
  async hasDisabledMessage(messageSubstring: string) {
    await expect(
      this.modalSidebarPom.locator.getByText(messageSubstring)
    ).toBeVisible();
  }
}
