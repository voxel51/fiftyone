import { Locator, Page, expect } from "src/oss/fixtures";
import { GridPanelPom } from "./grid-panel";

export class EmbeddingsV2Pom {
  readonly assert: EmbeddingsV2Asserter;
  readonly runsPage: Locator;
  readonly gridPanel: GridPanelPom;

  constructor(readonly page: Page) {
    this.gridPanel = new GridPanelPom(page);
    this.runsPage = page.getByTestId("embeddings-runs-page");
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
    // No empty-state text assertion: this suite also runs against
    // enterprise builds, and the two app modes deliberately render
    // different no-runs states (upsell landing vs. neutral empty
    // state). The per-mode rendering is unit-tested in RunsList.
    await expect(this.pom.gridPanel.errorBoundary).toBeHidden();
  }
}
