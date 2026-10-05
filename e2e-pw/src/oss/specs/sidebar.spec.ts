import { expect, test as base } from "src/oss/fixtures";
import { GridPom, TileLabels } from "src/oss/poms/grid";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { EventUtils } from "src/shared/event-utils";
import { createDetectionsDataset } from "./detections-data";

const datasetName = getUniqueDatasetNameWithPrefix("smoke-detections");

const LABEL_PATH = "ground_truth.detections.label";

const gt = (...labels: string[]) =>
  labels.map((label) => `ground_truth:${label}`).sort();

const BOTTLES = ["bottle", "bottle", "bottle"];
const CUPS = ["cup", "cup"];
const TABLE_SETTING = [
  "chair",
  "dining table",
  "fork",
  "fork",
  "knife",
  "knife",
];

const GROUND_TRUTH: TileLabels = {
  "0.png": gt("bird", "bird", "bird"),
  "1.png": gt("horse", "person"),
  "2.png": gt("carrot", "cat"),
  "3.png": gt(...BOTTLES, ...CUPS, ...TABLE_SETTING),
  "4.png": gt("cake", "surfboard", "surfboard"),
};

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
  await createDetectionsDataset(datasetFactory, datasetName);
});

test.describe.serial("sidebar-filter-visibility", () => {
  test.beforeEach(
    async ({ page, fiftyoneLoader, grid, sidebar, eventUtils }) => {
      await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
      await page.click('[title="TAGS"]');
      await page.click('[title="METADATA"]');

      expect(
        await grid.afterTilesUpdated(() =>
          sidebar.clickFieldCheckbox("predictions"),
        ),
      ).toEqual(GROUND_TRUTH);

      await eventUtils.after("animation-onRest", () =>
        sidebar.clickFieldDropdown("ground_truth"),
      );

      // selecting a value filters in the default mode, selecting labels
      expect(
        await grid.afterEntryCounts(() =>
          grid.afterGridRefreshed(() => sidebar.applyFilter("bottle")),
        ),
      ).toEqual({ "3.png": gt(...BOTTLES) });
      await grid.assert.isEntryCountTextEqualTo("1 of 5 samples");
      await grid.assert.isTileCountEqualTo(1);
      expect(await sidebar.filterModeText(LABEL_PATH)).toBe(
        "Select detections with label",
      );
    },
  );

  const toVisibilityMode = async (
    sidebar: SidebarPom,
    eventUtils: EventUtils,
  ) => {
    await eventUtils.after("e2e:sidebar:mode-shown", () =>
      sidebar.toggleSidebarMode(),
    );
    expect(await sidebar.getActiveMode()).toBe("VISIBILITY");
  };

  test("In grid, select a label filter works", async ({
    grid,
    sidebar,
    eventUtils,
  }) => {
    await toVisibilityMode(sidebar, eventUtils);

    // selecting a value shows only the selected values' labels
    expect(
      await grid.afterTilesUpdated(() => sidebar.applyFilter("cat")),
    ).toEqual({ "3.png": [] });
    expect(await sidebar.filterModeText(LABEL_PATH)).toBe("Show label");
    expect(
      await grid.afterTilesUpdated(() => sidebar.applyFilter("person")),
    ).toEqual({ "3.png": [] });

    expect(
      await grid.afterTilesUpdated(() =>
        sidebar.selectFilterMode(LABEL_PATH, "hide-label"),
      ),
    ).toEqual({ "3.png": gt(...BOTTLES) });
  });

  test("In grid, exclude a label filter works", async ({
    grid,
    sidebar,
    eventUtils,
  }) => {
    expect(
      await grid.afterEntryCounts(() =>
        grid.afterGridRefreshed(() =>
          sidebar.selectFilterMode(LABEL_PATH, "exclude-detections-with-label"),
        ),
      ),
    ).toEqual({
      ...GROUND_TRUTH,
      "3.png": gt(...CUPS, ...TABLE_SETTING),
    });
    await grid.assert.isEntryCountTextEqualTo("5 samples");
    await grid.assert.isTileCountEqualTo(5);

    await toVisibilityMode(sidebar, eventUtils);

    expect(
      await grid.afterTilesUpdated(() => sidebar.applyFilter("cup")),
    ).toEqual({
      "0.png": [],
      "1.png": [],
      "2.png": [],
      "3.png": gt(...CUPS),
      "4.png": [],
    });

    expect(
      await grid.afterTilesUpdated(() =>
        sidebar.selectFilterMode(LABEL_PATH, "hide-label"),
      ),
    ).toEqual({ ...GROUND_TRUTH, "3.png": gt(...TABLE_SETTING) });
  });

  test("In grid, show samples with a label filter works", async ({
    grid,
    sidebar,
    eventUtils,
  }) => {
    expect(
      await grid.afterGridRefreshed(() =>
        sidebar.selectFilterMode(LABEL_PATH, "show-samples-with-label"),
      ),
    ).toEqual({ "3.png": GROUND_TRUTH["3.png"] });
    // the bottle filter already showed these counts, so they do not signal
    await grid.assert.isEntryCountTextEqualTo("1 of 5 samples");
    await grid.assert.isTileCountEqualTo(1);

    await toVisibilityMode(sidebar, eventUtils);

    expect(
      await grid.afterTilesUpdated(() => sidebar.applyFilter("cup")),
    ).toEqual({ "3.png": gt(...CUPS) });

    expect(
      await grid.afterTilesUpdated(() =>
        sidebar.selectFilterMode(LABEL_PATH, "hide-label"),
      ),
    ).toEqual({ "3.png": gt(...BOTTLES, ...TABLE_SETTING) });
  });

  test("In grid, omit samples with a label filter works", async ({
    grid,
    sidebar,
    eventUtils,
  }) => {
    const withoutBottles = Object.fromEntries(
      Object.entries(GROUND_TRUTH).filter(([file]) => file !== "3.png"),
    );
    expect(
      await grid.afterEntryCounts(() =>
        grid.afterGridRefreshed(() =>
          sidebar.selectFilterMode(LABEL_PATH, "omit-samples-with-label"),
        ),
      ),
    ).toEqual(withoutBottles);
    await grid.assert.isEntryCountTextEqualTo("4 of 5 samples");
    await grid.assert.isTileCountEqualTo(4);

    await toVisibilityMode(sidebar, eventUtils);

    expect(
      await grid.afterTilesUpdated(() => sidebar.applyFilter("horse")),
    ).toEqual({
      "0.png": [],
      "1.png": gt("horse"),
      "2.png": [],
      "4.png": [],
    });

    expect(
      await grid.afterTilesUpdated(() =>
        sidebar.selectFilterMode(LABEL_PATH, "hide-label"),
      ),
    ).toEqual({ ...withoutBottles, "1.png": gt("person") });
  });
});
