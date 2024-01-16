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

const datasetName = getUniqueDatasetNameWithPrefix("quickstart");

test.describe("color scheme basic functionality with quickstart", () => {
  test.beforeAll(async ({ fiftyoneLoader }) => {
    await fiftyoneLoader.loadZooDataset("quickstart", datasetName, {
      max_samples: 5,
    });

    await fiftyoneLoader.executePythonCode(`
        import fiftyone as fo
        import random
        dataset = fo.load_dataset("${datasetName}")

        n = len(dataset)
        labels = ["foo", "bar", "spam", "eggs"]
        collaborators = ["alice", "bob", "charlie", "peter", "susan"]

        # Add label attributes of each primitive type
        patches = dataset.to_patches("ground_truth")
        p = len(patches)

        dataset.add_sample_field("ground_truth.detections.str_field", fo.StringField)
        patches.set_values("ground_truth.str_field", [labels[index % 4] for index in range(p)])
        `);
  });

  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test("update color by value mode, use tag as colorByAttribute", async ({
    gridActionsRow,
    colorModal,
    page,
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
    await gridRefreshedEventPromise;

    // verify validation tag has yellow green as background color
    expect(await tagBubble.getAttribute("style")).toContain(
      "rgb(154, 205, 50)"
    );
  });
});
