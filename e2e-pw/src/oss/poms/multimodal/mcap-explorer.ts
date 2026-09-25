import { Locator, Page } from "src/oss/fixtures";
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
    eventUtils: EventUtils,
  ) {
    this.panel = new GridPanelPom(page);
    this.scope = this.panel.getContent("McapExplorerPanel");
    this.episode = new EpisodePom(page, this.scope, eventUtils);
  }

  async open(): Promise<void> {
    await this.panel.open("McapExplorerPanel");
    await this.expectPicker();
  }

  async closeIfOpen(): Promise<void> {
    if (!(await this.scope.isVisible())) return;
    await this.panel.close();
    await this.page.getByTestId("spotlight-section-forward").waitFor();
  }

  async upload(filePath: string): Promise<void> {
    await this.scope
      .locator('[data-testid="local-mcap-input"]')
      .setInputFiles(filePath);
  }

  async unmount(): Promise<void> {
    await this.scope.getByRole("button", { name: "Unmount recording" }).click();
    await this.expectPicker();
  }

  async expectPicker(): Promise<void> {
    await this.scope
      .getByRole("button", { name: "Drop an MCAP file or click to browse" })
      .waitFor();
  }

  async expectInvalidExtension(filePath: string): Promise<void> {
    await this.scope
      .locator('[data-testid="local-mcap-input"]')
      .setInputFiles(filePath);
    await this.scope
      .getByText("Choose an .mcap file", { exact: true })
      .waitFor();
  }
}
