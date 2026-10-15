import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { savedSegmentsShown } from "src/oss/poms/saved-segments";
import { SelectionTrayPom } from "src/oss/poms/selection-tray";
import { SidebarPom } from "src/oss/poms/sidebar";
import { ViewBarPom } from "src/oss/poms/viewbar/viewbar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { EventUtils } from "src/shared/event-utils";
import { MCAP_FIXTURE_CONTRACT } from "src/shared/media-factory/mcap";

const { tinyA, tinyB } = MCAP_FIXTURE_CONTRACT;
const EPISODES = [tinyA, tinyB];
const MS = 1_000_000;
/** The fixture seeks on a 30 Hz display clock, so 200 ms lands at 233 ms */
const BRAKING_START = "2024-01-01 00:00:00.233";

const test = base.extend<
  {
    datasetName: string;
    grid: GridPom;
    modal: ModalPom;
    sidebar: SidebarPom;
    tray: SelectionTrayPom;
    viewBar: ViewBarPom;
  },
  { multimodalServer: void }
>({
  multimodalServer: [
    async ({ foWebServer }, use) => {
      const previous = process.env.VFF_MULTIMODAL;
      process.env.VFF_MULTIMODAL = "1";
      try {
        await foWebServer.startWebServer();
        await use();
      } finally {
        await foWebServer.stopWebServer();
        if (previous === undefined) delete process.env.VFF_MULTIMODAL;
        else process.env.VFF_MULTIMODAL = previous;
      }
    },
    { scope: "worker", auto: true },
  ],
  datasetName: async ({ datasetFactory }, use) => {
    const datasetName = getUniqueDatasetNameWithPrefix("selection-mcap");
    await datasetFactory.createDataset({
      datasetName,
      mediaType: "multimodal",
      numSamples: EPISODES.length,
      mcapOptions: (index) => ({ kind: EPISODES[index].kind }),
      fileNames: (index) => EPISODES[index].fileName.replace(/\.mcap$/, ""),
      temporalTags: [
        {
          sample: 0,
          start: 200 * MS,
          end: 500 * MS,
          tag: "braking",
          anchor: "/camera/front",
        },
        {
          sample: 0,
          start: 1000 * MS,
          end: 1300 * MS,
          tag: "turning",
          anchor: "/points",
        },
        {
          sample: 1,
          start: 300 * MS,
          end: 600 * MS,
          tag: "braking",
          anchor: "/camera/rear",
        },
        {
          sample: 0,
          start: 300 * MS,
          end: 400 * MS,
          tag: "focus",
          anchor: "/camera/front",
        },
        {
          sample: 0,
          start: 250 * MS,
          end: 350 * MS,
          tag: "focus",
          anchor: "/points",
        },
      ],
    });
    await use(datasetName);
  },
  grid: async ({ page, eventUtils }, use) => use(new GridPom(page, eventUtils)),
  modal: async ({ page, eventUtils }, use) =>
    use(new ModalPom(page, eventUtils)),
  sidebar: async ({ page }, use) => use(new SidebarPom(page)),
  tray: async ({ page, eventUtils }, use) =>
    use(new SelectionTrayPom(page, eventUtils)),
  viewBar: async ({ page, eventUtils }, use) =>
    use(new ViewBarPom(page, eventUtils)),
});

/** Filter the grid to the braking and turning ranges: 3 across both episodes */
async function filterDrivingMoments(
  sidebar: SidebarPom,
  tray: SelectionTrayPom,
) {
  await sidebar.clickFieldDropdown("_temporal_tags");
  await sidebar.applyFilter("braking");
  await sidebar.applyFilter("turning");
  await tray.untilSettledEmpty("Act on 3 segments across 2 episodes");
}

