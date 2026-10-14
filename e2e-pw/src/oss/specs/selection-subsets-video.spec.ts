import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { SavedQueriesPom } from "src/oss/poms/saved-queries";
import { SelectionTrayPom } from "src/oss/poms/selection-tray";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { EventUtils } from "src/shared/event-utils";

/** Two 2s videos at 10fps: the first with three events, the second none */
const VIDEOS = ["first-video", "control-video"];

const test = base.extend<{
  datasetName: string;
  grid: GridPom;
  modal: ModalPom;
  savedQueries: SavedQueriesPom;
  tray: SelectionTrayPom;
}>({
  datasetName: async ({ datasetFactory }, use) => {
    const datasetName = getUniqueDatasetNameWithPrefix("selection-video");
    await datasetFactory.createDataset({
      datasetName,
      mediaType: "video",
      numSamples: VIDEOS.length,
      videoOptions: (index) => ({
        duration: 2,
        frameRate: 10,
        width: 64,
        height: 64,
        color: index ? "#335599" : "#995533",
      }),
      schema: {
        name: "StringField",
        events: "TemporalDetections",
        "frames.origin": "StringField",
      },
      withSampleData: ({ index }, { label }) => ({
        name: VIDEOS[index],
        ...(index
          ? {}
          : {
              events: label.temporalDetections([
                label.temporalDetection({ label: "braking", support: [3, 8] }),
                label.temporalDetection({
                  label: "turning",
                  support: [12, 17],
                }),
                label.temporalDetection({
                  label: "parking",
                  support: [18, 20],
                }),
              ]),
            }),
      }),
      withFrameData: ({ sampleIndex }) => ({ origin: VIDEOS[sampleIndex] }),
      savedViews: {
        clips: 'dataset.to_clips("events")',
        frames: "dataset.to_frames(sample_frames=True)",
      },
    });
    await use(datasetName);
  },
  grid: async ({ page, eventUtils }, use) => use(new GridPom(page, eventUtils)),
  modal: async ({ page, eventUtils }, use) =>
    use(new ModalPom(page, eventUtils)),
  savedQueries: async ({ page, eventUtils }, use) =>
    use(new SavedQueriesPom(page, eventUtils)),
  tray: async ({ page, eventUtils }, use) =>
    use(new SelectionTrayPom(page, eventUtils)),
});

test.beforeAll(async ({ foWebServer }) => foWebServer.startWebServer());
test.afterAll(async ({ foWebServer }) => foWebServer.stopWebServer());

