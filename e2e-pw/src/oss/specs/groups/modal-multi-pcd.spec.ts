import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const test = base.extend<{ grid: GridPom; modal: ModalPom }>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

const datasetName = getUniqueDatasetNameWithPrefix(`modal-multi-pcd`);

const pcd1Path = `/tmp/test-pcd1-${datasetName}.pcd`;
const pcd2Path = `/tmp/test-pcd2-${datasetName}.pcd`;

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ fiftyoneLoader, foWebServer, mediaFactory }) => {
  await foWebServer.startWebServer();
  mediaFactory.createPcd({
    outputPath: pcd1Path,
    shape: "cube",
    numPoints: 100,
  });

  mediaFactory.createPcd({
    outputPath: pcd2Path,
    shape: "diagonal",
    numPoints: 5,
  });

  await fiftyoneLoader.executePythonCode(`
    import fiftyone as fo

    dataset = fo.Dataset("${datasetName}")
    dataset.persistent = True

    group = fo.Group()
    sample1 = fo.Sample(filepath="${pcd1Path}", group=group.element("pcd1"))
    sample2 = fo.Sample(filepath="${pcd2Path}", group=group.element("pcd2"))
  
    dataset.add_samples([sample1, sample2])`);
});

test.beforeEach(async ({ page, fiftyoneLoader }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
});

test.describe.serial("multi-pcd", () => {
  test("multi-pcd slice in modal", async ({ grid, modal }) => {
    await grid.openFirstSample();

    await modal.clickOnLooker3d();

    await modal.toggleLooker3dSlice("pcd2");

    await modal.sidebar.assert.verifySidebarEntryText(
      "pcd1-group.name",
      "pcd1"
    );
    await modal.sidebar.assert.verifySidebarEntryText(
      "pcd2-group.name",
      "pcd2"
    );

    await modal.toggleLooker3dSlice("pcd1");

    await modal.sidebar.assert.verifySidebarEntryText("group.name", "pcd2");
  });
});
