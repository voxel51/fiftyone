import { test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { groupIndexToId, indexToId } from "src/shared/utils";

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

const datasetName = getUniqueDatasetNameWithPrefix("linking");
const groupDatasetName = getUniqueDatasetNameWithPrefix("group-linking");

const id = indexToId(0);
const groupId = groupIndexToId(0);

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createDataset({ datasetName });
  await datasetFactory.createDataset({
    mediaType: "group",
    datasetName: groupDatasetName,
    numGroups: 1,
    slices: [{ name: "only", mediaType: "image" }],
  });
});

test.describe.serial("modal linking", () => {
  test(`sample linking`, async ({ page, fiftyoneLoader, modal }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ id }),
      modalSample: "loaded-or-error",
    });

    await modal.assert.isOpen();
    await modal.sidebar.assert.verifySidebarEntryText("id", id);
  });

  test(`group linking`, async ({ page, fiftyoneLoader, modal }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, groupDatasetName, {
      searchParams: new URLSearchParams({ groupId }),
      modalSample: "loaded-or-error",
    });

    await modal.assert.isOpen();
    await modal.sidebar.assert.verifySidebarEntryText("group.id", groupId);
  });
});
