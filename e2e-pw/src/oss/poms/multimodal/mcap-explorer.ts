import { Locator, Page, expect } from "src/oss/fixtures";
import { GridPanelPom } from "src/oss/poms/panels/grid-panel";
import { EpisodePom } from "./episode";

/** MCAP Explorer ingress and lifecycle interactions. */
export class McapExplorerPom {
  readonly episode: EpisodePom;
  readonly panel: GridPanelPom;
  readonly scope: Locator;

  constructor(private readonly page: Page) {
    this.panel = new GridPanelPom(page);
    this.scope = this.panel.getContent("McapExplorerPanel");
    this.episode = new EpisodePom(page, this.scope);
  }

  async open(): Promise<void> {
    await this.panel.open("McapExplorerPanel");
    await expect(
      this.scope.getByRole("button", {
        name: "Drop an MCAP file or click to browse",
      }),
    ).toBeVisible();
  }

  async closeIfOpen(): Promise<void> {
    if (!(await this.scope.isVisible())) return;
    await this.panel.close();
    await expect(
      this.page.getByTestId("spotlight-section-forward"),
    ).toBeVisible();
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
    await expect(
      this.scope.getByRole("button", {
        name: "Drop an MCAP file or click to browse",
      }),
    ).toBeVisible();
  }

  async expectInvalidExtension(filePath: string): Promise<void> {
    await this.scope
      .locator('[data-testid="local-mcap-input"]')
      .setInputFiles(filePath);
    await expect(
      this.scope.getByText("Choose an .mcap file", { exact: true }),
    ).toBeVisible();
  }
}
