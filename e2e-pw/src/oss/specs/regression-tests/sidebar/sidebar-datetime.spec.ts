import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

/**
 * This test makes sure that a ragged group dataset with default video slice works as expected.
 * Video also has bounding box labels.
 */

const datasetName = getUniqueDatasetNameWithPrefix("datetime-regression");
const testImgPath = `/tmp/test-img-${datasetName}.jpg`;
const testImgPath2 = `/tmp/test-img-2-${datasetName}.jpg`;

const test = base.extend<{
  grid: GridPom;
  modal: ModalPom;
  sidebar: SidebarPom;
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
});

test.describe("date field and date time field can filter visibility", () => {
  test.beforeAll(async ({ fiftyoneLoader, mediaFactory }) => {
    await mediaFactory.createBlankImage({
      outputPath: testImgPath,
      width: 50,
      height: 50,
    });

    await mediaFactory.createBlankImage({
      outputPath: testImgPath2,
      width: 50,
      height: 50,
    });

    await fiftyoneLoader.executePythonCode(`
      import fiftyone as fo
      from datetime import date, datetime, timedelta

      dataset = fo.Dataset("${datasetName}")
      dataset.persistent = True

      t1 = datetime.strptime("2021-01-01", "%Y-%m-%d")
      t2 = datetime.strptime("2021-01-01 18:58:00", "%Y-%m-%d %H:%M:%S")

      image_sample = fo.Sample(filepath="${testImgPath}")
      image_sample2 = fo.Sample(filepath="${testImgPath2}")

      dataset.add_samples([image_sample, image_sample2])

      for idx, sample in enumerate(dataset):
          sample["dates"] = t1 - timedelta(days=idx)
          sample["seconds"] = t2 - timedelta(seconds=idx)
          sample.save()
    `);
  });

  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test("change date field visibility works", async ({
    eventUtils,
    grid,
    page,
    sidebar,
  }) => {
    await sidebar.toggleSidebarMode();
    await sidebar.toggleSidebarGroup("METADATA");

    const entryExpandPromise = eventUtils.getEventReceivedPromiseForPredicate(
      "animation-onRest",
      () => true
    );

    await sidebar.clickFieldCheckbox("dates");
    await sidebar.clickFieldDropdown("dates");
    await entryExpandPromise;
    expect(await page.getByTestId("tag-dates").count()).toBe(2);
  });

  test("change datetime field visibility works", async ({
    sidebar,
    eventUtils,
    page,
  }) => {
    await sidebar.toggleSidebarMode();
    await sidebar.toggleSidebarGroup("METADATA");

    const entryExpandPromise = eventUtils.getEventReceivedPromiseForPredicate(
      "animation-onRest",
      () => true
    );

    await sidebar.clickFieldCheckbox("seconds");
    await sidebar.clickFieldDropdown("seconds");
    await entryExpandPromise;

    expect(await page.getByTestId("tag-seconds").count()).toBe(2);
  });
});
