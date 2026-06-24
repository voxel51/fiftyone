import { expect, test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const test = base.extend<{ grid: GridPom; modal: ModalPom }>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

const datasetName = getUniqueDatasetNameWithPrefix("modal-clientside-aggs");

const det = (label: string, x: number) =>
  `fo.Detection(label="${label}", bounding_box=[${x}, 0, 0.1, 0.1])`;

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ fiftyoneLoader, foWebServer }) => {
  await foWebServer.startWebServer();

  // fixed aspect ratio so the grid renders; the two samples carry DIFFERENT
  // detection counts (3 vs 1) so the sidebar count can only be right if it is
  // recomputed per-sample, not reused or taken dataset-wide
  await fiftyoneLoader.executePythonCode(`
    import fiftyone as fo

    md = fo.ImageMetadata(width=512, height=512)
    dataset = fo.Dataset("${datasetName}")
    dataset.persistent = True
    dataset.add_samples([
        fo.Sample(filepath="0.png", metadata=md, predictions=fo.Detections(
            detections=[${det("cat", 0)}, ${det("cat", 0.2)}, ${det(
    "dog",
    0.4
  )}])),
        fo.Sample(filepath="1.png", metadata=md, predictions=fo.Detections(
            detections=[${det("dog", 0)}])),
    ])
  `);
});

test.describe.serial(
  "modal sidebar aggregations from the cached sample",
  () => {
    test("the predictions count recomputes per sample on navigation", async ({
      fiftyoneLoader,
      grid,
      modal,
      page,
    }) => {
      await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
      await grid.openFirstSample();

      const first = await modal.sidebar.getSidebarFieldCount("predictions");

      // navigation must change the count to the other sample's value, not keep
      // the first sample's (stale) or a dataset-wide total
      await modal.navigateNextSample();
      await expect
        .poll(() => modal.sidebar.getSidebarFieldCount("predictions"))
        .not.toBe(first);
      const second = await modal.sidebar.getSidebarFieldCount("predictions");

      // the two samples' own counts, in whichever order the grid opened them
      expect(new Set([first, second])).toEqual(new Set(["3", "1"]));
    });
  }
);
