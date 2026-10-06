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
  modal: ModalPom;
  colorModal: ColorModalPom;
  gridActionsRow: GridActionsRowPom;
}>({
  sidebar: async ({ page }, use) => {
    await use(new SidebarPom(page));
  },
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
  colorModal: async ({ page }, use) => {
    await use(new ColorModalPom(page));
  },
  gridActionsRow: async ({ page }, use) => {
    await use(new GridActionsRowPom(page));
  },
});

const colorByFieldDataset = getUniqueDatasetNameWithPrefix("color-by-field");

const dummyDatasetColorByInstance = getUniqueDatasetNameWithPrefix(
  "dummy-color-by-instance",
);

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
    expect(await tagBubble.getAttribute("style")).toContain(
      "rgb(154, 205, 50)",
    );

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
