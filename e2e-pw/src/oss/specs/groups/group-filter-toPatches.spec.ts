import { test as base, expect } from "src/oss/fixtures";
import { GridActionsRowPom } from "src/oss/poms/action-row/grid-actions-row";
import { GridPom } from "src/oss/poms/grid";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix(`group-filter-toPatches`);
const test = base.extend<{
  grid: GridPom;
  gridActionsRow: GridActionsRowPom;
  sidebar: SidebarPom;
}>({
  grid: async ({ eventUtils, page }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  sidebar: async ({ page }, use) => {
    await use(new SidebarPom(page));
  },
  gridActionsRow: async ({ eventUtils, page }, use) => {
    await use(new GridActionsRowPom(page, eventUtils));
  },
});

test.beforeAll(async ({ fiftyoneLoader }) => {
  await fiftyoneLoader.executePythonCode(`
    import fiftyone as fo
    dataset = fo.Dataset("${datasetName}")
    dataset.add_group_field("group", default="left")
    dataset.persistent = True
    group = fo.Group()
    slices = ["left", "right"]
    samples = []

    for i in range(0, 10):
        sample = fo.Sample(
            filepath=f"{i}-first.png", 
            group=group.element(name=slices[i%2]),
            predictions=fo.Detections(
                detections = [
                    fo.Detection(
                        label = "carrot",
                        confidence = 0.8,                    
                    ),
                    fo.Detection(
                        label = "not-carrot",
                        confidence = 0.25
                    )
                ]
            )
        )
        samples.append(sample)
    dataset.add_samples(samples)
    `);
});

test.beforeEach(async ({ page, fiftyoneLoader }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
});

test(`group dataset with filters converts toPatches correctly`, async ({
  page,
  grid,
  gridActionsRow,
  sidebar,
  eventUtils,
}) => {
  await grid.assert.isEntryCountTextEqualTo("5 groups with slice");

  // apply a sidebar filter
  const entryExpandPromise =
    eventUtils.getEventReceivedPromiseForPredicate("animation-onRest");
  await sidebar.clickFieldDropdown("predictions");
  await entryExpandPromise;

  await sidebar.waitForElement("checkbox-carrot");
  await sidebar.applyLabelFromList(
    "predictions.detections.label",
    ["carrot"],
    "select-detections-with-label"
  );

  // convert to patches
  await grid.actionsRow.toggleToClipsOrPatches();
  const toPatchesRefresh = grid.getWaitForGridRefreshPromise();
  await gridActionsRow.clickToPatchesByLabelField("predictions");
  await toPatchesRefresh;

  // verify result:
  await grid.assert.isEntryCountTextEqualTo("5 patches");

  // not-carrot should not be in the sidebar filter anymore
  const expandPromise =
    eventUtils.getEventReceivedPromiseForPredicate("animation-onRest");
  await sidebar.clickFieldDropdown("predictions");
  await expandPromise;
  expect(await page.getByTestId("checkbox-not-carrot").count()).toEqual(0);
});
