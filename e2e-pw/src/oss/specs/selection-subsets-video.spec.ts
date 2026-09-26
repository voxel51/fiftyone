import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { SelectionTrayPom } from "src/oss/poms/selection-tray";
import { SidebarPom } from "src/oss/poms/sidebar";
import { EventUtils } from "src/shared/event-utils";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

type VideoMedia = { readonly first: string; readonly control: string };
const test = base.extend<
  {
    datasetName: string;
    grid: GridPom;
    modal: ModalPom;
    tray: SelectionTrayPom;
  },
  { videoMedia: VideoMedia }
>({
  videoMedia: [
    async ({ foWebServer, mediaFactory }, use) => {
      const directory = await fs.mkdtemp(
        path.join(os.tmpdir(), "selection-video-"),
      );
      const first = path.join(directory, "first.webm");
      const control = path.join(directory, "control.webm");
      try {
        await foWebServer.startWebServer();
        await Promise.all([
          mediaFactory.createVideo({
            outputPath: first,
            duration: 2,
            frameRate: 10,
            width: 64,
            height: 64,
            color: "#995533",
          }),
          mediaFactory.createVideo({
            outputPath: control,
            duration: 2,
            frameRate: 10,
            width: 64,
            height: 64,
            color: "#335599",
          }),
        ]);
        await use({ first, control });
      } finally {
        await foWebServer.stopWebServer();
        await fs.rm(directory, { force: true, recursive: true });
      }
    },
    { scope: "worker", auto: true },
  ],
  datasetName: async ({ fiftyoneLoader, videoMedia }, use) => {
    const datasetName = getUniqueDatasetNameWithPrefix("selection-video");
    await fiftyoneLoader.executePythonCode(`
import fiftyone as fo

dataset = fo.Dataset("${datasetName}")
dataset.persistent = True
first = fo.Sample(
    filepath=r"${videoMedia.first}",
    name="first-video",
    events=fo.TemporalDetections(detections=[
        fo.TemporalDetection(label="braking", support=[3, 8]),
        fo.TemporalDetection(label="turning", support=[12, 17]),
        fo.TemporalDetection(label="parking", support=[18, 20]),
    ]),
)
first.frames[3] = fo.Frame(origin="first-video")
first.frames[5] = fo.Frame(origin="first-video")
control = fo.Sample(filepath=r"${videoMedia.control}", name="control-video")
control.frames[3] = fo.Frame(origin="control-video")
control.frames[5] = fo.Frame(origin="control-video")
dataset.add_samples([first, control])
dataset.save_view("clips", dataset.to_clips("events"))
dataset.save_view("frames", dataset.to_frames(sample_frames=True))
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
});

test("two clips from one video survive leaving and reopening the converted view", async ({
  datasetName,
  fiftyoneLoader,
  grid,
  modal,
  page,
  tray,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ view: "clips" }),
  });
  await grid.assert.isEntryCountTextEqualTo("3 clips");
  await grid.toggleSelectNthSample(0);
  await expect(tray.locator).toContainText(/1\s*clip selected/);
  await grid.toggleSelectNthSample(1);
  await expect(tray.locator).toContainText(/2\s*clips selected/);
  await expect(tray.cards).toHaveCount(2);
  await tray.createSubset("Two moments");
  await tray.openCreatedSubset();
  await grid.assert.isEntryCountTextEqualTo("2 clips");
  await grid.openFirstSample();
  await modal.sidebar.assert.verifySidebarEntryText("support", "[3, 8]");
  await modal.navigateNextSample();
  await modal.sidebar.assert.verifySidebarEntryText("support", "[12, 17]");
  await modal.close();

  await tray.chooseAllSamples();
  await grid.assert.isEntryCountTextEqualTo("3 clips");
  await grid.openNthSample(2);
  await modal.sidebar.assert.verifySidebarEntryText("support", "[18, 20]");
  await modal.close();
  await tray.chooseSubset("Two moments");
  await grid.assert.isEntryCountTextEqualTo("2 clips");
});

test("generated frame membership reopens on the original video frames", async ({
  datasetName,
  fiftyoneLoader,
  grid,
  modal,
  page,
  tray,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ view: "frames" }),
  });
  await grid.assert.isEntryCountTextEqualTo("40 frames");
  await grid.toggleSelectNthSample(2);
  await grid.toggleSelectNthSample(4);
  await tray.createSubset("Source frames");
  await tray.openCreatedSubset();
  await grid.assert.isEntryCountTextEqualTo("2 frames");
  await grid.openFirstSample();
  await modal.sidebar.assert.verifySidebarEntryText("frame_number", "3");
  await modal.sidebar.assert.verifySidebarEntryText("origin", "first-video");
  await modal.navigateNextSample();
  await modal.sidebar.assert.verifySidebarEntryText("frame_number", "5");
  await modal.sidebar.assert.verifySidebarEntryText("origin", "first-video");
  await modal.close();

  await tray.chooseAllSamples();
  await grid.assert.isEntryCountTextEqualTo("2 samples");
  await tray.chooseSubset("Source frames");
  await grid.assert.isEntryCountTextEqualTo("2 frames");
  await expect(tray.locator).toContainText("Act on all frames in the grid");
});

test("saved video event ranges retain their frame bounds after source edits", async ({
  browser,
  datasetName,
  fiftyoneLoader,
  grid,
  page,
  tray,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  const sidebar = new SidebarPom(page);
  await sidebar.clickFieldDropdown("events");
  await sidebar.applyLabelFromList(["braking"], "select-detections-with-label");
  await expect(tray.locator).toContainText(/1 segment across 1 sample/);
  await tray.createSubset("Frozen braking event");
  await tray.openCreatedSubset();
  await expect(tray.scope).toContainText("1 sample · 1 segment");
  await expect(grid.locator.getByTestId("saved-segment-tile")).toHaveAttribute(
    "title",
    /Event: braking/,
  );

  await fiftyoneLoader.executePythonCode(`
import fiftyone as fo
dataset = fo.load_dataset("${datasetName}")
sample = dataset.match({"name": "first-video"}).first()
sample.events.detections = []
sample.save()
`);
  const context = await browser.newContext();
  try {
    const freshPage = await context.newPage();
    await fiftyoneLoader.waitUntilGridVisible(freshPage, datasetName);
    const freshTray = new SelectionTrayPom(freshPage);
    const freshGrid = new GridPom(freshPage, new EventUtils(freshPage));
    const freshModal = new ModalPom(freshPage, new EventUtils(freshPage));
    await freshTray.chooseSubset("Frozen braking event");
    await freshGrid.assert.isTileCountEqualTo(1);
    await expect(
      freshGrid.locator.getByTestId("saved-segment-tile"),
    ).toHaveAttribute("title", /Event: braking/);
    await freshGrid.openFirstSample();
    await expect(
      freshModal.locator.getByText("Event: braking").first(),
    ).toBeVisible();
    await expect(freshModal.savedRangeBars).toHaveCount(1);
    await expect(freshModal.savedRangeBars.first()).toHaveAttribute(
      "title",
      /Event: braking.*\(0\.20-0\.80s\)/,
    );
    await expect(freshModal.video.time).toHaveText("0:00.20 / 0:02.00");
    await freshModal.close();
  } finally {
    await context.close();
  }
});
