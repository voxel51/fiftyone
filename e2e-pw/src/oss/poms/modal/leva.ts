import { Locator, Page, expect } from "src/oss/fixtures";
import { ModalPom } from ".";

export class ModalLevaPom {
  readonly page: Page;
  readonly locator: Locator;
  readonly assert: LevaAsserter;

  constructor(page: Page, private readonly modal: ModalPom) {
    this.page = page;
    this.locator = page.locator("#fo-leva-container");
    this.assert = new LevaAsserter(this);
  }
}

class LevaAsserter {
  constructor(private readonly modalLevaPom: ModalLevaPom) {}

  async verifyDefaultFolders() {
    const defaultFolderNames = ["Visibility", "Labels", "Lights"];

    await Promise.all(
      defaultFolderNames.map((folderName) =>
        expect(this.modalLevaPom.locator.getByText(folderName)).toBeVisible()
      )
    );
  }

  async verifyAssetFolders(assetNames: string[]) {
    await Promise.all(
      assetNames.map((assetName) =>
        expect(this.modalLevaPom.locator.getByText(assetName)).toHaveCount(2)
      )
    );
  }
}