test("two clips from one video survive leaving and reopening the converted view", async ({
  datasetName,
  fiftyoneLoader,
  grid,
  modal,
  page,
  savedQueries,
  tray,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ view: "clips" }),
  });
  await grid.assert.isEntryCountTextEqualTo("3 clips");
  await tray.afterSettled(() => grid.toggleSelectNthSample(0), { cards: 1 });
  await tray.assert.pills(["1 clip selected"]);
  await tray.afterSettled(() => grid.toggleSelectNthSample(1), { cards: 2 });
  await tray.assert.pills(["2 clips selected"]);
  expect(await tray.cards.count()).toBe(2);
  await tray.createSubset("Two moments");
  await grid.afterEntryCounts(() => tray.openCreatedSubset());
  await grid.assert.isEntryCountTextEqualTo("2 clips");
  await modal.afterSampleLoaded(() => grid.openFirstSample());
  await modal.sidebar.assert.verifySidebarEntryText("support", "[3, 8]");
  await modal.navigateNextSample();
  await modal.sidebar.assert.verifySidebarEntryText("support", "[12, 17]");
  await modal.close();

  // All samples leaves the subset's clips for the videos; the saved clips
  // view still holds the moment the subset left out
  await grid.afterEntryCounts(() => tray.chooseAllSamples());
  await grid.assert.isEntryCountTextEqualTo("2 samples");
  await savedQueries.open();
  await grid.afterEntryCounts(() => savedQueries.load("clips"));
  await grid.assert.isEntryCountTextEqualTo("3 clips");
  await modal.afterSampleLoaded(() => grid.openNthSample(2));
  await modal.sidebar.assert.verifySidebarEntryText("support", "[18, 20]");
  await modal.close();
  await grid.afterEntryCounts(() => tray.chooseSubset("Two moments"));
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
  await tray.afterSettled(() => grid.toggleSelectNthSample(2), { cards: 1 });
  await tray.afterSettled(() => grid.toggleSelectNthSample(4), { cards: 2 });
  await tray.createSubset("Source frames");
  await grid.afterEntryCounts(() => tray.openCreatedSubset());
  await grid.assert.isEntryCountTextEqualTo("2 frames");
  await modal.afterSampleLoaded(() => grid.openFirstSample());
  await modal.sidebar.assert.verifySidebarEntryText("frame_number", "3");
  await modal.sidebar.assert.verifySidebarEntryText("origin", "first-video");
  await modal.navigateNextSample();
  await modal.sidebar.assert.verifySidebarEntryText("frame_number", "5");
  await modal.sidebar.assert.verifySidebarEntryText("origin", "first-video");
  await modal.close();

  // leaving the subset leaves the frames view it was captured in; each
  // switch counts its own scope from the first count shown
  await grid.afterEntryCounts(() => tray.chooseAllSamples());
  await grid.assert.isEntryCountTextEqualTo("2 samples");
  await grid.afterEntryCounts(() => tray.chooseSubset("Source frames"));
  await tray.untilSettledEmpty();
  await grid.assert.isEntryCountTextEqualTo("2 frames");
  await tray.assert.targetsAllResults();
});

test("saved video event ranges retain their frame bounds after source edits", async ({
  datasetName,
  fiftyoneLoader,
  grid,
  openFreshPage,
  page,
  tray,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  const sidebar = new SidebarPom(page);
  await sidebar.clickFieldDropdown("events");
  await grid.afterEntryCounts(() =>
    sidebar.applyLabelFromList(["braking"], "select-detections-with-label"),
  );
  await tray.untilSettledEmpty("Act on 1 segment across 1 sample");
  await tray.createSubset("Frozen braking event");
  await grid.afterSavedSegmentsShown(() => tray.openCreatedSubset());
  await tray.assert.describesScope(
    "Browsing saved segments in Frozen braking event. Filters narrow samples; temporal filters narrow ranges. 1 segment saved in this subset.",
  );
  await grid.assert.describesSavedSegments("1 saved segment — Event: braking");

  await fiftyoneLoader.executePythonCode(`
import fiftyone as fo
dataset = fo.load_dataset("${datasetName}")
sample = dataset.match({"name": "first-video"}).first()
sample.events.detections = []
sample.save()
`);
  const freshPage = await openFreshPage();
  await fiftyoneLoader.waitUntilGridVisible(freshPage, datasetName);
  const freshEvents = new EventUtils(freshPage);
  const freshTray = new SelectionTrayPom(freshPage, freshEvents);
  const freshGrid = new GridPom(freshPage, freshEvents);
  const freshModal = new ModalPom(freshPage, freshEvents);
  await freshGrid.afterSavedSegmentsShown(() =>
    freshGrid.afterEntryCounts(() =>
      freshTray.chooseSubset("Frozen braking event"),
    ),
  );
  await freshGrid.assert.isTileCountEqualTo(1);
  await freshGrid.assert.describesSavedSegments(
    "1 saved segment — Event: braking",
  );
  // the video opens at the saved range, which its timeline still marks
  await freshModal.afterSavedRangesShown(
    () => freshGrid.openFirstSample(),
    freshModal.video.playhead("0:00.20 / 0:02.00"),
  );
  await freshModal.assert.showsSavedRanges(["Event: braking  (0.20-0.80s)"]);
  await freshModal.assert.playheadReads("0:00.20 / 0:02.00");
  await freshModal.close();
});
