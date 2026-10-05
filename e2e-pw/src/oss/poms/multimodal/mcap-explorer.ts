import { expect, Locator, Page } from "src/oss/fixtures";
import { GridPanelPom } from "src/oss/poms/panels/grid-panel";
import { EventUtils } from "src/shared/event-utils";
import { EpisodePom } from "./episode";

/** MCAP Explorer ingress and lifecycle interactions. */
export class McapExplorerPom {
  readonly episode: EpisodePom;
  readonly panel: GridPanelPom;
  readonly scope: Locator;

  constructor(
    private readonly page: Page,
    private readonly eventUtils: EventUtils,
  ) {
    this.panel = new GridPanelPom(page);
    this.scope = this.panel.getContent("McapExplorerPanel");
    this.episode = new EpisodePom(page, this.scope, eventUtils);
  }

  /** Open the panel on its picker; the file input's actions wait for it */
  async open(): Promise<void> {
    await this.panel.open("McapExplorerPanel");
  }

  async closeIfOpen(): Promise<void> {
    if (!(await this.scope.isVisible())) return;
    // the grid mounts again in the panel's place
    await this.eventUtils.after("grid-mount", () => this.panel.close());
  }

  async upload(filePath: string): Promise<void> {
    await this.scope
      .locator('[data-testid="local-mcap-input"]')
      .setInputFiles(filePath);
  }

  async unmount(): Promise<void> {
    await this.scope.getByRole("button", { name: "Unmount recording" }).click();
  }

  async expectInvalidExtension(filePath: string): Promise<void> {
    const message = "Choose an .mcap file";
    await this.eventUtils.after(
      "e2e:multimodal:explorer-error",
      () =>
        this.scope
          .locator('[data-testid="local-mcap-input"]')
          .setInputFiles(filePath),
      (e) => (e.detail as { message: string }).message === message,
    );
    expect(
      await this.scope.getByText(message, { exact: true }).isVisible(),
    ).toBe(true);
  }
}
