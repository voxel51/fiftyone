import { test as base, expect } from "src/oss/fixtures";
import { GridActionsRowPom } from "src/oss/poms/action-row/grid-actions-row";
import { ColorModalPom } from "src/oss/poms/color-modal";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

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
  await datasetFactory.createDetectionsDataset({
    datasetName: colorByFieldDataset,
    numbered: true,
    samples: ["bird", "cat", "dog", "horse", "person"].map((label) => ({
      detections: { ground_truth: [label] },
      tags: ["validation"],
    })),
  });

  await datasetFactory.createDetectionsDataset({
    datasetName: dummyDatasetColorByInstance,
    samples: [{ detections: { ground_truth: ["foo"] } }],
    colorScheme: {
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
    eventUtils,
    sidebar,
  }) => {
    // turn on the sample tag bubble
    await sidebar.clickFieldCheckbox("tags");
    // mount eventListener
    const gridRefreshedEventPromise = await eventUtils.arm("re-render-tag");
    // open color modal and modify color in sample tags field and ground_truth
    await gridActionsRow.toggleColorSettings();

    await colorModal.selectActiveField("sample tags");
    await colorModal.changeColorMode("value");

    await page
      .getByTitle(`Use custom colors for specific field values`)
      .first()
      .click({ force: true });
    await colorModal.addANewPair("validation", "#9ACD32", 0); // yellow green
    await colorModal.addANewPair("validation", "#9ACD32", 0); // yellow green
    await colorModal.addANewPair("validation", "#9ACD32", 0); // yellow green

    await colorModal.closeColorModal();
    const tagBubble = page.getByTestId("tag-validation").first();

    await gridRefreshedEventPromise.received;

    // verify validation tag has yellow green as background color
    expect(await tagBubble.getAttribute("style")).toContain(
      "rgb(154, 205, 50)",
    );

    // switch dataset to dummy_color_by_instance, and verify that color_by mode is "instance"
    // we're asserting that when dataset is switched, session color settings are reset to default from app config
    const gridRefreshPromise = await grid.armGridRefresh();
    await fiftyoneLoader.selectDatasetFromSelector(
      page,
      dummyDatasetColorByInstance,
    );
    await gridRefreshPromise.received;

    // open color modal
    await gridActionsRow.toggleColorSettings();
    await colorModal.assert.isColorByModeEqualTo("instance");
    await colorModal.closeColorModal();
  });
});
