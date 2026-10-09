import { test as base, expect } from "src/oss/fixtures";
import { GridActionsRowPom } from "src/oss/poms/action-row/grid-actions-row";
import { ColorModalPom } from "src/oss/poms/color-modal";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import {
  GROUND_TRUTH_DETECTIONS,
  createDetectionsDataset,
} from "./detections-data";

const test = base.extend<{
  sidebar: SidebarPom;
  grid: GridPom;
  colorModal: ColorModalPom;
  gridActionsRow: GridActionsRowPom;
  modal: ModalPom;
}>({
  sidebar: async ({ page }, use) => {
    await use(new SidebarPom(page));
  },
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  colorModal: async ({ page }, use) => {
    await use(new ColorModalPom(page));
  },
  gridActionsRow: async ({ page }, use) => {
    await use(new GridActionsRowPom(page));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

const colorByFieldDataset = getUniqueDatasetNameWithPrefix("color-by-field");

const dummyDatasetColorByInstance = getUniqueDatasetNameWithPrefix(
  "dummy-color-by-instance",
);

// the e2e server's default pool has one color; this dataset's pool has two,
// so its two label fields each get their own default color. The App hands out
// pool colors in first-request order, so the label fields' group comes first
// and every other group starts collapsed: nothing else asks for a color, and
// ground_truth always takes the first and predictions the second
const twoColorPoolDataset = getUniqueDatasetNameWithPrefix("two-color-pool");

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await createDetectionsDataset(datasetFactory, colorByFieldDataset);
  await datasetFactory.createDataset({
    datasetName: dummyDatasetColorByInstance,
    appConfig: {
      color_scheme: {
        color_by: "instance",
        color_pool: [
          "red",
          "green",
          "blue",
          "yellow",
          "purple",
          "orange",
          "brown",
          "pink",
          "gray",
          "black",
          "white",
        ],
      },
    },
  });
  await datasetFactory.createDataset({
    datasetName: twoColorPoolDataset,
    schema: { ground_truth: "Detections", predictions: "Detections" },
    appConfig: {
      color_scheme: { color_pool: ["#FA5300", "#009999"] },
      sidebar_groups: [
        { name: "labels", paths: ["ground_truth", "predictions"] },
        { name: "tags", paths: ["tags", "_label_tags"], expanded: false },
        {
          name: "metadata",
          paths: ["metadata.size_bytes", "metadata.mime_type"],
          expanded: false,
        },
        {
          name: "primitives",
          paths: ["id", "filepath", "created_at", "last_modified_at"],
          expanded: false,
        },
      ],
    },
    withSampleData: (_, { label }) => ({
      ground_truth: label.detections([
        label.detection({ label: "cat", bounding_box: [0.1, 0.1, 0.3, 0.3] }),
      ]),
      predictions: label.detections([
        label.detection({ label: "dog", bounding_box: [0.6, 0.6, 0.3, 0.3] }),
      ]),
    }),
  });
});

test("label fields get distinct default colors from a multi-color pool", async ({
  page,
  fiftyoneLoader,
  grid,
  modal,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, twoColorPoolDataset);
  await modal.afterLabelsRedrawn(() => grid.openFirstSample());
  await modal.sampleCanvas.assert.hasScreenshot("two-color-pool-fields.png");
});

test.describe.serial("color scheme basic functionality", () => {
  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, colorByFieldDataset);
  });

  test("update color by value mode, use tag as colorByAttribute", async ({
    fiftyoneLoader,
    gridActionsRow,
    colorModal,
    page,
    grid,
    sidebar,
  }) => {
    // each change redraws every tile's tags; waiting out each one leaves the
    // custom color's redraw as the only one the last wait can see
    const tiles = GROUND_TRUTH_DETECTIONS.map((_, i) => `${i}.png`);
    const afterTags = (action: () => Promise<void>) =>
      grid.afterTagsRenderedNamed(tiles, action);

    await afterTags(() => sidebar.clickFieldCheckbox("tags"));
    await gridActionsRow.toggleColorSettings();
    await colorModal.selectActiveField("sample tags");
    await afterTags(() => colorModal.changeColorMode("value"));
    await afterTags(() => colorModal.useCustomValueColors());
    await afterTags(() => colorModal.setPairValue("validation", 0));
    await afterTags(() => colorModal.setPairColor("#9ACD32", 0)); // yellow green
    await colorModal.closeColorModal();
    const tagBubble = page.getByTestId("tag-validation").first();

    // verify validation tag has yellow green as background color
    expect(
      await tagBubble.evaluate(
        (el) => (el as HTMLElement).style.backgroundColor,
      ),
    ).toBe("rgb(154, 205, 50)");

    // switch dataset to dummy_color_by_instance, and verify that color_by mode is "instance"
    // we're asserting that when dataset is switched, session color settings are reset to default from app config
    await grid.run(async () => {
      await fiftyoneLoader.selectDatasetFromSelector(
        page,
        dummyDatasetColorByInstance,
      );
    });

    // open color modal
    await gridActionsRow.toggleColorSettings();
    await colorModal.assert.isColorByModeEqualTo("instance");
    await colorModal.closeColorModal();
  });
});
