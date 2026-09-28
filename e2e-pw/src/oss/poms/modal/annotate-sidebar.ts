import { expect, Locator, Page } from "src/oss/fixtures";
import { collapseWhitespace } from "src/oss/utils";
import { EventUtils } from "src/shared/event-utils";

/**
 * The modal sidebar's main listing view when in 'Annotate' mode
 */
export class ModalAnnotateSidebarPom {
  readonly page: Page;
  readonly locator: Locator;
  readonly assert: ModalAnnotateSidebarAsserter;
  readonly annotationSliceSelector: Locator;
  readonly annotationSliceResultsContainer: Locator;

  constructor(
    page: Page,
    private readonly eventUtils: EventUtils,
  ) {
    this.page = page;
    this.assert = new ModalAnnotateSidebarAsserter(this);
    this.locator = page.getByTestId("modal").getByTestId("sidebar");
    this.annotationSliceSelector = this.locator.getByTestId(
      "selector-annotation-slice",
    );
    this.annotationSliceResultsContainer = page.getByTestId(
      "selector-results-container-annotation-slice",
    );
  }

  /** Label rows of the active-labels list, each carrying `data-cy-label` / `data-cy-path`. */
  get labelRows(): Locator {
    return this.locator.locator("[data-cy^='annotate-label-']");
  }

  /** Label rows of the field at `path` (e.g. `weather`, `instances`). */
  labelRowsFor(path: string): Locator {
    return this.locator.locator(
      `[data-cy^='annotate-label-'][data-cy-path='${path}']`,
    );
  }

  /** Label rows whose text is `labelText`. */
  labelRow(labelText: string): Locator {
    return this.locator.locator(
      `[data-cy^='annotate-label-'][data-cy-label='${labelText}']`,
    );
  }

  /** The PRIMITIVES row for the field at `path`, carrying `data-cy-read-only`. */
  primitiveEntry(path: string): Locator {
    return this.locator.getByTestId(`annotate-primitive-${path}`);
  }

  /** The formatted value shown on the PRIMITIVES row for `path`. */
  primitiveValue(path: string): Locator {
    return this.primitiveEntry(path).getByTestId("annotate-primitive-value");
  }

  /**
   * Wait for the label list to finish loading after entering annotate mode:
   * the Labels group is shown and no entry is still loading.
   */
  async waitForLabelList() {
    await this.page
      .locator(
        '[data-cy="modal"] [data-cy="sidebar"]:has([data-cy="sidebar-group-Labels-field-count"]):not(:has([data-cy="loading-dots"]))',
      )
      .waitFor({ state: "attached" });
  }

  /**
   * Get the count of active labels in the sidebar
   *
   * @returns A promise that resolves to the number of active labels
   */
  async getActiveLabelsCount() {
    return Number(
      await this.locator
        .getByTestId("sidebar-group-Labels-field-count")
        .textContent(),
    );
  }

  /**
   * Get the count of active primitive fields in the sidebar
   *
   * @returns A promise that resolves to the number of active primitive fields
   */
  async getActivePrimitiveFieldsCount() {
    return Number(
      await this.locator
        .getByTestId("sidebar-group-PRIMITIVES-field-count")
        .textContent(),
    );
  }

  /**
   * Wait until every annotation edit has been persisted (no pending deltas,
   * no in-flight patch). Call this before handing off to a fresh load (or
   * ending a test whose edits a sibling depends on); a navigation that lands
   * earlier destroys the pending save.
   */
  async waitForSavesSettled() {
    // every autosave tick ends in this event once nothing is left to save
    await this.eventUtils.next("annotation:persistenceSettled");
  }

  /**
   * Run `action` and resolve once the edit it makes has been written and
   * nothing is left to save: the write is the edit's cause-signal, and the
   * settled pass after it proves no later edit is still pending.
   */
  async afterSave<T>(action: () => Promise<T>): Promise<T> {
    // a pass that writes the edit sends success, then settled in the same pass
    return this.eventUtils.afterSequence(
      ["annotation:persistenceSuccess", "annotation:persistenceSettled"],
      action,
    );
  }

  /**
   * Select an active label by name and position
   *
   * @param label The label name to select
   * @param position The position index when multiple labels with the same name exist
   */
  async selectActiveLabel(label: string, position: number) {
    await this.locator
      .getByTestId("sidebar-field")
      .getByText(label)
      .nth(position)
      .click();
  }

  /**
   * Select an active primitive field by field name
   *
   * @param field The primitive field name to select
   */
  async selectActivePrimitiveField(field: string) {
    await this.locator.getByTestId(`${field}-field`).click();
  }

  /**
   * Toggle the active labels section in the sidebar
   */
  async toggleActiveLabels() {
    await this.locator.getByTestId("sidebar-group-Labels-toggle").click();
  }

  /**
   * Toggle the active primitive fields section in the sidebar
   */
  async toggleActivePrimitiveFields() {
    await this.locator.getByTestId("sidebar-group-PRIMITIVES-toggle").click();
  }

