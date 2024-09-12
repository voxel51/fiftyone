import { Locator, Page, expect } from "src/oss/fixtures";
const DEFAULT_FOLDER_NAMES = ["Visibility", "Labels", "Lights"];

export class ModalLevaPom {
  readonly page: Page;
  readonly locator: Locator;
  readonly assert: LevaAsserter;

  constructor(page: Page) {
    this.page = page;
    this.locator = page.getByTestId("looker3d-leva-container");
    this.assert = new LevaAsserter(this);
  }

  getFolder(folderName: string) {
    return this.locator.locator("div").getByText(folderName, { exact: true });
  }

  async toggleFolder(folderName: string) {
    return this.getFolder(folderName).click();
  }

  async moveSliderToMin(sliderName: string) {
    const regex = new RegExp(`^${sliderName}$`);
    const slider = this.page
      .locator("div")
      .filter({ hasText: regex })
      .nth(1)
      .locator("div")
      .nth(1)
      .locator("div")
      .nth(0);
    return await slider.click({ position: { x: 0, y: 0 } });
  }

  async moveSliderToMax(sliderName: string) {
    const regex = new RegExp(`^${sliderName}$`);
    const slider = this.page
      .locator("div")
      .filter({ hasText: regex })
      .nth(1)
      .locator("div")
      .nth(1)
      .locator("div")
      .nth(0);
    const sliderWidth = await slider.evaluate(
      (el) => el.getBoundingClientRect().width
    );
    return await slider.click({ position: { x: sliderWidth * 0.99, y: 0 } });
  }
}

class LevaAsserter {
  constructor(private readonly modalLevaPom: ModalLevaPom) {}

  async verifyDefaultFolders() {
    await Promise.all(
      DEFAULT_FOLDER_NAMES.map((folderName) =>
        expect(this.modalLevaPom.getFolder(folderName)).toContainText(
          folderName
        )
      )
    );
  }

  async verifyAssetFolders(assetNames: string[]) {
    await Promise.all(
      assetNames.map((assetName) =>
        expect(this.modalLevaPom.getFolder(assetName)).toHaveCount(2)
      )
    );
  }
}
