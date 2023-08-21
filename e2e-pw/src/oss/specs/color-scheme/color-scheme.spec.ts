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
  grid: async ({ page }, use) => {
    await use(new GridPom(page));
  },
  modal: async ({ page }, use) => {
    await use(new ModalPom(page));
  },
  colorModal: async ({ page }, use) => {
    await use(new ColorModalPom(page));
  },
  gridActionsRow: async ({ page }, use) => {
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

  test("should be able to update color scheme", async ({
    grid,
    gridActionsRow,
    colorModal,
    page,
    eventUtils,
  }) => {
    // update color scheme to color blind friendly palette
    await gridActionsRow.toggleColorSettings();
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
    await gridActionsRow.toggleColorSettings();
    await colorModal.selectActiveField("Global settings");
    await expect(await page.locator("#color-palette")).toHaveScreenshot(
      "color-pool-1.png",
      { animations: "allow" }
    );
  });

  // TODO: input checkbox is not stable

  // test("should be able to update color by field", async ({
  //   sidebar,
  //   grid,
  //   gridActionsRow,
  //   colorModal,
  //   page,
  // }) => {
  //   // turn off ground_truth
  //   await sidebar.clickFieldCheckbox("ground_truth");
  //   // open color modal and modify color in sample tags field and predictions
  //   await gridActionsRow.toggleColorSettings();

  //   await colorModal.selectActiveField("predictions");
  //   // await colorModal.useSpecialFieldColor('predictions');
  //   await page
  //     .getByTestId('checkbox-Use custom color for predictions field')
  //     .locator("input")
  //     .check({ force: true });
  //   page.waitForSelector("[data-cy=field-color-div]");
  //   await colorModal.setSpecialFieldColor("purple"); // purple
  //   // close the modal and verify the color changed in grid and and in canvas
  //   await colorModal.closeColorModal();
  //   await expect(await grid.getNthFlashlightSection(0)).toHaveScreenshot(
  //     "color-field-setting-1.png",
  //     { animations: "allow" }
  //   );
  // });

  test("should be able to update color by value - tag", async ({
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
    await colorModal.toggleColorMode();

    await page
      .getByTitle(`Use custom colors for specific field values`)
      .first()
      .click({ force: true });
    await colorModal.addANewPair("validation", "yellowgreen");
    await colorModal.addANewPair("test", "black"); // this doesn't matter

    await colorModal.closeColorModal();
    const tagBubble = page.getByTestId("tag-validation").first();

    await gridRefreshedEventPromise;
    await gridRefreshedEventPromise;
    // verify validation tag has yellow green as background color
    expect(await tagBubble.getAttribute("style")).toContain(
      "rgb(154, 205, 50)"
    );
  });

  test("should be able to update color by value - detection - no colorbyattribute", async ({
    grid,
    gridActionsRow,
    colorModal,
    page,
    sidebar,
  }) => {
    // turn off predictions detections and open color modal
    await sidebar.clickFieldCheckbox("predictions");
    await gridActionsRow.toggleColorSettings();
    // go to prediction tab
    await colorModal.selectActiveField("ground_truth");
    // color by value mode
    await colorModal.toggleColorMode();

    await page
      .getByTitle(`Use custom colors for specific field values`)
      .first()
      .click({ force: true });
    // I can set value colors directly bypass choosing attribute by value
    await colorModal.addANewPair("bird", "yellow");
    await colorModal.addANewPair("person", "red");
    await colorModal.addANewPair("horse", "green");
    await colorModal.addANewPair("cat", "blue");
    await colorModal.addANewPair("bottle", "white");
    await colorModal.addANewPair("surfboard", "white");
    await colorModal.addANewPair("knife", "white");
    await colorModal.addANewPair("fork", "white");
    await colorModal.addANewPair("cup", "white");
    await colorModal.addANewPair("dining table", "white");
    await colorModal.addANewPair("chair", "white");
    await colorModal.addANewPair("cake", "white");

    await colorModal.closeColorModal();
    await expect(await grid.getNthFlashlightSection(0)).toHaveScreenshot(
      "color-value-setting-1.png",
      { animations: "allow" }
    );
  });

  test("should be able to update color by value - ground_truth - with custom string field", async ({
    grid,
    sidebar,
    gridActionsRow,
    colorModal,
    page,
  }) => {
    // turn off predictions
    await sidebar.clickFieldCheckbox("predictions");
    // tag existing labels
    await gridActionsRow.toggleTagSamplesOrLabels();
    await gridActionsRow.toggleColorSettings();

    await colorModal.selectActiveField("ground_truth");
    // color by value mode
    await colorModal.toggleColorMode();
    await page
      .getByTitle(`Use custom colors for specific field values`)
      .first()
      .click({ force: true });
    // I can set value colors directly bypass choosing attribute by value 'str_field'
    // "foo", "bar", "spam", "eggs"
    await colorModal.addANewPair("foo", "green");
    await colorModal.addANewPair("bar", "purple");
    await colorModal.addANewPair("spam", "yellow");
    await colorModal.addANewPair("eggs", "blue");
    await colorModal.selectColorByAttribute("str_field");

    await colorModal.closeColorModal();
    await expect(await grid.getNthFlashlightSection(0)).toHaveScreenshot(
      "color-value-setting-2.png",
      { animations: "allow" }
    );
  });
});