  /**
   * Opens the annotation slice selector results menu.
   */
  async openAnnotationSliceResults() {
    await this.annotationSliceSelector.click();
    await this.annotationSliceResultsContainer.waitFor();
    return this.annotationSliceResultsContainer;
  }

  /**
   * Returns the slice names currently available in the annotation slice selector.
   */
  async getAvailableAnnotationSlices() {
    const resultsContainer = await this.openAnnotationSliceResults();
    const slices = await resultsContainer.evaluate((div) =>
      Array.from(div.querySelectorAll("[data-cy^='selector-result-']")).map(
        (node) => (node as HTMLElement).innerText,
      ),
    );

    await this.page.keyboard.press("Escape");

    return slices;
  }

  /**
   * Selects a slice from the annotation slice selector.
   *
   * @param slice The slice name to select
   */
  async selectAnnotationSlice(slice: string) {
    // a 3D slice becomes selectable once the group's samples load, and the
    // option list is computed when it opens, so open it only after that
    await this.locator
      .locator(
        `[data-cy="annotation-slice-selector"][data-cy-selectable-slices~="${slice}"]`,
      )
      .waitFor({ state: "attached" });
    await this.annotationSliceSelector.click();
    await this.annotationSliceResultsContainer
      .getByTestId(`selector-result-${slice}`)
      .click();

    expect(await this.annotationSliceSelector.inputValue()).toBe(slice);
  }

  /**
   * Resolves on the next successful PATCH to the per-sample dataset
   * endpoint. Only for asserting on the request itself (which sample it
   * targets); to wait for an edit to persist, use {@link afterSave}.
   */
  waitForPatch() {
    return this.page.waitForResponse(
      (resp) =>
        resp.request().method() === "PATCH" &&
        /\/dataset\/[^/]+\/sample\//.test(resp.url()) &&
        resp.status() < 400,
    );
  }

  /**
   * Click the Select action button
   */
  async selectAction() {
    await this.page.getByTestId("select-action").click();
  }

  /**
   * Click the Classification action button
   */
  async createClassification() {
    await this.page.getByTestId("create-classification").click();
  }

  /**
   * Activate detection mode for a label type (e.g. "Detections")
   *
   * @param labelType The label type to activate detection mode for
   */
  async detectionMode(labelType: "Detections") {
    if (labelType === "Detections") {
      await this.page.getByTestId("detection-mode").click();
    }
  }

  /** Activate polyline-drawing mode (the Polyline action button). */
  async polylineMode() {
    await this.page.getByTestId("polyline-mode").click();
  }

  /**
   * Toggle segmentation mode: when inactive this enters it (selecting the
   * Select tool by default), when active it leaves it.
   */
  async segmentationMode() {
    await this.page.getByTestId("segmentation-mode").click();
  }

  /**
   * The Voodo segmentation toolbar lives in a portal. Buttons are tagged with
   * `aria-label="Select" | "Brush" | "Pen" | "AI" | "Merge"` (and likewise for
   * mode/shape sub-groups).
   */
  private toolbarButton(label: string) {
    return this.page.getByRole("button", { name: label, exact: true });
  }

  /**
   * Switch to a segmentation tool from the floating segmentation toolbar.
   *
   * Requires `segmentationMode()` to have been called first.
   */
  async pickTool(tool: "Select" | "Brush" | "Pen" | "AI" | "Merge") {
    await this.toolbarButton(tool).click();
  }

  /**
   * Switch the brush paint mode in the segmentation toolbar's "mode" group:
   * "Add" paints into the mask, "Remove" erases from it. The mode group only
   * renders while the Brush or Pen tool is active.
   */
  async pickMaskMode(mode: "Add" | "Remove") {
    await this.toolbarButton(mode).click();
  }
}

/**
 * Asserter class for the modal's sidebar when in 'Annotate' mode
 */
class ModalAnnotateSidebarAsserter {
  constructor(private readonly modalAnnotateSidebar: ModalAnnotateSidebarPom) {}

  /**
   * Verify the count shown on the sidebar's Labels group
   *
   * @param count The expected number of active labels
   */
  async hasActiveLabelsCount(count: number) {
    expect(await this.modalAnnotateSidebar.getActiveLabelsCount()).toBe(count);
  }

  /**
   * Verify that the active labels section is expanded
   */
  async verifyActiveLabelsIsExpanded() {
    expect(await this.toggleIcon("Labels")).toBe("RemoveIcon");
  }

  /**
   * Verify that the active labels section is collapsed
   */
  async verifyActiveLabelsIsCollapsed() {
    expect(await this.toggleIcon("Labels")).toBe("AddIcon");
  }

  /** The field at `path` lists exactly `count` label rows. */
  async labelRowCount(path: string, count: number) {
    expect(await this.modalAnnotateSidebar.labelRowsFor(path).count()).toBe(
      count,
    );
  }