test("saved MCAP segments reopen as parent episodes on existing tracks", async ({
  datasetName,
  fiftyoneLoader,
  grid,
  modal,
  page,
  sidebar,
  tray,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await filterDrivingMoments(sidebar, tray);

  await tray.createSubset("Driving moments");
  await grid.afterSavedSegmentsShown(() => tray.openCreatedSubset(), 2);
  await tray.assert.describesScope(
    "Browsing saved segments in Driving moments. Filters narrow episodes; temporal filters narrow ranges. 3 segments saved in this subset.",
  );
  await grid.assert.isTileCountEqualTo(2);
  await grid.assert.savedSegmentCounts(["2 segments", "1 segment"]);

  await modal.afterSavedRangesShown(
    () => modal.episode.afterReady(tinyA.fileName, () => grid.openNthSample(0)),
    modal.episode.utcTime(BRAKING_START),
  );
  await modal.episode.expectTileTitles(["camera/front", "points"]);
  await modal.assert.showsSavedRangesFor("Temporal tag: braking", [
    "Temporal tag: braking  (0.20-0.50s)",
  ]);
  await modal.assert.showsSavedRangesFor("Temporal tag: turning", [
    "Temporal tag: turning  (1.00-1.30s)",
  ]);
  await modal.episode.expectUtcTime(BRAKING_START);
  await modal.episode.navigateDatasetSample("forward", tinyB.fileName, [
    savedSegmentsShown("timeline"),
  ]);
  await modal.assert.showsSavedRangesFor("Temporal tag: turning", []);
  await modal.assert.showsSavedRangesFor("Temporal tag: braking", [
    "Temporal tag: braking  (0.30-0.60s)",
  ]);
  await modal.episode.navigateDatasetSample("backward", tinyA.fileName, [
    savedSegmentsShown("timeline"),
  ]);
  await modal.assert.showsSavedRangesFor("Temporal tag: turning", [
    "Temporal tag: turning  (1.00-1.30s)",
  ]);

  // a saved range's track starts pinned; unpinning it lasts across reopening
  await modal.episode.toggleTracksDrawer();
  const turningPin = modal.episode.savedRangePin("Temporal tag: turning");
  // component-only: the pin's pressed state is the toggle's own
  await expect(turningPin).toHaveAttribute("aria-pressed", "true");
  await turningPin.click();
  // component-only: the pin's pressed state is the toggle's own
  await expect(turningPin).toHaveAttribute("aria-pressed", "false");
  await modal.episode.toggleTracksDrawer();
  await modal.close();
  await modal.afterSavedRangesShown(
    () => modal.episode.afterReady(tinyA.fileName, () => grid.openNthSample(0)),
    modal.episode.utcTime(BRAKING_START),
  );
  await modal.episode.toggleTracksDrawer();
  // component-only: the reopened toggle shows the pin state it restored
  await expect(
    modal.episode.savedRangePin("Temporal tag: turning"),
  ).toHaveAttribute("aria-pressed", "false");
  await modal.episode.toggleTracksDrawer();
  await modal.close();
});

test("whole episodes and segments retain separate action scopes", async ({
  datasetName,
  fiftyoneLoader,
  grid,
  modal,
  page,
  sidebar,
  tray,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await tray.afterSettled(() => grid.toggleSelectNthSample(0), { cards: 1 });
  await sidebar.clickFieldDropdown("_temporal_tags");
  // both episodes have a braking range, so each tile remounts as a range
  await grid.afterCustomTilesMounted(2, () => sidebar.applyFilter("braking"));
  await tray.afterSettled(() => grid.toggleSelectNthSample(1), { cards: 2 });
  await tray.assert.pills(["1 episode selected", "1 segment selected"]);

  // the subset opens on its whole episodes; its segments are a second scope
  await tray.createSubset("Mixed drive");
  await grid.afterCustomTilesMounted(1, () => tray.openCreatedSubset());
  await grid.assert.isTileCountEqualTo(1);
  await tray.assert.pills(["1 episode selected", "1 segment selected"]);
  // The retained segment belongs to the other episode, outside this scope.
  await tray.clearKind("episode", 1, 1);
  await tray.assert.cardLabels([`${tinyB.fileName}, 1 segment, not in view`]);
  await tray.clear();
  await tray.assert.targetsAllResults();
  await modal.episode.afterReady(tinyA.fileName, () => grid.openFirstSample());
  await modal.close();

  await grid.afterSavedSegmentsShown(() =>
    tray.chooseSubset("Mixed drive", "Segments"),
  );
  await grid.assert.isTileCountEqualTo(1);
  await tray.untilSettledEmpty("Act on 1 segment across 1 episode");
  await modal.episode.afterReady(tinyB.fileName, () => grid.openFirstSample());
  await modal.close();
  await tray.afterSettled(() => grid.toggleSelectNthSample(0), { cards: 1 });
  await tray.assert.pills(["1 segment selected"]);
  await tray.createSubset("Second range only");
  await grid.afterSavedSegmentsShown(() => tray.openCreatedSubset());
  await tray.assert.describesScope(
    "Browsing saved segments in Second range only. Filters narrow episodes; temporal filters narrow ranges. 1 segment saved in this subset.",
  );
  await grid.assert.isTileCountEqualTo(1);
  await modal.episode.afterReady(tinyB.fileName, () => grid.openFirstSample());
  await modal.close();
});

test("filters narrow saved MCAP ranges without changing stored membership", async ({
  datasetName,
  fiftyoneLoader,
  grid,
  modal,
  page,
  sidebar,
  tray,
  viewBar,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await filterDrivingMoments(sidebar, tray);
  await tray.createSubset("Filterable moments");
  await grid.afterSavedSegmentsShown(() => tray.openCreatedSubset(), 2);
  await grid.assert.savedSegmentCounts(["2 segments", "1 segment"]);

  const editor = await viewBar.addStage("Limit");
  await editor.fill("limit", "1");
  await grid.afterSavedSegmentsShown(() =>
    grid.run(() => editor.commit("limit")),
  );
  await grid.assert.isTileCountEqualTo(1);
  await grid.assert.savedSegmentCounts(["2 segments"]);
  // the stored subset keeps all three
  await page.keyboard.press("Escape");
  await tray.openScope();
  await tray.assert.subsetChoiceReads(
    "Filterable moments",
    "Filterable moments 3 segments",
  );
  await page.keyboard.press("Escape");

  await grid.afterSavedSegmentsShown(
    () => grid.run(() => viewBar.removeStage(0)),
    2,
  );
  await grid.assert.isTileCountEqualTo(2);
  await grid.assert.savedSegmentCounts(["2 segments", "1 segment"]);

  // a temporal filter narrows the saved ranges to where it overlaps them
  await grid.afterSavedSegmentsShown(() =>
    grid.afterEntryCounts(() => sidebar.applyFilter("focus")),
  );
  await grid.assert.isTileCountEqualTo(1);
  await grid.assert.describesSavedSegments(
    "1 matching segment — Temporal tag: braking · Temporal tag: focus",
  );
  await modal.afterSavedRangesShown(() =>
    modal.episode.afterReady(tinyA.fileName, () => grid.openFirstSample()),
  );
  await modal.assert.showsSavedRangesFor("Temporal tag: braking", [
    "Temporal tag: braking · Temporal tag: focus  (0.30-0.40s)",
  ]);
  await modal.close();
  await grid.afterSavedSegmentsShown(
    () => grid.afterEntryCounts(() => sidebar.applyFilter("focus")),
    2,
  );
  await grid.assert.isTileCountEqualTo(2);
  await grid.assert.savedSegmentCounts(["2 segments", "1 segment"]);
});

test("tagging saved segments writes temporal ranges, not whole episodes", async ({
  datasetName,
  fiftyoneLoader,
  grid,
  openFreshPage,
  page,
  sidebar,
  tray,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await filterDrivingMoments(sidebar, tray);
  await tray.createSubset("Moments to tag");
  await grid.afterSavedSegmentsShown(() => tray.openCreatedSubset(), 2);
  await tray.afterSettled(() => grid.toggleSelectNthSample(0), { cards: 1 });
  await tray.assert.pills(["2 segments selected"]);

  // segments carry no labels of their own to tag
  await tray.openTagPicker();
  await expect(page.getByRole("radio", { name: "Labels" })).toBeDisabled();
  await tray.closeTagPicker();
  await tray.tagSamples("reviewed-range");

  const freshPage = await openFreshPage();
  await fiftyoneLoader.waitUntilGridVisible(freshPage, datasetName);
  const freshSidebar = new SidebarPom(freshPage);
  const freshEvents = new EventUtils(freshPage);
  const freshGrid = new GridPom(freshPage, freshEvents);
  const freshTray = new SelectionTrayPom(freshPage, freshEvents);
  // Captures are shared with the server session. Clear the restored pick so
  // this check acts on the tagged ranges it filters, not that explicit pick.
  await freshTray.clear();
  // a fresh page browses every episode
  await freshSidebar.clickFieldDropdown("_temporal_tags");
  await freshGrid.afterEntryCounts(() =>
    freshSidebar.applyFilter("reviewed-range"),
  );
  await freshTray.untilSettledEmpty("Act on 2 segments across 1 episode");
});
