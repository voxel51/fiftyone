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
  readonly pp: Locator;
  readonly lassoTool: Locator;

  constructor(
    private readonly page: Page,
    private readonly eutils: EventUtils
  ) {
    this.pp = page;
    this.locator = this.page.getByTestId("embeddings-container");
    this.selector = new SelectorPom(this.locator, eutils, "embeddings");
    this.colorbySelector = new SelectorPom(
      this.locator,
      eutils,
      "embeddings-colorby"
    );

    this.plotContainer = this.page.getByTestId("embeddings-plot-container");
    this.asserter = new EmebddingsAsserter(this, new PanelPom(page));
    this.lassoTool = this.locator.getByTestId("embeddings-plot-option-lasso");
  }
}

class EmebddingsAsserter {
  constructor(
    private readonly emPom: EmbeddingsPom,
    private readonly panelPom: PanelPom
  ) {}

  async verifyPanelVisible() {
    await expect(this.emPom.locator).toBeVisible();
  }

  async verifySelectorVisible() {
    await expect(this.emPom.selector.input).toBeVisible();
  }

  async verifyLassoSelectsSamples() {
    await this.emPom.selector.openResults();
    await this.emPom.selector.selectResult("img_viz");
    await this.emPom.plotContainer.waitFor({
      state: "visible",
      timeout: 500,
    });

    await this.emPom.lassoTool.click({ timeout: 500 });

    const { x, y, width, height } =
      await this.emPom.plotContainer.boundingBox();

    const [x1, y1] = [x, y + 100];
    const [x2, y2] = [x + width, y + 100];
    const [x3, y3] = [x + width, y + height - 50];

    await this.emPom.pp.mouse.move(x1, y1);
    await this.emPom.pp.mouse.down();
    await this.emPom.pp.mouse.move(x2, y2);
    await this.emPom.pp.mouse.move(x3, y3);
    await this.emPom.pp.mouse.move(x1, y3);
    await this.emPom.pp.mouse.move(x1, y1);
    await this.emPom.pp.mouse.up();

    await expect(this.panelPom.selectionCount).toBeVisible({ timeout: 500 });
  }
}
