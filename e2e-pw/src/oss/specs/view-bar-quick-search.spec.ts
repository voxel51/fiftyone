import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ViewBarPom } from "src/oss/poms/viewbar/viewbar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

//
// The quick search end-to-end, and the stages row's focus hand-off.
//
// The dataset factory computes a REAL sklearn similarity index over random
// embeddings — instant, no model. A free-text prompt would need the model,
// but a SAMPLE ID query ranks by the stored embeddings, so searching an id
// exercises the whole path for real: operator, brain backend, applied view.
//
const test = base.extend<{ viewBar: ViewBarPom; grid: GridPom }>({
  viewBar: async ({ page }, use) => {
    await use(new ViewBarPom(page));
  },
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ foWebServer }) => {
  await foWebServer.startWebServer();
});

test.beforeEach(async ({ page, fiftyoneLoader, datasetFactory }) => {
  const datasetName = getUniqueDatasetNameWithPrefix("view-bar-quick-search");

  await datasetFactory.createDataset({
    datasetName,
    numSamples: 5,
    promptableIndexes: ["clip"],
  });

  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
});

test.describe("view bar quick search", () => {
  test("a query runs a real search and applies a subset view", async ({
    viewBar,
    grid,
    page,
  }) => {
    // The factory's fixed sample ids (`{idx:024x}`) make a real query: the
    // sklearn index ranks by the stored embeddings, no model involved
    const query = "2".padStart(24, "0");

    // Three matches, set through the magnifier's settings
    await viewBar.setSearchMatches(3);

    const input = viewBar.searchInput;
    await input.click();
    await input.fill(query);
    // The search applies its own result view; the grid reload is the proof
    await grid.run(() => page.keyboard.press("Enter"));

    await grid.assert.isEntryCountTextEqualTo("3 samples");
    // A static run applies its results as a Select over the ranked ids;
    // the row stays folded until the toggle opens it
    await viewBar.expand();
    await viewBar.assert.hasViewStage("Select");

    // The query was remembered at submit time: refocusing the box offers it
    await viewBar.clearSearch();
    await viewBar.openSearchHistory();
    await viewBar.assert.searchHistoryOffers(query);
  });

  test("opening the stages row focuses the typeahead and its stage list", async ({
    viewBar,
  }) => {
    await viewBar.stagesToggle.click();

    // The empty row pins its slot open as the typeahead, focused and with
    // the stage list already dropped — typing can start immediately
    await viewBar.assert.stageTypeaheadIsReady();
  });
});
