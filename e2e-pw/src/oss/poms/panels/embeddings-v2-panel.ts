import { Locator, Page, expect } from "src/oss/fixtures";
import { GridPanelPom } from "./grid-panel";

export class EmbeddingsV2Pom {
  readonly assert: EmbeddingsV2Asserter;
  readonly runsPage: Locator;
  readonly gridPanel: GridPanelPom;

  constructor(readonly page: Page) {
    this.gridPanel = new GridPanelPom(page);
    this.runsPage = page.locator(".emb-runs-page");
    this.assert = new EmbeddingsV2Asserter(this);
  }

  async open() {
    await this.gridPanel.open("Embeddings");
  }
}

class EmbeddingsV2Asserter {
  constructor(private readonly pom: EmbeddingsV2Pom) {}

  async verifyPanelLoaded() {
    await expect(this.pom.runsPage).toBeVisible();
    await expect(
      this.pom.page.getByText("Visualize your embeddings"),
    ).toBeVisible();
    await expect(this.pom.gridPanel.errorBoundary).toBeHidden();
  }
}
