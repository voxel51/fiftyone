import type { Page } from "@playwright/test";
import {
  cameraPoseFileNames,
  expect,
  openMcapModal,
  sampleIndex,
  sidebarFileNames,
  test,
  tinyA,
  tinyB,
  workspaceDatasetName,
} from "src/oss/fixtures/mcap";
import { ModalPom } from "src/oss/poms/modal";

const EPISODE_LAYOUT_STORAGE_KEY = "fiftyone.episode.modal-layout.v3";

test.describe("MCAP persistence", () => {
  test.describe("workspace persistence", () => {
    test.use({ targetDatasetName: workspaceDatasetName });

    test("restores a customized episode workspace across navigation, reopen, and reload", async ({
      grid,
      modal,
      page,
    }) => {
      await openMcapModal(grid, modal, 0);
      await modal.episode.waitForReady(tinyA.fileName);
      await modal.episode.expectTileCount(2);
      await modal.episode.expectTileTitles(
        ["camera/front", "points"],
        ["Logs / Diagnostics", "/pose"],
      );

      await modal.episode.addTile("log", "Logs / Diagnostics");
      await modal.episode.addTile("message", "Message");
      await modal.episode.selectMessageSource("Message", "/pose");
      await modal.episode.expectRawField("position.x", tinyA.poseX[0]);
      await modal.episode.closeTile("points");
      await modal.episode.expectTileCount(3);
      await modal.episode.expectTileTitles(
        ["camera/front", "Logs / Diagnostics", "/pose"],
        ["points"],
      );
      await modal.episode.fullscreenTile("Logs / Diagnostics");
      await waitForCustomizedWorkspaceSave(page);

      await modal.episode.navigateDatasetSample("forward", tinyB.fileName);
      await modal.episode.expectTileCount(2);
      await modal.episode.expectTileTitleCount("camera/rear", 1);
      await modal.episode.expectTileTitles(
        ["camera/rear", "/status"],
        ["camera/front", "Logs / Diagnostics", "/pose", "points"],
      );
      await modal.episode.focusRawTile("/status");
      await modal.episode.expectRawField("status_code", tinyB.statusCodes[0]);
      await modal.episode.expectNoViewerError();

      await modal.episode.navigateDatasetSample("backward", tinyA.fileName);
      await expectRestoredWorkspace(modal);

      await modal.episode.fullscreenTile("Logs / Diagnostics");
      await modal.close();
      await openMcapModal(grid, modal, 0);
      await modal.episode.waitForReady(tinyA.fileName);
      await expectRestoredWorkspace(modal);

      await modal.episode.fullscreenTile("Logs / Diagnostics");
      await modal.close();
      await page.reload();
      await expect(grid.locator).toBeVisible({ timeout: 30_000 });
      await openMcapModal(grid, modal, 0);
      await modal.episode.waitForReady(tinyA.fileName);
      await expectRestoredWorkspace(modal);
    });
  });

  test("restores an image pane source across sample navigation and modal reopen", async ({
    grid,
    modal,
  }) => {
    await openMcapModal(grid, modal, sampleIndex.episodeB);
    await modal.episode.waitForReady(tinyB.fileName);
    await modal.episode.selectImageSource("camera/rear", "camera/side");
    await modal.episode.expectTileTitleCount("camera/side", 2);
    await modal.episode.expectTileTitles([], ["camera/rear"]);

    await modal.episode.navigateDatasetSample("backward", tinyA.fileName);
    await modal.episode.expectTileTitles(
      ["camera/front"],
      ["camera/side", "camera/rear"],
    );

    await modal.episode.navigateDatasetSample("forward", tinyB.fileName);
    await modal.episode.expectTileTitleCount("camera/side", 2);
    await modal.episode.expectTileTitles([], ["camera/rear"]);

    await modal.close();
    await openMcapModal(grid, modal, sampleIndex.episodeB);
    await modal.episode.waitForReady(tinyB.fileName);
    await modal.episode.expectTileTitleCount("camera/side", 2);
    await modal.episode.expectTileTitles([], ["camera/rear"]);
  });

  test("persists the ego camera pose across channel-id changes, modal reopen, and reload", async ({
    grid,
    modal,
    page,
  }) => {
    await openMcapModal(grid, modal, sampleIndex.cameraPoseStart);
    await modal.episode.waitForReady(cameraPoseFileNames[0]);
    const egoPose = await modal.episode.applyEgoView("points");

    for (const fileName of cameraPoseFileNames.slice(1)) {
      await modal.episode.navigateDatasetSample("forward", fileName);
      await modal.episode.expectCameraPose("points", egoPose);
    }

    await modal.close();
    await openMcapModal(
      grid,
      modal,
      sampleIndex.cameraPoseStart + cameraPoseFileNames.length - 1,
    );
    await modal.episode.waitForReady(cameraPoseFileNames[3]);
    await modal.episode.expectCameraPose("points", egoPose);

    await modal.close();
    await page.reload();
    await expect(grid.locator).toBeVisible({ timeout: 30_000 });
    await openMcapModal(
      grid,
      modal,
      sampleIndex.cameraPoseStart + cameraPoseFileNames.length - 1,
    );
    await modal.episode.waitForReady(cameraPoseFileNames[3]);
    await modal.episode.expectCameraPose("points", egoPose);
  });

  test("persists dataset sidebar settings across channel ids, remount, and reload", async ({
    grid,
    modal,
    page,
  }) => {
    await openMcapModal(grid, modal, sampleIndex.sidebarStart);
    await modal.episode.waitForReady(sidebarFileNames[0]);
    await setRepresentativeSidebarPreferences(modal);

    for (const fileName of sidebarFileNames.slice(1)) {
      await modal.episode.navigateDatasetSample("forward", fileName);
      await expectRepresentativeSidebarPreferences(modal);
    }

    await modal.close();
    await openMcapModal(
      grid,
      modal,
      sampleIndex.sidebarStart + sidebarFileNames.length - 1,
    );
    await modal.episode.waitForReady(sidebarFileNames[3]);
    await expectRepresentativeSidebarPreferences(modal);

    await modal.close();
    await page.reload();
    await expect(grid.locator).toBeVisible({ timeout: 30_000 });
    await openMcapModal(
      grid,
      modal,
      sampleIndex.sidebarStart + sidebarFileNames.length - 1,
    );
    await modal.episode.waitForReady(sidebarFileNames[3]);
    await expectRepresentativeSidebarPreferences(modal);
  });
});

