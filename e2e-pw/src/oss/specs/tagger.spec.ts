import { test as base, expect } from "src/oss/fixtures";
import { GridTaggerPom } from "src/oss/poms/action-row/tagger/grid-tagger";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { createDetectionsDataset } from "./detections-data";

const datasetName = getUniqueDatasetNameWithPrefix("smoke-detections");

const test = base.extend<{
  grid: GridPom;
  modal: ModalPom;
  sidebar: SidebarPom;
  tagger: GridTaggerPom;
}>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
  sidebar: async ({ page }, use) => {
    await use(new SidebarPom(page));
  },
  tagger: async ({ page, eventUtils }, use) => {
    await use(new GridTaggerPom(page, eventUtils));
  },
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await createDetectionsDataset(datasetFactory, datasetName);
});

test.beforeEach(async ({ page, fiftyoneLoader }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
});

test.describe.serial("tag", () => {
  test("sample tag and label tag loads correct aggregation number on default view", async ({
    grid,
    tagger,
  }) => {
    await tagger.afterCountShown("sample", () =>
      grid.actionsRow.toggleTagSamplesOrLabels(),
    );
    expect(await tagger.getTagInputTextPlaceholder("sample")).toBe(
      "+ tag 5 samples",
    );

    await tagger.setActiveTaggerMode("label");
    expect(await tagger.getTagInputTextPlaceholder("label")).toBe(
      "+ tag 37 labels",
    );

    await grid.actionsRow.toggleTagSamplesOrLabels();
  });

  test("In grid, I can add a new sample tag to all samples", async ({
    grid,
    page,
    sidebar,
    tagger,
  }) => {
    await sidebar.clickFieldCheckbox("tags");
    await sidebar.clickFieldDropdown("tags");
    // tagging remounts the grid; the tiles' tags render as they redraw
    await grid.afterTilesDrawn(5, () =>
      grid.run(async () => {
        await tagger.afterCountShown("sample", () =>
          grid.actionsRow.toggleTagSamplesOrLabels(),
        );
        await tagger.addNewTag("sample", "test1");
      }),
    );

    const bubble = page.getByTestId("tag-tags-test1");
    expect(await bubble.count()).toBe(5);
  });

  test("In grid, I can add a new label tag to all samples", async ({
    aggregationWatcher,
    grid,
    page,
    sidebar,
    tagger,
  }) => {
    await sidebar.clickFieldCheckbox("_label_tags");
    await sidebar.clickFieldDropdown("_label_tags");
    // tagging remounts the grid; the tiles' tags render as they redraw
    await grid.afterTilesDrawn(5, () =>
      grid.run(async () => {
        await tagger.afterCountShown("sample", () =>
          grid.actionsRow.toggleTagSamplesOrLabels(),
        );
        await tagger.setActiveTaggerMode("label");
        await tagger.addNewTag("label", "labelTest");
      }),
    );
    // every ground_truth and predictions label is tagged: 3 + 3 on the first
    // sample, 2 + 5 on the second
    const bubble1 = page.getByTestId("tag-_label_tags-labeltest:-6");
    const bubble2 = page.getByTestId("tag-_label_tags-labeltest:-7");
    expect(await bubble1.isVisible()).toBe(true);
    expect(await bubble2.isVisible()).toBe(true);

    // `_label_tags` is a client-derived pseudo path; the server has no such
    // field on the view and throws `DatasetView has no field '_label_tags'`
    // if it ever appears in an aggregations form. Full-view label-tag counts
    // come from per-label-field `.tags` aggregations (via cumulativeCounts).
    expect(
      aggregationWatcher.allPaths(),
      "aggregationsQuery must never request '_label_tags'",
    ).not.toContain("_label_tags");
  });

  test("In modal, I can add a label tag to a filtered sample", async ({
    eventUtils,
    grid,
    modal,
  }) => {
    await modal.afterSampleLoaded(() => grid.openFirstSample());

    await modal.afterLabelsRedrawn(() =>
      modal.sidebar.toggleLabelCheckbox("ground_truth"),
    );
    await modal.sampleCanvas.assert.hasScreenshot("predictions.png");

    await eventUtils.after("animation-onRest", async () => {
      await modal.sidebar.clickFieldDropdown("predictions");
    });
    await modal.sidebar.applyFilter("bird");
    expect(
      await modal.sidebar.locator
        .getByTestId("clear-filters-labels")
        .isVisible(),
    ).toBe(true);

    await modal.sampleCanvas.move(0.5, 0.5);

    await modal.tagger.toggleOpen();
    await modal.tagger.addLabelTag("correct");

    await modal.afterLabelsRedrawn(() =>
      modal.sidebar.clearGroupFilters("labels"),
    );
    await modal.sampleCanvas.assert.hasScreenshot("predictions.png");
  });
});
