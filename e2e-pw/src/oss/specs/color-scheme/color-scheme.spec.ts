import { test as base, expect } from "src/oss/fixtures";
import { GridActionsRowPom } from "src/oss/poms/action-row/grid-actions-row";
import { ColorModalPom } from "src/oss/poms/color-modal";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const test = base.extend<{
  grid: GridPom;
  modal: ModalPom;
  colorModal: ColorModalPom;
  gridActionRow: GridActionsRowPom;
}>({
  grid: async ({ page }, use) => {
    await use(new GridPom(page));
  },
  modal: async ({ page }, use) => {
    await use(new ModalPom(page));
  },
  colorModal: async ({ page }, use) => {
    await use(new ColorModalPom(page));
  },
  gridActionRow: async ({ page }, use) => {
    await use(new GridActionsRowPom(page));
  },
});

const datasetName = getUniqueDatasetNameWithPrefix("quickstart");
// start the dataset with a default colorscheme: color pool is purple and pink;
// ground_truth has green as field color, bird value has yellow color;
test.describe("color scheme basic functionality with quickstart", () => {
  test.beforeAll(async ({ fiftyoneLoader }) => {
    await fiftyoneLoader.loadZooDataset("quickstart", datasetName, {
      max_samples: 5,
    });

    await fiftyoneLoader.executePythonCode(`
        import fiftyone as fo
        dataset = fo.Dataset("${datasetName}")
        dataset.persistent = True

        n = len(dataset)
        labels = ["foo", "bar", "spam", "eggs"]
        collaborators = ["alice", "bob", "charlie", "peter", "susan"]

        # Add label attributes of each primitive type
        patches = dataset.to_patches("ground_truth")
        p = len(patches)

        dataset.add_sample_field("ground_truth.detections.list_string", fo.ListField, subfield=fo.StringField)
        dataset.add_sample_field("ground_truth.detections.str_field", fo.StringField)
        patches.set_values("ground_truth.str_field", [random.choice(labels) for _ in range(p)])
        patches.set_values("ground_truth.list_string", [[random.choice(labels), random.choice(collaborators)] for _ in range(p)])
        `);
  });

  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test("should be able to update color scheme", async ({
    grid,
    gridActionRow,
    colorModal,
    page,
    eventUtils,
  }) => {
    // update color scheme to color blind friendly palette
    await gridActionRow.toggleColorSettings();
    await colorModal.selectActiveField("JSON editor");
    // mount eventListener
    // const editorUpdatePromise =
    // eventUtils.getEventReceivedPromiseForPredicate(
    //   "json-viewer-update",
    //   () => true
    // );
    await colorModal.selectActiveField("Global settings");
    await colorModal.useColorBlindColors();
    // verify the color palette is updated in JSON editor
    await colorModal.selectActiveField("JSON editor");
    // mount eventListener
    // await editorUpdatePromise
    page.waitForTimeout(2000);
    // wait for json editor to load
    await expect(await colorModal.getJSONEditor()).toHaveScreenshot(
      "change-color-palette-json-editor.png",
      { animations: "allow" }
    );

    // verify the color palette is updated in grid
    await colorModal.closeColorModal();
    await expect(await grid.getNthFlashlightSection(0)).toHaveScreenshot(
      "change-color-palette.png",
      { animations: "allow" }
    );

    // open the color modal again, the setting is persistent
    await gridActionRow.toggleColorSettings();
    await colorModal.selectActiveField("Global settings");
    await expect(await page.locator("#color-palette")).toHaveScreenshot(
      "color-pool-1.png",
      { animations: "allow" }
    );
  });
});