  /** The PRIMITIVES row for `path` shows `value`. */
  async primitiveValue(path: string, value: string) {
    expect(
      collapseWhitespace(
        await this.modalAnnotateSidebar.primitiveValue(path).textContent(),
      ),
    ).toBe(value);
  }

  /** The PRIMITIVES row for `path` is (not) editable. */
  async primitiveReadOnly(path: string, readOnly: boolean) {
    expect(
      await this.modalAnnotateSidebar
        .primitiveEntry(path)
        .getAttribute("data-cy-read-only"),
    ).toBe(readOnly ? "true" : "false");
  }

  /**
   * Verify that the active primitive fields section is expanded
   */
  async verifyActivePrimitiveFieldsIsExpanded() {
    expect(await this.toggleIcon("PRIMITIVES")).toBe("RemoveIcon");
  }

  /**
   * Verify that the active primitive fields section is collapsed
   */
  async verifyActivePrimitiveFieldsIsCollapsed() {
    expect(await this.toggleIcon("PRIMITIVES")).toBe("AddIcon");
  }

  /**
   * Verify the count of active labels matches the expected count
   *
   * @param expectedCount The expected number of active labels
   */
  async verifyActiveLabelsCount(expectedCount: number) {
    expect(await this.modalAnnotateSidebar.getActiveLabelsCount()).toBe(
      expectedCount,
    );
  }

  /**
   * Verify the count of active primitive fields matches the expected count
   *
   * @param expectedCount The expected number of active primitive fields
   */
  async verifyActivePrimitiveFieldsCount(expectedCount: number) {
    expect(
      await this.modalAnnotateSidebar.getActivePrimitiveFieldsCount(),
    ).toBe(expectedCount);
  }

  /** The icon a sidebar group's toggle shows (its expanded state). */
  private toggleIcon(group: "Labels" | "PRIMITIVES") {
    return this.modalAnnotateSidebar.locator
      .getByTestId(`sidebar-group-${group}-toggle`)
      .getAttribute("data-testid");
  }

  /**
   * Verify that the annotation slice selector exposes exactly the expected slices.
   *
   * @param expectedSlices The slice names that should be available
   */
  async verifyAvailableAnnotationSlices(expectedSlices: string[]) {
    const actualSlices =
      await this.modalAnnotateSidebar.getAvailableAnnotationSlices();
    expect(actualSlices).toStrictEqual(expectedSlices);
  }

  /**
   * Verify that the annotation slice selector currently has the expected slice selected.
   *
   * @param expectedSlice The slice name that should be active
   */
  async verifySelectedAnnotationSlice(expectedSlice: string) {
    expect(
      await this.modalAnnotateSidebar.annotationSliceSelector.inputValue(),
    ).toBe(expectedSlice);
  }

  /**
   * Assert that the Select action is active or inactive
   *
   * @param active Whether the select action should be active (default true)
   */
  async selectIsActive(active = true) {
    const button = this.modalAnnotateSidebar.page.getByTestId("select-action");
    expect(await button.getAttribute("data-cy-active")).toBe(String(active));
  }

  /**
   * Assert that the Classification action is active or inactive
   *
   * @param active Whether the classification action should be active (default true)
   */
  async classificationIsActive(active = true) {
    const button = this.modalAnnotateSidebar.page.getByTestId(
      "create-classification",
    );
    expect(await button.getAttribute("data-cy-active")).toBe(String(active));
  }

  /**
   * Assert that detection mode is active or inactive
   *
   * @param active Whether detection mode should be active (default true)
   */
  async detectionModeIsActive(active = true) {
    const button = this.modalAnnotateSidebar.page.getByTestId("detection-mode");
    expect(await button.getAttribute("data-cy-active")).toBe(String(active));
  }

  /**
   * Assert that segmentation mode is active or inactive
   *
   * @param active Whether segmentation mode should be active (default true)
   */
  async segmentationModeIsActive(active = true) {
    const button =
      this.modalAnnotateSidebar.page.getByTestId("segmentation-mode");
    expect(await button.getAttribute("data-cy-active")).toBe(String(active));
  }

  /**
   * Assert that polyline mode is active or inactive
   *
   * @param active Whether polyline mode should be active (default true)
   */
  async polylineModeIsActive(active = true) {
    const button = this.modalAnnotateSidebar.page.getByTestId("polyline-mode");
    expect(await button.getAttribute("data-cy-active")).toBe(String(active));
  }

  /**
   * Assert that a given segmentation tool button is currently the active one
   * in the floating toolbar.
   *
   * @param tool The tool that should be active
   */
  async toolIsActive(tool: "Select" | "Brush" | "Pen" | "AI" | "Merge") {
    // Voodo's ToolbarAction reflects the `active` prop as an attribute on the
    // <button>. We don't depend on Voodo's internal class names: aria-pressed
    // is the closest standard signal.
    const button = this.modalAnnotateSidebar.page.getByRole("button", {
      name: tool,
      exact: true,
    });
    expect(await button.getAttribute("aria-pressed")).toBe("true");
  }
}
