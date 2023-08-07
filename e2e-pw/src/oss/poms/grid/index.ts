import { expect, Locator, Page } from "src/oss/fixtures";
import { GridActionsRowPom } from "../action-row/grid-actions-row";
import { GridSliceSelectorPom } from "../action-row/grid-slice-selector";

export class GridPom {
  readonly page: Page;
  readonly actionsRow: GridActionsRowPom;
  readonly sliceSelector: GridSliceSelectorPom;
  readonly assert: GridAsserter;

  readonly locator: Locator;

  constructor(page: Page) {
    this.page = page;
    this.actionsRow = new GridActionsRowPom(page);
    this.sliceSelector = new GridSliceSelectorPom(page);

    this.assert = new GridAsserter(this);

    this.locator = page.getByTestId("fo-grid");
  }

  async getNthLooker(n: number) {
    return this.locator.getByTestId("looker").nth(n);
  }

  async openFirstLooker() {
    const looker = await this.getNthLooker(0);
    await looker.click({ position: { x: 10, y: 60 } });
  }

  async toggleSelectFirstLooker() {
    const looker = await this.getNthLooker(0);
    await looker.click({ position: { x: 10, y: 5 } });
  }

  async toggleSelectNthLooker(n: number) {
    const looker = await this.getNthLooker(n);
    await looker.click({ position: { x: 10, y: 5 } });
  }

  async openNthLooker(n: number) {
    const looker = await this.getNthLooker(n);
    await looker.click({ position: { x: 10, y: 50 } });
  }

  async getEntryCountText() {
    return this.page.getByTestId("entry-counts").textContent();
  }

  async selectSlice(slice: string) {
    await this.page.getByTestId("selector-slice").fill(slice);
    await this.page.getByTestId("selector-slice").press("Enter");
  }

  async getSampleLoadEventPromiseForFilepath(sampleFilepath: string) {
    return this.page.evaluate(
      (sampleFilepath_) =>
        new Promise<void>((resolve, _reject) => {
          document.addEventListener("sample-loaded", (e: CustomEvent) => {
            if ((e.detail.sampleFilepath as string) === sampleFilepath_) {
              resolve();
            }
          });
        }),
      sampleFilepath
    );
  }
}

class GridAsserter {
  constructor(private readonly gridPom: GridPom) {}

  async assertNLookers(n: number) {
    const lookersCount = await this.gridPom.locator
      .getByTestId("looker")
      .count();
    expect(lookersCount).toBe(n);
  }

  async verifySelection(n: number) {
    const action = this.gridPom.actionsRow.gridActionsRow.getByTestId(
      "action-manage-selected"
    );

    if (n === 0) {
      const count = await action.count();
      expect(count).toBe(0);
      return;
    }

    const count = await action.first().textContent();

    expect(count).toBe(String(n));
  }

  async waitForEntryCountTextToEqual(text: string) {
    return this.gridPom.page.waitForFunction(
      (text_) => {
        return (
          document.querySelector("[data-cy='entry-counts']").textContent ===
          text_
        );
      },
      text,
      { timeout: 2000 }
    );
  }
}