async function waitForCustomizedWorkspaceSave(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate((storageKey) => {
          const raw = localStorage.getItem(storageKey);
          if (!raw) return false;
          const parsed = JSON.parse(raw) as {
            byDataset?: Record<string, Record<string, unknown>>;
          };
          // Layouts are keyed by opaque dataset ID. A fresh Playwright context
          // loads exactly one dataset before this assertion.
          const entries = Object.values(parsed.byDataset ?? {});
          if (entries.length !== 1) return false;
          const [entry] = entries;
          const collectTileIds = (node: unknown): string[] => {
            if (typeof node === "string") return [node];
            if (!node || typeof node !== "object") return [];
            const branch = node as { first?: unknown; second?: unknown };
            return [
              ...collectTileIds(branch.first),
              ...collectTileIds(branch.second),
            ];
          };
          const tileTypes = collectTileIds(entry.layout)
            .map((tileId) => tileId.split("-", 1)[0])
            .sort();
          const rawStreams =
            entry.rawStreams && typeof entry.rawStreams === "object"
              ? Object.values(entry.rawStreams)
              : [];
          return (
            typeof entry.expandedTileId === "string" &&
            entry.expandedTileId.startsWith("log-") &&
            tileTypes.join(",") === "image,log,raw" &&
            rawStreams.length === 1
          );
        }, EPISODE_LAYOUT_STORAGE_KEY),
      { timeout: 10_000 },
    )
    .toBe(true);
}

async function setRepresentativeSidebarPreferences(
  modal: ModalPom,
): Promise<void> {
  await modal.episode.setSidebarNumber("3D", "Point size (px)", 7);
  await modal.episode.setSidebarToggle("3D", "Toggle 3D labels", true);
  await modal.episode.setSidebarToggle(
    "camera/front",
    "Toggle matching labels",
    true,
  );
  await modal.episode.setSidebarToggle(
    "camera/front",
    "Toggle pointcloud projections",
    true,
  );
}

async function expectRepresentativeSidebarPreferences(
  modal: ModalPom,
): Promise<void> {
  await modal.episode.expectSidebarNumber("3D", "Point size (px)", 7);
  await modal.episode.expectSidebarToggle("3D", "Toggle 3D labels", true);
  await modal.episode.expectSidebarToggle(
    "camera/front",
    "Toggle matching labels",
    true,
  );
  await modal.episode.expectSidebarToggle(
    "camera/front",
    "Toggle pointcloud projections",
    true,
  );
}

async function expectRestoredWorkspace(modal: ModalPom): Promise<void> {
  await modal.episode.expectTileFullscreen("Logs / Diagnostics");
  await modal.episode.exitTileFullscreen("Logs / Diagnostics");
  await modal.episode.expectTileCount(3);
  await modal.episode.expectTileTitles(
    ["camera/front", "Logs / Diagnostics", "/pose"],
    ["points"],
  );
  await modal.episode.focusRawTile("/pose");
  await modal.episode.expectRawField("position.x", tinyA.poseX[0]);
  await modal.episode.expectNoViewerError();
}
