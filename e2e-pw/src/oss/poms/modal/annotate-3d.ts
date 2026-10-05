import { expect, Locator, Page } from "src/oss/fixtures";
import { ModalPom } from ".";

/**
 * The 3D annotation surface: the `looker3d` viewer in annotate mode plus its
 * floating annotation toolbar, composing with the shared modal POMs. Toolbar
 * buttons expose their action `id` as `data-cy` and active state as
 * `data-cy-active`; the toolbar mounts only once a label is selected or a draw
 * mode is entered, never on bare entry into annotate mode.
 */
export class ModalAnnotate3dPom {
  readonly page: Page;
  readonly modal: ModalPom;
  readonly assert: ModalAnnotate3dAsserter;
  readonly container: Locator;

  constructor(page: Page, modal: ModalPom) {
    this.page = page;
    this.modal = modal;
    this.assert = new ModalAnnotate3dAsserter(this);
    this.container = page.getByTestId("looker3d");
  }

  /**
   * Run `action` (the switch to annotate, or an annotation slice pick) and
   * resolve once the 3D scene it (re)mounts is interactable: all assets
   * loaded and the camera settled. Toolbar and canvas interaction goes after.
   */
  async afterSurface<T>(action: () => Promise<T>): Promise<T> {
    return this.modal.afterSceneReady(action);
  }

  /**
   * Enter cuboid annotation mode from the sidebar (the 3D Cuboids action). This
   * arms `current3dAnnotationMode`, which mounts the annotation toolbar and
   * auto-resolves the active annotation field — the prerequisite for the
   * Create Cuboid toggle and the draw gesture.
   */
  async enterCuboidMode() {
    await this.page.getByTestId("cuboid-mode").click();
  }

  /**
   * Enter polyline annotation mode from the sidebar (the 3D Polylines action).
   * Arms `current3dAnnotationMode` to polyline, which mounts the annotation
   * toolbar + the polyline-actions group and auto-resolves the active polyline
   * field (FieldSelection filters to polyline fields in this mode) — the
   * prerequisite for New Segment and the canvas draw.
   */
  async enterPolylineMode() {
    await this.page.locator('[data-cy="polyline-mode-3d"]').click();
  }

  /**
   * Toggle the New Segment polyline action. Off→on arms the segmentation state
   * so subsequent empty-canvas clicks place polyline vertices; with a polyline
   * already selected it appends a new segment to it.
   */
  async startSegment() {
    await this.toolbarButton("new-segment").click();
  }

  /**
   * Non-throwing read of whether New Segment is armed. New Segment is a toggle,
   * so a retrying draw must check this before re-arming — clicking it while
   * already active would disarm mid-draw.
   */
  async isNewSegmentActive(): Promise<boolean> {
    const v =
      await this.toolbarButton("new-segment").getAttribute("data-cy-active");
    return v === "true";
  }

  /**
   * A floating annotation-toolbar button by its action id, targeted off `page`
   * because the toolbar renders in the modal portal. Groups mount with context
   * (transform needs a selection, cuboid needs draw mode), so establish that
   * state before clicking.
   */
  toolbarButton(id: ToolbarActionId): Locator {
    return this.page.locator(`[data-cy="${id}"]`);
  }

  /** Toggle cuboid-draw mode (the Create Cuboid toolbar button). */
  async toggleCreateCuboid() {
    await this.toolbarButton("create-cuboid").click();
  }

  /** Delete the currently-selected label via the toolbar Delete button. */
  async deleteSelected() {
    await this.toolbarButton("contextual-delete").click();
  }

  /**
   * A Position3d geometry input in the edit form, by axis: position
   * `x`/`y`/`z`, dimensions `lx`/`ly`/`lz`, rotation `rx`/`ry`/`rz`. Values are
   * displayed to 2 decimals (e.g. "1.50").
   */
  geometryField(axis: GeometryAxis): Locator {
    return this.page
      .getByTestId("modal")
      .getByTestId("sidebar")
      .getByTestId(`position3d-${axis}`);
  }

  /** Set a Position3d geometry value (commits an undoable engine write). */
  async setGeometry(axis: GeometryAxis, value: string) {
    await this.geometryField(axis).fill(value);
  }

  /** Vertex count of the selected 3D polyline, read off the looker3d container. */
  async selectedVertexCount(): Promise<number> {
    return Number(
      await this.container.getAttribute("data-cy-selected-vertex-count"),
    );
  }

  /**
   * The engine-derived sidebar label rows currently listed for the 3D scene.
   * Shared selector with the 2D/video surfaces.
   */
  get labelRows(): Locator {
    return this.page
      .getByTestId("modal")
      .getByTestId("sidebar")
      .locator("[data-cy^='annotate-label-']");
  }

