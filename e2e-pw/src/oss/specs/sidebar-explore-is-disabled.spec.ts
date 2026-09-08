import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("explore-is-disabled");

const test = base.extend<{ sidebar: SidebarPom; grid: GridPom }>({
  sidebar: async ({ page }, use) => {
    await use(new SidebarPom(page));
  },
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();

  await datasetFactory.createDataset({
    datasetName,
    schema: {
      ground_truth: "Detection",
      metadata_dict: "DictField",
    },
    withSampleData: () => ({
      ground_truth: {
        _cls: "Detection",
        label: "cat",
        bounding_box: [0.1, 0.1, 0.5, 0.5],
      },
    }),
  });
});

test.describe.serial("explore-is-disabled", () => {
  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test("supported label field is draggable", async ({ sidebar }) => {
    await sidebar.asserter.assertCanDragField("ground_truth");
  });

  test("dict field in disabledCheckboxPaths is not draggable", async ({
    sidebar,
  }) => {
    await sidebar.toggleSidebarGroup("OTHER");
    await sidebar.asserter.assertCannotDragField("metadata_dict");
  });

  test("_label_tags is not draggable", async ({ sidebar }) => {
    await sidebar.asserter.assertCannotDragField("_label_tags");
  });
});
