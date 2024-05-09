import { Locator, Page } from "src/oss/fixtures";

export class Asset3dPanelPom {
  readonly locator: Locator;
  readonly headerLocator: Locator;

  constructor(private readonly page: Page) {
    this.locator = this.page.getByTestId("leva-container");
    this.headerLocator = this.page.getByTestId("leva-container-header");
  }

  async dragToToLeftCorner() {
    await this.headerLocator.waitFor({ state: "visible" });

    const levaContainerBox = await this.locator.boundingBox();

    if (!levaContainerBox) {
      throw new Error("Unable to find bounding box on leva container");
    }

    const dragXOffset = -this.page.viewportSize().width / 2;
    const dragYOffset = -10;

    const levaCenterX = levaContainerBox.x + levaContainerBox.width / 2;
    const levaCenterY = levaContainerBox.y + levaContainerBox.height / 2;

    await this.headerLocator.hover();

    await this.page.mouse.down();
    await this.page.mouse.move(
      levaCenterX + dragXOffset,
      levaCenterY + dragYOffset
    );
    await this.page.mouse.up();
  }
}
