import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { SelectionTrayPom } from "src/oss/poms/selection-tray";
import { SidebarPom } from "src/oss/poms/sidebar";
import { ViewBarPom } from "src/oss/poms/viewbar/viewbar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { EventUtils } from "src/shared/event-utils";
import { MCAP_FIXTURE_CONTRACT } from "src/shared/media-factory/mcap";

type McapMedia = { readonly episodeA: string; readonly episodeB: string };
const test = base.extend<
  {
    datasetName: string;
    grid: GridPom;
    modal: ModalPom;
    sidebar: SidebarPom;
    tray: SelectionTrayPom;
    viewBar: ViewBarPom;
  },
  { mcapMedia: McapMedia }
>({
  mcapMedia: [
    async ({ foWebServer, mediaFactory }, use) => {
      const previous = process.env.VFF_MULTIMODAL;
      process.env.VFF_MULTIMODAL = "1";
      const directory = await fs.mkdtemp(
        path.join(os.tmpdir(), "selection-mcap-"),
      );
      const episodeA = path.join(
        directory,
        MCAP_FIXTURE_CONTRACT.tinyA.fileName,
      );
      const episodeB = path.join(
        directory,
        MCAP_FIXTURE_CONTRACT.tinyB.fileName,
      );
      try {
        await foWebServer.startWebServer();
        await Promise.all([
          mediaFactory.createMcapFixture({
            kind: MCAP_FIXTURE_CONTRACT.tinyA.kind,
            outputPath: episodeA,
          }),
          mediaFactory.createMcapFixture({
            kind: MCAP_FIXTURE_CONTRACT.tinyB.kind,
            outputPath: episodeB,
          }),
        ]);
        await use({ episodeA, episodeB });
      } finally {
        await foWebServer.stopWebServer();
        await fs.rm(directory, { recursive: true, force: true });
        if (previous === undefined) delete process.env.VFF_MULTIMODAL;
        else process.env.VFF_MULTIMODAL = previous;
      }
    },
    { scope: "worker", auto: true },
  ],
  datasetName: async ({ fiftyoneLoader, mcapMedia }, use) => {
    const datasetName = getUniqueDatasetNameWithPrefix("selection-mcap");
    await fiftyoneLoader.executePythonCode(`
import fiftyone as fo
import fiftyone.core.tags as fot

dataset = fo.Dataset("${datasetName}")
dataset.persistent = True
dataset.add_samples([
    fo.Sample(filepath=r"${mcapMedia.episodeA}", name="first-episode"),
    fo.Sample(filepath=r"${mcapMedia.episodeB}", name="second-episode"),
])
first, second = list(dataset)
fot.add_temporal_tags(dataset, [
    fot.TemporalTag(first.id, 200_000_000, 500_000_000, "braking", anchor="/camera/front"),
    fot.TemporalTag(first.id, 1_000_000_000, 1_300_000_000, "turning", anchor="/points"),
    fot.TemporalTag(second.id, 300_000_000, 600_000_000, "braking", anchor="/camera/rear"),
    fot.TemporalTag(first.id, 300_000_000, 400_000_000, "focus", anchor="/camera/front"),
    fot.TemporalTag(first.id, 250_000_000, 350_000_000, "focus", anchor="/points"),
])
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
  sidebar: async ({ page }, use) => use(new SidebarPom(page)),
  tray: async ({ page, eventUtils }, use) =>
    use(new SelectionTrayPom(page, eventUtils)),
  viewBar: async ({ page, eventUtils }, use) =>
    use(new ViewBarPom(page, eventUtils)),
});

/** Apply the braking then turning temporal-tag filters: 3 segments, 2 episodes */
const filterDrivingMoments = async (
  grid: GridPom,
  sidebar: SidebarPom,
  tray: SelectionTrayPom,
) => {
  await sidebar.clickFieldDropdown("_temporal_tags");
  await grid.run(() => sidebar.applyFilter("braking"));
  await tray.afterTray(
    (shown) => !shown.explicit && shown.segments === 3,
    () => grid.run(() => sidebar.applyFilter("turning")),
  );
};

test("saved MCAP segments reopen as parent episodes on existing tracks", async ({
  datasetName,
  eventUtils,
  fiftyoneLoader,
  grid,
  modal,
  page,
  sidebar,
  tray,
}) => {
  const { tinyA, tinyB } = MCAP_FIXTURE_CONTRACT;
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await filterDrivingMoments(grid, sidebar, tray);
  await tray.assert.contains("3 segments across 2 episodes");

  await tray.createSubset("Driving moments");
  await eventUtils.afterAll(
    [
      tray.savedSegmentsShown({ count: 2 }),
      tray.savedSegmentsShown({ count: 1 }),
    ],
    () =>
      grid.run(() =>
        tray.openCreatedSubset("Driving moments", "2 episodes · 3 segments"),
      ),
  );
  await tray.assert.scopeContains("Driving moments");
  await tray.assert.scopeContains("2 episodes · 3 segments");
  await grid.assert.isTileCountEqualTo(2);
  const savedBadges = grid.locator.getByTestId("saved-segment-tile");
  expect(await savedBadges.count()).toBe(2);
  expect(await savedBadges.nth(0).textContent()).toContain("2 segments");
  expect(await savedBadges.nth(1).textContent()).toContain("1 segment");

  const barTitle = async (label: string) =>
    modal.savedRangeBarsFor(label).getAttribute("title");
  const turningPin = modal.episode.savedRangePin("Temporal tag: turning");
  // The fixture seeks on a 30 Hz display clock, so 200 ms lands at 233 ms.
  await modal.episode.afterReady(tinyA.fileName, () => grid.openNthSample(0), [
    modal.savedRangeShown("Temporal tag: braking", "0.20-0.50"),
    modal.savedRangeShown("Temporal tag: turning", "1.00-1.30", true),
    modal.episode.utcTime("2024-01-01 00:00:00.233"),
  ]);
  await modal.episode.expectTileTitles(["camera/front", "points"]);
  expect(await barTitle("Temporal tag: braking")).toMatch(
    /Temporal tag: braking.*\(0\.20-0\.50s\)/,
  );
  expect(await barTitle("Temporal tag: turning")).toMatch(
    /Temporal tag: turning.*\(1\.00-1\.30s\)/,
  );
  await modal.episode.expectUtcTime("2024-01-01 00:00:00.233");
  await modal.episode.navigateDatasetSample("forward", tinyB.fileName, [
    modal.savedRangeShown("Temporal tag: braking", "0.30-0.60"),
  ]);
  expect(await modal.savedRangeBarsFor("Temporal tag: turning").count()).toBe(
    0,
  );
  expect(await barTitle("Temporal tag: braking")).toMatch(
    /Temporal tag: braking.*\(0\.30-0\.60s\)/,
  );
  await modal.episode.navigateDatasetSample("backward", tinyA.fileName, [
    modal.savedRangeShown("Temporal tag: turning", "1.00-1.30", true),
  ]);
  expect(await barTitle("Temporal tag: turning")).toMatch(
    /Temporal tag: turning.*\(1\.00-1\.30s\)/,
  );
  await modal.episode.toggleTracksDrawer();
  expect(await turningPin.getAttribute("aria-pressed")).toBe("true");
  await modal.episode.after(
    [modal.savedRangeShown("Temporal tag: turning", "1.00-1.30", false)],
    () => turningPin.click(),
  );
  expect(await turningPin.getAttribute("aria-pressed")).toBe("false");
  await modal.episode.toggleTracksDrawer();
  await modal.close();

  // the drawer's rows stay mounted while it is closed, so the unpinned row
  // shows as the modal opens
  await modal.episode.afterReady(tinyA.fileName, () => grid.openNthSample(0), [
    modal.episode.utcTime("2024-01-01 00:00:00.233"),
    modal.savedRangeShown("Temporal tag: turning", "1.00-1.30", false),
  ]);
  await modal.episode.expectUtcTime("2024-01-01 00:00:00.233");
  await modal.episode.toggleTracksDrawer();
  expect(await turningPin.getAttribute("aria-pressed")).toBe("false");
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
  const { tinyA, tinyB } = MCAP_FIXTURE_CONTRACT;
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await tray.afterTray(
    (shown) => shown.explicit && shown.fullEpisodes === 1,
    () => grid.toggleSelectNthSample(0),
  );
  await sidebar.clickFieldDropdown("_temporal_tags");
  await grid.run(() => sidebar.applyFilter("braking"));
  await tray.afterTray(
    (shown) =>
      shown.explicit && shown.fullEpisodes === 1 && shown.segments === 1,
    () => grid.toggleSelectNthSample(1),
  );
  await tray.assert.contains(/1\s*episode selected/);
  await tray.assert.contains(/1\s*segment selected/);

  await tray.createSubset("Mixed drive");
  await tray.afterResults(
    () => grid.run(() => tray.openCreatedSubset("Mixed drive")),
    1,
  );
  // a mixed subset opens on its whole episodes, so this re-chooses its scope
  await tray.chooseSubset("Mixed drive", "Whole episodes");
  await grid.assert.isTileCountEqualTo(1);
  await tray.assert.contains("Act on all episodes in the grid");
  await modal.episode.afterReady(tinyA.fileName, () => grid.openFirstSample());
  await modal.close();

  await tray.afterTray(
    (shown) => !shown.explicit && shown.segments === 1,
    () => grid.run(() => tray.chooseSubset("Mixed drive", "Segments")),
  );
  await grid.assert.isTileCountEqualTo(1);
  await tray.assert.contains("Act on 1 segment across 1 episode");
  await modal.episode.afterReady(tinyB.fileName, () => grid.openFirstSample());
  await modal.close();
  await tray.afterTray(
    (shown) => shown.explicit && shown.segments === 1,
    () => grid.toggleSelectNthSample(0),
  );
  await tray.assert.contains(/1\s*segment selected/);
  await tray.createSubset("Second range only");
  await grid.run(() =>
    tray.openCreatedSubset("Second range only", "1 episode · 1 segment"),
  );
  await tray.assert.scopeContains(/1 episode\s*·\s*1 segment/);
  await grid.assert.isTileCountEqualTo(1);
  await modal.episode.afterReady(tinyB.fileName, () => grid.openFirstSample());
  await modal.close();
});

test("filters narrow saved MCAP ranges without changing stored membership", async ({
  datasetName,
  eventUtils,
  fiftyoneLoader,
  grid,
  modal,
  page,
  sidebar,
  tray,
  viewBar,
}) => {
  const name = "Filterable moments";
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await filterDrivingMoments(grid, sidebar, tray);
  await tray.createSubset(name);
  await grid.run(() => tray.openCreatedSubset(name, "2 episodes · 3 segments"));
  await tray.assert.scopeContains(/2 episodes\s*·\s*3 segments/);

  const editor = await viewBar.addStage("Limit");
  await editor.fill("limit", "1");
  await tray.afterScope({ label: name, count: "1 episode · 2 segments" }, () =>
    grid.run(() => editor.commit("limit")),
  );
  await grid.assert.isTileCountEqualTo(1);
  await tray.assert.scopeContains(/1 episode\s*·\s*2 segments/);
  await page.keyboard.press("Escape");
  await tray.openScope();
  expect(await tray.subsetChoices(name).textContent()).toContain("3 segments");
  await page.keyboard.press("Escape");

  await viewBar.expand();
  await tray.afterScope({ label: name, count: "2 episodes · 3 segments" }, () =>
    grid.run(() =>
      viewBar.viewStages
        .first()
        .getByRole("button", { name: "Remove stage" })
        .click(),
    ),
  );
  await grid.assert.isTileCountEqualTo(2);
  await tray.assert.scopeContains(/2 episodes\s*·\s*3 segments/);

  await eventUtils.afterAll(
    [
      tray.scopeShown({ label: name, count: "1 episode · 1 segment" }),
      tray.savedSegmentsShown({
        title: /Temporal tag: braking.*Temporal tag: focus/,
      }),
    ],
    () => grid.run(() => sidebar.applyFilter("focus")),
  );
  await grid.assert.isTileCountEqualTo(1);
  await tray.assert.scopeContains(/1 episode\s*·\s*1 segment/);
  expect(
    await grid.locator.getByTestId("saved-segment-tile").getAttribute("title"),
  ).toMatch(/Temporal tag: braking.*Temporal tag: focus/);
  await modal.episode.afterReady(
    MCAP_FIXTURE_CONTRACT.tinyA.fileName,
    () => grid.openFirstSample(),
    [modal.savedRangeShown("Temporal tag: braking", "0.30-0.40")],
  );
  expect(
    await modal
      .savedRangeBarsFor("Temporal tag: braking")
      .getAttribute("title"),
  ).toMatch(/Temporal tag: braking.*\(0\.30-0\.40s\)/);
  await modal.close();
  await tray.afterScope({ label: name, count: "2 episodes · 3 segments" }, () =>
    grid.run(() => sidebar.applyFilter("focus")),
  );
  await grid.assert.isTileCountEqualTo(2);
  await tray.assert.scopeContains(/2 episodes\s*·\s*3 segments/);
});

test("tagging saved segments writes temporal ranges, not whole episodes", async ({
  browser,
  datasetName,
  fiftyoneLoader,
  grid,
  page,
  sidebar,
  tray,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await filterDrivingMoments(grid, sidebar, tray);
  await tray.createSubset("Moments to tag");
  await grid.run(() => tray.openCreatedSubset("Moments to tag"));
  await tray.afterTray(
    (shown) => shown.explicit && shown.segments === 2,
    () => grid.toggleSelectNthSample(0),
  );
  await tray.assert.contains(/2\s*segments selected/);

  await tray.openTagPicker();
  expect(await page.getByRole("radio", { name: "Labels" }).isDisabled()).toBe(
    true,
  );
  await tray.closeTagPicker();
  await grid.run(() => tray.tagSamples("reviewed-range"));

  await fiftyoneLoader.executePythonCode(`
import fiftyone as fo
import fiftyone.core.tags as fot

dataset = fo.load_dataset("${datasetName}")
first, second = list(dataset)
assert not first.tags and not second.tags
reviewed = [tag for tag in fot.list_temporal_tags(dataset) if tag.tag == "reviewed-range"]
assert sorted((tag.sample_id, tag.start, tag.end, tag.anchor) for tag in reviewed) == sorted([
    (first.id, 200_000_000, 500_000_000, "/camera/front"),
    (first.id, 1_000_000_000, 1_300_000_000, "/points"),
])
`);

  const context = await browser.newContext();
  try {
    const freshPage = await context.newPage();
    await fiftyoneLoader.waitUntilGridVisible(freshPage, datasetName);
    const freshSidebar = new SidebarPom(freshPage);
    const freshTray = new SelectionTrayPom(
      freshPage,
      new EventUtils(freshPage),
    );
    // The server session may still be browsing the saved subset. Start from
    // the full dataset so this checks the temporal tag filter itself.
    await freshTray.chooseAllSamples();
    await freshSidebar.clickFieldDropdown("_temporal_tags");
    await freshTray.afterTray(
      (shown) => !shown.explicit && shown.segments === 2,
      () => freshSidebar.applyFilter("reviewed-range"),
    );
    await freshTray.assert.contains(/2 segments across 1 episode/);
  } finally {
    await context.close();
  }
});
