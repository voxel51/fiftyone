import { Page, expect } from "src/oss/fixtures";

const SLICE_SELECTOR_TEST_ID = "selector-slice";
const SELECTOR_RESULTS_CONTAINER_TEST_ID = "selector-results-container";

export class GridSliceSelectorPom {
  readonly page: Page;
  readonly assert: GridSliceSelectorAsserter;

  constructor(page: Page) {
    this.page = page;
    this.assert = new GridSliceSelectorAsserter(this);
  }

  private async openSliceSelector() {
    await this.page.getByTestId(SLICE_SELECTOR_TEST_ID).click();
    return this.page.getByTestId(SELECTOR_RESULTS_CONTAINER_TEST_ID);
  }

  async getAvailableSlices() {
    const sliceResultsContainer = await this.openSliceSelector();

    const slices = await sliceResultsContainer.evaluate((div) =>
      Array.from(div.childNodes).map((node: HTMLElement) => node.innerText)
    );

    // close slice selector by clicking outside of it
    await this.page.getByTestId("entry-counts").click();

    return slices;
  }

  async selectSlice(sliceName: string) {
    const sliceResultsContainer = await this.openSliceSelector();

    await sliceResultsContainer
      .getByTestId(`selector-result-${sliceName}`)
      .click();
  }
}

class GridSliceSelectorAsserter {
  constructor(private readonly gridSliceSelectorPom: GridSliceSelectorPom) {}

  async verifySliceSelectorIsAvailable() {
    await expect(
      this.gridSliceSelectorPom.page.getByTestId(SLICE_SELECTOR_TEST_ID)
    ).toBeVisible();
  }

  async verifyActiveSlice(expectedActiveSlice: string) {
    await expect(
      this.gridSliceSelectorPom.page.getByTestId(SLICE_SELECTOR_TEST_ID)
    ).toHaveValue(expectedActiveSlice);
  }

  async verifyHasSlices(expectedSlices: string[]) {
    const actualSlices = await this.gridSliceSelectorPom.getAvailableSlices();
    expect(actualSlices.sort()).toEqual(expectedSlices.sort());
  }
}
