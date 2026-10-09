import { test as base, expect } from "src/oss/fixtures";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("datetime-regression");
const NUM_SAMPLES = 2;

const test = base.extend<{
  sidebar: SidebarPom;
}>({
  sidebar: async ({ page }, use) => {
    await use(new SidebarPom(page));
  },
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createDataset({
    datasetName,
    numSamples: NUM_SAMPLES,
    schema: { dates: "DateTimeField", seconds: "DateTimeField" },
    // a day and a second apart per sample
    withSampleData: ({ index }) => ({
      dates: { $date: new Date(Date.UTC(2021, 0, 1 - index)).toISOString() },
      seconds: {
        $date: new Date(Date.UTC(2021, 0, 1, 18, 58, -index)).toISOString(),
      },
    }),
  });
});

test.describe
  .serial("date field and date time field can filter visibility", () => {
  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test("change date field visibility works", async ({
    eventUtils,
    page,
    sidebar,
  }) => {
    await sidebar.toggleSidebarMode();
    await sidebar.toggleSidebarGroup("METADATA");

    await eventUtils.after("animation-onRest", async () => {
      await sidebar.clickFieldCheckbox("dates");
      await sidebar.clickFieldDropdown("dates");
    });
    expect(await page.getByTestId("tag-dates").count()).toBe(NUM_SAMPLES);
  });

  test("change datetime field visibility works", async ({
    sidebar,
    eventUtils,
    page,
  }) => {
    await sidebar.toggleSidebarMode();
    await sidebar.toggleSidebarGroup("METADATA");

    await eventUtils.after("animation-onRest", async () => {
      await sidebar.clickFieldCheckbox("seconds");
      await sidebar.clickFieldDropdown("seconds");
    });

    expect(await page.getByTestId("tag-seconds").count()).toBe(NUM_SAMPLES);
  });
});
