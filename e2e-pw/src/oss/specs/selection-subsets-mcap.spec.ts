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
  tray: async ({ page }, use) => use(new SelectionTrayPom(page)),
  viewBar: async ({ page }, use) => use(new ViewBarPom(page)),
});

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
  await sidebar.clickFieldDropdown("_temporal_tags");
  await sidebar.applyFilter("braking");
  await sidebar.applyFilter("turning");
  await expect(tray.locator).toContainText("3 segments across 2 episodes");

  await tray.createSubset("Driving moments");
  await tray.openCreatedSubset();
  await expect(tray.scope).toContainText("Driving moments");
  await expect(tray.scope).toContainText("2 episodes · 3 segments");
  await grid.assert.isTileCountEqualTo(2);
  const savedBadges = grid.locator.getByTestId("saved-segment-tile");
  await expect(savedBadges).toHaveCount(2);
  await expect(savedBadges.nth(0)).toContainText("2 segments");
  await expect(savedBadges.nth(1)).toContainText("1 segment");

  await grid.openNthSample(0);
  await modal.episode.waitForReady(MCAP_FIXTURE_CONTRACT.tinyA.fileName);
  await modal.episode.expectTileTitles(["camera/front", "points"]);
  await expect(
    modal.savedRangeBarsFor("Temporal tag: braking"),
  ).toHaveAttribute("title", /Temporal tag: braking.*\(0\.20-0\.50s\)/);
  await expect(
    modal.savedRangeBarsFor("Temporal tag: turning"),
  ).toHaveAttribute("title", /Temporal tag: turning.*\(1\.00-1\.30s\)/);
  // The fixture seeks on a 30 Hz display clock, so 200 ms lands at 233 ms.
  await modal.episode.expectUtcTime("2024-01-01 00:00:00.233");
  await modal.episode.navigateDatasetSample(
    "forward",
    MCAP_FIXTURE_CONTRACT.tinyB.fileName,
  );
  await expect(modal.savedRangeBarsFor("Temporal tag: turning")).toHaveCount(0);
  await expect(
    modal.savedRangeBarsFor("Temporal tag: braking"),
  ).toHaveAttribute("title", /Temporal tag: braking.*\(0\.30-0\.60s\)/);
  await modal.episode.navigateDatasetSample(
    "backward",
    MCAP_FIXTURE_CONTRACT.tinyA.fileName,
  );
  await expect(
    modal.savedRangeBarsFor("Temporal tag: turning"),
  ).toHaveAttribute("title", /Temporal tag: turning.*\(1\.00-1\.30s\)/);
  await modal.episode.toggleTracksDrawer();
  const turningPin = modal.episode.savedRangePin("Temporal tag: turning");
  await expect(turningPin).toHaveAttribute("aria-pressed", "true");
  await turningPin.click();
  await expect(turningPin).toHaveAttribute("aria-pressed", "false");
  await modal.episode.toggleTracksDrawer();
  await modal.close();
  await grid.openNthSample(0);
  await modal.episode.waitForReady(MCAP_FIXTURE_CONTRACT.tinyA.fileName);
  await modal.episode.expectUtcTime("2024-01-01 00:00:00.233");
  await modal.episode.toggleTracksDrawer();
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
  await grid.toggleSelectNthSample(0);
  await sidebar.clickFieldDropdown("_temporal_tags");
  await sidebar.applyFilter("braking");
  await grid.toggleSelectNthSample(1);
  await expect(tray.locator).toContainText(/1\s*episode selected/);
  await expect(tray.locator).toContainText(/1\s*segment selected/);

  await tray.createSubset("Mixed drive");
  await tray.openCreatedSubset();
  await tray.chooseSubset("Mixed drive", "Whole episodes");
  await grid.assert.isTileCountEqualTo(1);
  await expect(tray.locator).toContainText("Act on all episodes in the grid");
  await grid.openFirstSample();
  await modal.episode.waitForReady(MCAP_FIXTURE_CONTRACT.tinyA.fileName);
  await modal.close();

  await tray.chooseSubset("Mixed drive", "Segments");
  await grid.assert.isTileCountEqualTo(1);
  await expect(tray.locator).toContainText("Act on 1 segment across 1 episode");
  await grid.openFirstSample();
  await modal.episode.waitForReady(MCAP_FIXTURE_CONTRACT.tinyB.fileName);
  await modal.close();
  await grid.toggleSelectNthSample(0);
  await expect(tray.locator).toContainText(/1\s*segment selected/);
  await tray.createSubset("Second range only");
  await tray.openCreatedSubset();
  await expect(tray.scope).toContainText(/1 episode\s*·\s*1 segment/);
  await grid.assert.isTileCountEqualTo(1);
  await grid.openFirstSample();
  await modal.episode.waitForReady(MCAP_FIXTURE_CONTRACT.tinyB.fileName);
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
  await sidebar.clickFieldDropdown("_temporal_tags");
  await sidebar.applyFilter("braking");
  await sidebar.applyFilter("turning");
  await tray.createSubset("Filterable moments");
  await tray.openCreatedSubset();
  await expect(tray.scope).toContainText(/2 episodes\s*·\s*3 segments/);

  const editor = await viewBar.addStage("Limit");
  await editor.fill("limit", "1");
  await grid.run(() => editor.commit("limit"));
  await grid.assert.isTileCountEqualTo(1);
  await expect(tray.scope).toContainText(/1 episode\s*·\s*2 segments/);
  await page.keyboard.press("Escape");
  await tray.openScope();
  await expect(tray.subsetChoices("Filterable moments")).toContainText(
    "3 segments",
  );
  await page.keyboard.press("Escape");

  await viewBar.expand();
  await viewBar.viewStages
    .first()
    .getByRole("button", { name: "Remove stage" })
    .click();
  await grid.assert.isTileCountEqualTo(2);
  await expect(tray.scope).toContainText(/2 episodes\s*·\s*3 segments/);

  await sidebar.applyFilter("focus");
  await grid.assert.isTileCountEqualTo(1);
  await expect(tray.scope).toContainText(/1 episode\s*·\s*1 segment/);
  await expect(grid.locator.getByTestId("saved-segment-tile")).toHaveAttribute(
    "title",
    /Temporal tag: braking.*Temporal tag: focus/,
  );
  await grid.openFirstSample();
  await modal.episode.waitForReady(MCAP_FIXTURE_CONTRACT.tinyA.fileName);
  await expect(
    modal.savedRangeBarsFor("Temporal tag: braking"),
  ).toHaveAttribute("title", /Temporal tag: braking.*\(0\.30-0\.40s\)/);
  await modal.close();
  await sidebar.applyFilter("focus");
  await grid.assert.isTileCountEqualTo(2);
  await expect(tray.scope).toContainText(/2 episodes\s*·\s*3 segments/);
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
  await sidebar.clickFieldDropdown("_temporal_tags");
  await sidebar.applyFilter("braking");
  await sidebar.applyFilter("turning");
  await tray.createSubset("Moments to tag");
  await tray.openCreatedSubset();
  await grid.toggleSelectNthSample(0);
  await expect(tray.locator).toContainText(/2\s*segments selected/);

  const tagTrigger = tray.locator.getByRole("button", {
    name: "Tag",
    exact: true,
  });
  await tagTrigger.click();
  await expect(page.getByRole("radio", { name: "Labels" })).toBeDisabled();
  await tagTrigger.click();
  await tray.tagSamples("reviewed-range");

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
    const freshTray = new SelectionTrayPom(freshPage);
    // The server session may still be browsing the saved subset. Start from
    // the full dataset so this checks the temporal tag filter itself.
    await freshTray.chooseAllSamples();
    await freshSidebar.clickFieldDropdown("_temporal_tags");
    await freshSidebar.applyFilter("reviewed-range");
    await expect(freshTray.locator).toContainText(
      /2 segments across 1 episode/,
    );
  } finally {
    await context.close();
  }
});