  /** A sidebar label row by its class text (e.g. "car"). */
  labelRow(labelText: string): Locator {
    return this.page
      .getByTestId("modal")
      .getByTestId("sidebar")
      .locator(`[data-cy^='annotate-label-'][data-cy-label='${labelText}']`);
  }

  /** The class text of every listed label row, in DOM order. */
  async listedLabels(): Promise<string[]> {
    return this.labelRows.evaluateAll((els) =>
      els.map((e) => e.getAttribute("data-cy-label") ?? ""),
    );
  }

  /** Select a 3D label by its class text (opens its edit form). */
  async selectLabel(labelText: string) {
    await this.labelRow(labelText).first().click();
  }

  /**
   * Run `action` (a cuboid selection) and resolve once the annotation toolbar
   * shows the transform group it arms
   */
  async afterTransformShown<T>(action: () => Promise<T>): Promise<T> {
    return this.modal.eventUtils.after(
      "e2e:looker3d:annotation-toolbar",
      action,
      (e) => {
        const detail = e.detail as { visible: boolean; transformMode: string };
        return detail.visible && detail.transformMode !== "";
      },
    );
  }

  /**
   * The engine instanceId of a listed label (strips the `annotate-label-`
   * prefix from its `data-cy`).
   */
  async labelRowId(labelText: string): Promise<string> {
    const cy = await this.labelRow(labelText).first().getAttribute("data-cy");
    return (cy ?? "").replace(/^annotate-label-/, "");
  }

  /**
   * Run `action` (a click on the 3D canvas while drawing a polyline) and
   * resolve once the draft has `count` vertices
   */
  async afterDraftVertices<T>(count: number, action: () => Promise<T>) {
    return this.modal.eventUtils.after(
      "e2e:looker3d:draft-vertices",
      action,
      (e) => (e.detail as { count: number }).count === count,
    );
  }
}

class ModalAnnotate3dAsserter {
  constructor(private readonly pom: ModalAnnotate3dPom) {}

  /**
   * Assert the 3D annotation toolbar is / isn't mounted. Keys off
   * `toggle-annotation-plane`, which is the one action always present in
   * annotate mode (the cuboid/polyline/transform groups mount on demand).
   */
  async toolbarVisible(visible = true) {
    expect(
      await this.pom.toolbarButton("toggle-annotation-plane").isVisible(),
    ).toBe(visible);
  }

  /** Assert cuboid-draw mode is active (Create Cuboid button highlighted). */
  async createCuboidActive(active = true) {
    expect(
      await this.pom
        .toolbarButton("create-cuboid")
        .getAttribute("data-cy-active"),
    ).toBe(String(active));
  }

  /** Assert polyline annotation mode is active (the sidebar 3D Polylines button). */
  async polylineModeActive(active = true) {
    expect(
      await this.pom.page
        .locator('[data-cy="polyline-mode-3d"]')
        .getAttribute("data-cy-active"),
    ).toBe(String(active));
  }

  /** Assert the New Segment polyline action is active (segmentation armed). */
  async newSegmentActive(active = true) {
    expect(
      await this.pom
        .toolbarButton("new-segment")
        .getAttribute("data-cy-active"),
    ).toBe(String(active));
  }

  /**
   * Assert the transform group is mounted (a label is selected) and a given
   * gizmo mode is active.
   */
  async transformModeActive(mode: "translate" | "rotate" | "scale") {
    expect(
      await this.pom.toolbarButton(mode).getAttribute("data-cy-active"),
    ).toBe("true");
  }

  /** Assert a label (by class text) is / isn't listed in the sidebar. */
  async labelListed(labelText: string, listed = true) {
    const row = this.pom.labelRow(labelText);
    if (listed) {
      expect(await row.isVisible()).toBe(true);
    } else {
      expect(await row.count()).toBe(0);
    }
  }

  /** Assert the number of label rows currently listed. */
  async labelCount(expected: number) {
    expect(await this.pom.labelRows.count()).toBe(expected);
  }
}

export type GeometryAxis =
  | "x"
  | "y"
  | "z"
  | "lx"
  | "ly"
  | "lz"
  | "rx"
  | "ry"
  | "rz";

type ToolbarActionId =
  | "create-cuboid"
  | "new-segment"
  | "edit-segments"
  | "snap-close-automatically"
  | "contextual-delete"
  | "toggle-annotation-plane"
  | "translate"
  | "rotate"
  | "scale"
  | "field-selector"
  | "exit-edit-mode";
