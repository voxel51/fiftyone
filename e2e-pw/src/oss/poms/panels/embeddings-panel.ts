import { Locator, Page, expect } from "src/oss/fixtures";
import { EventUtils } from "src/shared/event-utils";
import { SelectorPom } from "../selector";
import { PanelPom } from "./panel";

export class EmbeddingsPom {
  readonly locator: Locator;
  readonly plotContainer: Locator;
  readonly selector: SelectorPom;
  readonly colorbySelector: SelectorPom;
  readonly asserter: EmebddingsAsserter;
  readonly lassoTool: Locator;

  constructor(readonly page: Page, eventUtils: EventUtils) {
    this.locator = this.page.getByTestId("embeddings-container");
    this.selector = new SelectorPom(this.locator, eventUtils, "embeddings");
    this.colorbySelector = new SelectorPom(
      this.locator,
      eventUtils,
      "embeddings-colorby"
    );

    this.plotContainer = this.page.getByTestId("embeddings-plot-container");
    this.asserter = new EmebddingsAsserter(this, new PanelPom(page));
    this.lassoTool = this.locator.getByTestId("embeddings-plot-option-lasso");
  }

  async selectAll() {
    const { x, y, width, height } = await this.plotContainer.boundingBox();

    const [x1, y1] = [x, y + 100];
    const [x2, y2] = [x + width, y + 100];
    const [x3, y3] = [x + width, y + height - 50];

    await this.page.mouse.move(x1, y1);
    await this.page.mouse.down();
    await this.page.mouse.move(x2, y2);
    await this.page.mouse.move(x3, y3);
    await this.page.mouse.move(x1, y3);
    await this.page.mouse.move(x1, y1);
    await this.page.mouse.up();
  }
}

class EmebddingsAsserter {
  constructor(
    private readonly embeddingsPom: EmbeddingsPom,
    private readonly panelPom: PanelPom
  ) {}

  async verifyPanelVisible() {
    await expect(this.embeddingsPom.locator).toBeVisible();
  }

  async verifySelectorVisible() {
    await expect(this.embeddingsPom.selector.input).toBeVisible();
  }

  async verifyLassoSelectsSamples() {
    await this.embeddingsPom.selector.openResults();
    await this.embeddingsPom.selector.selectResult("img_viz");
    await this.embeddingsPom.plotContainer.waitFor({
      state: "visible",
      timeout: 2000,
    });

    await this.embeddingsPom.lassoTool.click({ timeout: 500 });
    await this.embeddingsPom.selectAll();
    await expect(this.panelPom.selectionCount).toBeVisible({ timeout: 500 });
  }
}
