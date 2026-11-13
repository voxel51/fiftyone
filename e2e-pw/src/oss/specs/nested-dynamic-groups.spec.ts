import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

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

const nestedDynamicGroupsDatasetName = getUniqueDatasetNameWithPrefix(
  "nested-dynamic-groups",
);

// groups 0 and 1 are scene "1", groups 2 and 3 scene "2"; within a scene the
// groups are ordered "1" then "2"
const NUM_GROUPS = 4;

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createDataset({
    mediaType: "group",
    datasetName: nestedDynamicGroupsDatasetName,
    numGroups: NUM_GROUPS,
    slices: [
      { name: "1", mediaType: "image" },
      { name: "2", mediaType: "image" },
    ],
    schema: { scene_key: "StringField", order_key: "StringField" },
    withSampleData: ({ groupIndex }) => ({
      scene_key: groupIndex < NUM_GROUPS / 2 ? "1" : "2",
      order_key: String((groupIndex % 2) + 1),
    }),
    savedViews: {
      groups: 'dataset.group_by("scene_key", order_by="order_key")',
    },
  });
});

test.beforeEach(async ({ page, fiftyoneLoader }) => {
  await fiftyoneLoader.waitUntilGridVisible(
    page,
    nestedDynamicGroupsDatasetName,
  );
});

test(`dynamic groups of groups works`, async ({
  fiftyoneLoader,
  grid,
  page,
  modal,
  sidebar,
}) => {
  await grid.assert.isTileCountEqualTo(NUM_GROUPS);
  await grid.assert.isEntryCountTextEqualTo(`${NUM_GROUPS} groups with slice`);

  await sidebar.clickFieldCheckbox("scene_key");
  await sidebar.clickFieldCheckbox("order_key");

  await grid.assert.nthSampleHasTagValue(0, "order_key", "1");
  await grid.assert.nthSampleHasTagValue(1, "order_key", "2");
  await grid.assert.nthSampleHasTagValue(2, "order_key", "1");
  await grid.assert.nthSampleHasTagValue(3, "order_key", "2");

  await fiftyoneLoader.waitUntilGridVisible(
    page,
    nestedDynamicGroupsDatasetName,
    {
      searchParams: new URLSearchParams({ view: "groups" }),
    },
  );
  await grid.run(async () => {
    await grid.actionsRow.toggleDisplayOptions();
    await grid.actionsRow.displayActions.toggleRenderFramesAsVideo();
  });

  await grid.assert.isTileCountEqualTo(NUM_GROUPS / 2);
  // rendering frames as video leaves the counts as loaded, so they do not
  // signal
  await grid.assert.isEntryCountTextEqualTo(
    `${NUM_GROUPS / 2} groups with slice`,
  );

  await grid.assert.nthSampleHasTagValue(0, "scene_key", "1");
  await grid.assert.nthSampleHasTagValue(1, "scene_key", "2");
  await grid.assert.nthSampleHasTagValue(0, "order_key", "1");
  await grid.assert.nthSampleHasTagValue(1, "order_key", "1");

  await modal.afterSampleLoaded(() => grid.openFirstSample());

  await modal.sidebar.assert.verifySidebarEntryTexts({
    scene_key: "1",
    order_key: "1",
  });
  await modal.imavid.toggleSettings();
  await modal.imavid.setLooping(false);
  await modal.imavid.toggleSettings();

  // the last frame's draw moves the sidebar to its sample
  await modal.eventUtils.after(
    "e2e:modal:sidebar-entry",
    () => modal.imavid.togglePlay(),
    (e) => (e.detail as { path: string }).path === "order_key",
  );
  await modal.sidebar.assert.verifySidebarEntryTexts({
    scene_key: "1",
    order_key: "2",
  });

  const next = { scene_key: "2", order_key: "1" };
  await modal.sidebar.afterEntries(next, () => modal.navigateNextSample());
  await modal.sidebar.assert.verifySidebarEntryTexts(next);
});
