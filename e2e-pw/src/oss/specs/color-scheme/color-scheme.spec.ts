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
  gridActionsRow: async ({ page, eventUtils }, use) => {
    await use(new GridActionsRowPom(page, eventUtils));
  },
});

const quickstartColorByField = getUniqueDatasetNameWithPrefix("quickstart");

const dummyDatasetColorByInstance = getUniqueDatasetNameWithPrefix(
  "dummy-color-by-instance"
);

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ fiftyoneLoader, foWebServer }) => {
  await foWebServer.startWebServer();
  await fiftyoneLoader.loadZooDataset("quickstart", quickstartColorByField, {
    max_samples: 5,
  });

  await fiftyoneLoader.executePythonCode(`
      import fiftyone as fo
      import random
      quickstart_color_by_field = fo.load_dataset("${quickstartColorByField}")      

      n = len(quickstart_color_by_field)
      labels = ["foo", "bar", "spam", "eggs"]
      collaborators = ["alice", "bob", "charlie", "peter", "susan"]

      # Add label attributes of each primitive type
      patches = quickstart_color_by_field.to_patches("ground_truth")
      p = len(patches)

      quickstart_color_by_field.add_sample_field("ground_truth.detections.str_field", fo.StringField)
      patches.set_values("ground_truth.str_field", [labels[index % 4] for index in range(p)])

      dummy_color_by_instance = fo.Dataset("${dummyDatasetColorByInstance}")
      dummy_color_by_instance.persistent = True
      dummy_color_by_instance.add_sample(
        fo.Sample(
          filepath="dummy.png",
          ground_truth=fo.Detections(detections=[fo.Detection(label="foo")])
        )
      )
      dummy_color_by_instance.app_config.color_scheme = fo.ColorScheme(color_by="instance", color_pool=["red", "green", "blue", "yellow", "purple", "orange", "brown", "pink", "gray", "black", "white"])
      dummy_color_by_instance.save()
    `);
});

test.describe.serial("color scheme basic functionality with quickstart", () => {
  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, quickstartColorByField);
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
    const gridRefreshedEventPromise =
      eventUtils.getEventReceivedPromiseForPredicate(
        "re-render-tag",
        () => true
      );
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

    await gridRefreshedEventPromise;

    // verify validation tag has yellow green as background color
    expect(await tagBubble.getAttribute("style")).toContain(
      "rgb(154, 205, 50)"
    );

    // switch dataset to dummy_color_by_instance, and verify that color_by mode is "instance"
    // we're asserting that when dataset is switched, session color settings are reset to default from app config
    const gridRefreshPromise = grid.getWaitForGridRefreshPromise();
    await fiftyoneLoader.selectDatasetFromSelector(
      page,
      dummyDatasetColorByInstance
    );
    await gridRefreshPromise;

    // open color modal
    await gridActionsRow.toggleColorSettings();
    await colorModal.assert.isColorByModeEqualTo("instance");
    await colorModal.closeColorModal();
  });
});
