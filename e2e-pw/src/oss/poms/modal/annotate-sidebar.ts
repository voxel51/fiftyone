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

  /** Label rows of the field at `path` (e.g. `weather`, `instances`). */
  labelRowsFor(path: string): Locator {
    return this.locator.locator(
      `[data-cy^='annotate-label-'][data-cy-path='${path}']`,
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
   * Run `action` and resolve once the sidebar has swapped the label list for
   * the edit form (`editing`) or back because of it
   */
  async afterEditing<T>(action: () => Promise<T>, editing = true): Promise<T> {
    return this.eventUtils.after("e2e:annotate:editing", action, (e) => {
      return (e.detail as { editing: boolean }).editing === editing;
    });
  }

  /**
   * Run `action` (the switch to annotate) and resolve once the label list it
   * mounts has replaced its loading entry with the labels
   */
  async afterLabelList<T>(action: () => Promise<T>): Promise<T> {
    return this.eventUtils.after("e2e:annotate:label-list-loaded", action);
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
   * Opens the annotation slice selector results menu.
   */
  async openAnnotationSliceResults() {
    await this.eventUtils.after(
      "e2e:components:selector-results",
      () => this.annotationSliceSelector.click(),
      (e) => (e.detail as { cy?: string }).cy === "annotation-slice",
    );
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
    // a 3D slice is listed once the group's samples load; the open list
    // follows, so the result click below waits for it
    await this.annotationSliceSelector.click();
    await this.annotationSliceResultsContainer
      .getByTestId(`selector-result-${slice}`)
      .click();

    expect(await this.annotationSliceSelector.inputValue()).toBe(slice);
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

  /**
   * Toggle polyline-drawing mode (the Polyline action button). Turning it on
   * resolves once its handler is armed: the handler installs in an effect
   * after the mode flips, and clicks before that reach nothing.
   */
  async polylineMode() {
    const button = this.page.getByTestId("polyline-mode");
    if ((await button.getAttribute("data-cy-active")) === "true") {
      await button.click();
      return;
    }
    await this.eventUtils.after(
      "lighter:scene-interactive-mode-changed",
      () => button.click(),
      (e) => (e.detail as { interactiveMode: boolean }).interactiveMode,
    );
  }

  /**
   * Turn on keypoint placement (the Keypoint action button). Resolves once
   * its placement handler is armed: the handler installs in an effect after
   * the mode flips, and clicks before that reach nothing.
   */
  async keypointMode() {
    await this.eventUtils.after(
      "lighter:scene-interactive-mode-changed",
      () => this.page.getByTestId("keypoint-mode").click(),
      (e) => (e.detail as { interactiveMode: boolean }).interactiveMode,
    );
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
   * Assert that keypoint mode is active or inactive
   *
   * @param active Whether keypoint mode should be active (default true)
   */
  async keypointModeIsActive(active = true) {
    const button = this.modalAnnotateSidebar.page.getByTestId("keypoint-mode");
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
