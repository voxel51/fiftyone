import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { SelectionTrayPom } from "src/oss/poms/selection-tray";
import { ViewBarPom } from "src/oss/poms/viewbar/viewbar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

type Images = readonly [string, string, string, string];
const test = base.extend<
  {
    datasetName: string;
    grid: GridPom;
    modal: ModalPom;
    tray: SelectionTrayPom;
    viewBar: ViewBarPom;
  },
  { images: Images }
>({
  images: [
    async ({ foWebServer, mediaFactory }, use) => {
      const directory = await fs.mkdtemp(
        path.join(os.tmpdir(), "selection-groups-"),
      );
      const images = ["g0-left", "g0-right", "g1-left", "g1-right"].map(
        (name) => path.join(directory, `${name}.png`),
      ) as unknown as Images;
      try {
        await foWebServer.startWebServer();
        await Promise.all(
          images.map((outputPath, index) =>
            mediaFactory.createImage({
              outputPath,
              width: 50,
              height: 50,
              fillColor: index < 2 ? "#ff8855" : "#5588ff",
            }),
          ),
        );
        await use(images);
      } finally {
        await foWebServer.stopWebServer();
        await fs.rm(directory, { force: true, recursive: true });
      }
    },
    { scope: "worker", auto: true },
  ],
  datasetName: async ({ fiftyoneLoader, images }, use, testInfo) => {
    const datasetName = getUniqueDatasetNameWithPrefix("selection-groups");
    const dynamic = testInfo.title.includes("dynamic");
    await fiftyoneLoader.executePythonCode(`
import fiftyone as fo

dataset = fo.Dataset("${datasetName}")
dataset.persistent = True
${
  dynamic
    ? `dataset.add_samples([
    fo.Sample(filepath=r"${images[0]}", scene="a", order=0),
    fo.Sample(filepath=r"${images[1]}", scene="a", order=1),
    fo.Sample(filepath=r"${images[2]}", scene="b", order=0),
    fo.Sample(filepath=r"${images[3]}", scene="b", order=1),
])
dataset.save_view("dynamic", dataset.group_by("scene", order_by="order"))`
    : `dataset.add_group_field("group", default="left")
group0 = fo.Group()
group1 = fo.Group()
dataset.add_samples([
    fo.Sample(filepath=r"${images[0]}", group=group0.element("left")),
    fo.Sample(filepath=r"${images[1]}", group=group0.element("right")),
    fo.Sample(filepath=r"${images[2]}", group=group1.element("left")),
    fo.Sample(filepath=r"${images[3]}", group=group1.element("right")),
])`
}
`);
    try {
      await use(datasetName);
    } finally {
      await fiftyoneLoader.executePythonCode(`
import fiftyone as fo
if fo.dataset_exists("${datasetName}"):
    fo.delete_dataset("${datasetName}")
`);
    }
  },
  grid: async ({ page, eventUtils }, use) => use(new GridPom(page, eventUtils)),
  modal: async ({ page, eventUtils }, use) =>
    use(new ModalPom(page, eventUtils)),
  tray: async ({ page }, use) => use(new SelectionTrayPom(page)),
  viewBar: async ({ page }, use) => use(new ViewBarPom(page)),
});

test("selected group slices exclude unchosen siblings", async ({
  datasetName,
  fiftyoneLoader,
  grid,
  page,
  tray,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await grid.assert.isTileCountEqualTo(2);
  await grid.toggleSelectNthSample(0);
  await tray.createSubset("Left only", "Selected samples");
  await tray.openCreatedSubset();
  await grid.assert.isTileCountEqualTo(1);
  await grid.toggleSelectNthSample(0);
  await tray.assert.cardsHaveNames(["g0-left.png"]);
  await grid.run(() => grid.selectSlice("right"));
  await grid.assert.isEntryCountTextEqualTo("0 groups with slice");
  await grid.assert.isTileCountEqualTo(0);
  await grid.selectSlice("left");
  await grid.assert.isTileCountEqualTo(1);
});

test("all group slices include the selected group's sibling", async ({
  datasetName,
  fiftyoneLoader,
  grid,
  page,
  tray,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await grid.toggleSelectNthSample(0);
  await tray.createSubset("Both cameras", "All slices of these groups");
  await tray.openCreatedSubset();
  await grid.assert.isTileCountEqualTo(1);
  await grid.selectSlice("right");
  await grid.assert.isTileCountEqualTo(1);
  await grid.toggleSelectNthSample(0);
  await tray.assert.cardsHaveNames(["g0-right.png"]);
});

test("a limited dynamic group saves its concrete members", async ({
  datasetName,
  fiftyoneLoader,
  grid,
  modal,
  page,
  tray,
  viewBar,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ view: "dynamic" }),
  });
  await grid.assert.isEntryCountTextEqualTo("2 groups");
  const editor = await viewBar.addStage("Limit");
  await editor.fill("limit", "1");
  await grid.run(() => editor.commit("limit"));
  await grid.assert.isEntryCountTextEqualTo("1 group");
  await grid.toggleSelectNthSample(0);
  await expect(tray.locator).toContainText(/1\s*group/);
  await expect(tray.locator).toContainText(/2\s*samples/);
  await tray.createSubset("First scene");
  await tray.openCreatedSubset();
  await grid.assert.isTileCountEqualTo(1);
  await grid.openFirstSample();
  await modal.group.dynamicGroupPagination.assert.verifyPage(2);
  await modal.close();
  await viewBar.expand();
  await viewBar.viewStages
    .first()
    .getByRole("button", { name: "Remove stage" })
    .click();
  await grid.assert.isEntryCountTextEqualTo("1 group");
  await grid.assert.isTileCountEqualTo(1);
});
