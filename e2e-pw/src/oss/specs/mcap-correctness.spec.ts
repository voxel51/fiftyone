import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ConsoleMessage, Page } from "@playwright/test";
import { test as base, expect, Locator } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { McapExplorerPom } from "src/oss/poms/multimodal/mcap-explorer";
import { ModalPom } from "src/oss/poms/modal";
import { MCAP_FIXTURE_CONTRACT } from "src/shared/media-factory/mcap";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import {
  getLocatorDominantColorShare,
  getLocatorScreenshotDifference,
} from "src/oss/utils/screenshot";

const datasetName = getUniqueDatasetNameWithPrefix("mcap-correctness");
const alternateMediaDatasetName = getUniqueDatasetNameWithPrefix(
  "mcap-alternate-grid-media",
);
const workspaceDatasetName = getUniqueDatasetNameWithPrefix(
  "mcap-workspace-persistence",
);
const fixtureDir = path.join(os.tmpdir(), datasetName);
const originalMultimodalFlag = process.env.VFF_MULTIMODAL;
const RENDERER_ERROR_PATTERN = /(?:webgpu|webgl|graphics renderer|gpu device)/i;
const EPISODE_LAYOUT_STORAGE_KEY = "fiftyone.episode.modal-layout.v3";
const SOURCE_FACTS_DATABASE_NAME = "fiftyone-multimodal-source-facts";
const { long, sidebar, tinyA, tinyB, unsupported } = MCAP_FIXTURE_CONTRACT;
const fixturePaths = {
  episodeA: path.join(fixtureDir, tinyA.fileName),
  episodeB: path.join(fixtureDir, tinyB.fileName),
  invalid: path.join(fixtureDir, "not-an-mcap.txt"),
  long: path.join(fixtureDir, long.fileName),
  thumbnail: path.join(fixtureDir, "episode-thumbnail.png"),
  thumbnailB: path.join(fixtureDir, "episode-thumbnail-b.png"),
  unsupported: path.join(fixtureDir, unsupported.fileName),
};
const cameraPoseFileNames = [
  "camera-pose-a.mcap",
  "camera-pose-b.mcap",
  "camera-pose-c.mcap",
  "camera-pose-d.mcap",
] as const;
const cameraPosePaths = cameraPoseFileNames.map((fileName) =>
  path.join(fixtureDir, fileName),
);
const sidebarFileNames = [
  "sidebar-persistence-a.mcap",
  "sidebar-persistence-b.mcap",
  "sidebar-persistence-c.mcap",
  "sidebar-persistence-d.mcap",
] as const;
const sidebarPaths = sidebarFileNames.map((fileName) =>
  path.join(fixtureDir, fileName),
);
const sampleIndex = {
  episodeA: 0,
  episodeB: 1,
  shortBeforeLong: 2,
  long: 3,
  shortAfterLong: 4,
  unsupported: 5,
  cameraPoseStart: 6,
  sidebarStart: 10,
} as const;
const longExpectation = {
  diagnosticBeforeMidpointSecond:
    Math.floor((long.midpointSecond - 0.5) / long.diagnosticIntervalSeconds) *
    long.diagnosticIntervalSeconds,
  lidarAfterGapSecond: long.lidarGapLastSecond + long.lidarIntervalSeconds,
  lidarBeforeGapSecond: long.lidarGapFirstSecond - long.lidarIntervalSeconds,
  statusCounterAtMidpoint: long.midpointSecond / long.statusIntervalSeconds,
  statusCounterAtThreeQuarters:
    (long.durationSeconds * 0.75) / long.statusIntervalSeconds,
};

const test = base.extend<{
  explorer: McapExplorerPom;
  graphicsBackend: "auto" | "webgl2";
  grid: GridPom;
  modal: ModalPom;
  rendererErrors: string[];
  targetDatasetName: string;
}>({
  explorer: async ({ page }, use) => {
    const explorer = new McapExplorerPom(page);
    await use(explorer);
    await explorer.closeIfOpen();
  },
  graphicsBackend: "auto",
  grid: async ({ eventUtils, page }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ eventUtils, page }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
  rendererErrors: async ({ page }, use) => {
    const errors: string[] = [];
    const recordConsoleError = (message: ConsoleMessage) => {
      if (
        message.type() === "error" &&
        RENDERER_ERROR_PATTERN.test(message.text())
      ) {
        errors.push(message.text());
      }
    };
    const recordPageError = (error: Error) => {
      if (RENDERER_ERROR_PATTERN.test(error.message)) {
        errors.push(error.message);
      }
    };
    page.on("console", recordConsoleError);
    page.on("pageerror", recordPageError);
    await use(errors);
    page.off("console", recordConsoleError);
    page.off("pageerror", recordPageError);
  },
  targetDatasetName: datasetName,
});

test.describe.serial("MCAP correctness", () => {
  test.beforeAll(async ({ fiftyoneLoader, foWebServer, mediaFactory }) => {
    process.env.VFF_MULTIMODAL = "1";
    await foWebServer.startWebServer();
    await fs.mkdir(fixtureDir, { recursive: true });
    await Promise.all([
      mediaFactory.createMcapFixture({
        kind: tinyA.kind,
        outputPath: fixturePaths.episodeA,
      }),
      mediaFactory.createMcapFixture({
        kind: tinyB.kind,
        outputPath: fixturePaths.episodeB,
      }),
      mediaFactory.createMcapFixture({
        kind: unsupported.kind,
        outputPath: fixturePaths.unsupported,
      }),
      mediaFactory.createMcapFixture({
        kind: long.kind,
        outputPath: fixturePaths.long,
      }),
      ...cameraPosePaths.map((outputPath, index) =>
        mediaFactory.createMcapFixture({
          channelIdOffset: index % 2,
          kind: tinyA.kind,
          outputPath,
        }),
      ),
      ...sidebarPaths.map((outputPath, index) =>
        mediaFactory.createMcapFixture({
          channelIdOffset: index % 2 === 0 ? 0 : 3,
          kind: sidebar.kind,
          outputPath,
        }),
      ),
      mediaFactory.createImage({
        fillColor: "#ff00ff",
        height: 96,
        hideLogs: true,
        outputPath: fixturePaths.thumbnail,
        width: 128,
      }),
      mediaFactory.createImage({
        fillColor: "#00ffff",
        height: 96,
        hideLogs: true,
        outputPath: fixturePaths.thumbnailB,
        width: 128,
      }),
    ]);
    await fs.writeFile(fixturePaths.invalid, "not an mcap file");

    await fiftyoneLoader.executePythonCode(`
import fiftyone as fo

dataset = fo.Dataset("${datasetName}")
dataset.persistent = True
dataset.add_samples([
    fo.Sample(filepath=r"${fixturePaths.episodeA}", name="episode-a"),
    fo.Sample(filepath=r"${fixturePaths.episodeB}", name="episode-b"),
    fo.Sample(filepath=r"${fixturePaths.episodeA}", name="short-before-long"),
    fo.Sample(filepath=r"${fixturePaths.long}", name="long-episode"),
    fo.Sample(filepath=r"${fixturePaths.episodeA}", name="short-after-long"),
    fo.Sample(filepath=r"${fixturePaths.unsupported}", name="unsupported-episode"),
    fo.Sample(filepath=r"${cameraPosePaths[0]}", name="camera-pose-a"),
    fo.Sample(filepath=r"${cameraPosePaths[1]}", name="camera-pose-b"),
    fo.Sample(filepath=r"${cameraPosePaths[2]}", name="camera-pose-c"),
    fo.Sample(filepath=r"${cameraPosePaths[3]}", name="camera-pose-d"),
    fo.Sample(filepath=r"${sidebarPaths[0]}", name="sidebar-persistence-a"),
    fo.Sample(filepath=r"${sidebarPaths[1]}", name="sidebar-persistence-b"),
    fo.Sample(filepath=r"${sidebarPaths[2]}", name="sidebar-persistence-c"),
    fo.Sample(filepath=r"${sidebarPaths[3]}", name="sidebar-persistence-d"),
])

alternate_media_dataset = fo.Dataset("${alternateMediaDatasetName}")
alternate_media_dataset.persistent = True
alternate_media_dataset.add_samples([
    fo.Sample(
        filepath=r"${fixturePaths.episodeA}",
        thumbnail_path=r"${fixturePaths.thumbnail}",
    ),
    fo.Sample(
        filepath=r"${fixturePaths.episodeB}",
        thumbnail_path=r"${fixturePaths.thumbnailB}",
    ),
])
alternate_media_dataset.app_config.media_fields = ["filepath", "thumbnail_path"]
alternate_media_dataset.app_config.grid_media_field = "thumbnail_path"
alternate_media_dataset.app_config.modal_media_field = "filepath"
alternate_media_dataset.save()

workspace_dataset = fo.Dataset("${workspaceDatasetName}")
workspace_dataset.persistent = True
workspace_dataset.add_samples([
    fo.Sample(filepath=r"${fixturePaths.episodeA}", name="workspace-a"),
    fo.Sample(filepath=r"${fixturePaths.episodeB}", name="workspace-b"),
])
  `);
  });

  test.afterAll(async ({ fiftyoneLoader, foWebServer }) => {
    if (originalMultimodalFlag === undefined) {
      delete process.env.VFF_MULTIMODAL;
    } else {
      process.env.VFF_MULTIMODAL = originalMultimodalFlag;
    }
    try {
      await fiftyoneLoader.executePythonCode(`
import fiftyone as fo

for dataset_name in ["${datasetName}", "${alternateMediaDatasetName}", "${workspaceDatasetName}"]:
    if fo.dataset_exists(dataset_name):
        fo.delete_dataset(dataset_name)
    `);
    } catch (error) {
      void error;
    }
    try {
      await foWebServer.stopWebServer();
    } catch (error) {
      void error;
    }
    await fs.rm(fixtureDir, { force: true, recursive: true });
  });

  test.beforeEach(
    async ({
      fiftyoneLoader,
      graphicsBackend,
      page,
      rendererErrors,
      targetDatasetName,
    }) => {
      rendererErrors.length = 0;
      await fiftyoneLoader.waitUntilGridVisible(page, targetDatasetName, {
        searchParams:
          graphicsBackend === "webgl2"
            ? new URLSearchParams({ graphicsBackend })
            : undefined,
        withGrid: true,
      });
    },
  );

  test.afterEach(async ({ modal }) => {
    await modal.close({ ignoreError: true });
  });

  test("renders an MCAP grid preview and opens the episode modal", async ({
    grid,
    modal,
    page,
  }) => {
    const tile = grid.getNthTile(0);
    await expect(tile.locator("canvas")).toBeVisible();
    await expect(
      page.getByTestId("selector-episode-grid-stream"),
    ).toHaveAttribute("placeholder", "Stream: Auto");

    await openMcapModal(grid, modal, sampleIndex.episodeA);
    await modal.episode.waitForReady(tinyA.fileName);
    await modal.episode.expectTileTitles(
      ["camera/front", "points"],
      ["Logs / Diagnostics"],
    );
    await modal.episode.expectUtcTime("2024-01-01 00:00:00.000");
    await modal.episode.expectPlayhead(
      "2024-01-01 00:00:00.000 / 2024-01-01 00:00:02.000",
    );
    await modal.episode.expectNoViewerError();
  });

  test("restores the episode shell from source facts after reload and reopen", async ({
    grid,
    modal,
    page,
  }) => {
    await openMcapModal(grid, modal, sampleIndex.episodeA);
    await modal.episode.waitForReady(tinyA.fileName);
    await expect
      .poll(() => sourceFactsEntryCount(page), { timeout: 10_000 })
      .toBeGreaterThan(0);

    await modal.close();
    await page.evaluate(async () => {
      await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
    });
    await page.reload();
    await expect(grid.locator).toBeVisible({ timeout: 30_000 });

    const sourceUrl = new RegExp(tinyA.fileName.replace(/\./g, "\\."));
    await page.route(sourceUrl, (route) => route.abort("failed"));
    await openMcapModal(grid, modal, sampleIndex.episodeA);
    await modal.episode.expectWarmBootstrapShell(tinyA.fileName, [
      "camera/front",
      "points",
    ]);

    await modal.close();
    await page.unroute(sourceUrl);
    await openMcapModal(grid, modal, sampleIndex.episodeA);
    await modal.episode.waitForReady(tinyA.fileName);
    await modal.episode.expectNoViewerError();
  });

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

    // Leave episode B in its canonical layout for the serial A-B-A scenario.
    await modal.episode.selectImageSource("camera/side", "camera/rear");
    await modal.episode.expectTileTitleCount("camera/rear", 1);
    await modal.episode.expectTileTitleCount("camera/side", 1);
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
    await modal.episode.waitForReady(cameraPoseFileNames.at(-1)!);
    await modal.episode.expectCameraPose("points", egoPose);

    await modal.close();
    await page.reload();
    await expect(grid.locator).toBeVisible({ timeout: 30_000 });
    await openMcapModal(
      grid,
      modal,
      sampleIndex.cameraPoseStart + cameraPoseFileNames.length - 1,
    );
    await modal.episode.waitForReady(cameraPoseFileNames.at(-1)!);
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
    await modal.episode.waitForReady(sidebarFileNames.at(-1)!);
    await expectRepresentativeSidebarPreferences(modal);

    await modal.close();
    await page.reload();
    await expect(grid.locator).toBeVisible({ timeout: 30_000 });
    await openMcapModal(
      grid,
      modal,
      sampleIndex.sidebarStart + sidebarFileNames.length - 1,
    );
    await modal.episode.waitForReady(sidebarFileNames.at(-1)!);
    await expectRepresentativeSidebarPreferences(modal);
  });

  test.describe("alternate grid media", () => {
    test.use({ targetDatasetName: alternateMediaDatasetName });

    test("keeps alternate modal media across sample navigation", async ({
      grid,
      modal,
    }) => {
      const tile = grid.getNthTile(0);
      await expect(tile).toHaveAttribute("data-cy", "looker");
      await expectDominantColor(tile.locator("canvas"), [255, 0, 255]);

      await openMcapModal(grid, modal, 0);
      await modal.episode.waitForReady("tiny-episode-a.mcap");
      await modal.episode.expectTileTitles(
        ["camera/front", "points"],
        ["Logs"],
      );
      await modal.episode.expectNoViewerError();

      const lookerAttached = await modal.armLookerAttached();
      await modal.selectMediaField("thumbnail_path");
      await lookerAttached.received;
      await modal.waitForSampleLoadDomAttribute();
      await expectDominantColor(
        modal.modalContainer.locator("canvas"),
        [255, 0, 255],
      );

      const nextLookerAttached = await modal.armLookerAttached();
      await modal.getSampleNavigation("forward").click();
      await nextLookerAttached.received;
      await modal.waitForSampleLoadDomAttribute();
      await expectDominantColor(
        modal.modalContainer.locator("canvas"),
        [0, 255, 255],
      );

      await modal.selectMediaField("filepath");
      await modal.episode.waitForReady("tiny-episode-b.mcap");
      await modal.episode.expectTileTitles(
        ["camera/rear", "camera/side", "scan/rear"],
        ["Logs"],
      );
      await modal.episode.expectNoViewerError();
    });
  });

  test("keeps paused stepping, raw values, logs, and image pixels synchronized", async ({
    grid,
    modal,
  }) => {
    await openMcapModal(grid, modal, sampleIndex.episodeA);
    await modal.episode.waitForReady(tinyA.fileName);
    await modal.episode.addTile("log", "Logs / Diagnostics");
    await modal.episode.setSamplingRate(1);
    await modal.episode.inspectStream("/pose");
    await modal.episode.expectRawField("position.x", tinyA.poseX[0]);
    await expectDominantColor(
      modal.episode.image("camera/front"),
      tinyA.imageRgb[0],
    );

    await modal.episode.stepForward();
    await modal.episode.expectUtcTime("2024-01-01 00:00:01.000");
    await modal.episode.expectPlayhead(
      "2024-01-01 00:00:01.000 / 2024-01-01 00:00:02.000",
    );
    await modal.episode.expectRawField("position.x", tinyA.poseX[1]);
    await modal.episode.expectLog("A log 1");
    await expectDominantColor(
      modal.episode.image("camera/front"),
      tinyA.imageRgb[1],
    );

    await modal.episode.stepBack();
    await modal.episode.expectUtcTime("2024-01-01 00:00:00.000");
    await modal.episode.expectRawField("position.x", tinyA.poseX[0]);
  });

  test("replaces inventory, layout, capabilities, clock, and decoded content A-B-A", async ({
    grid,
    modal,
  }) => {
    await openMcapModal(grid, modal, sampleIndex.episodeA);
    await modal.episode.waitForReady(tinyA.fileName);
    await modal.episode.expectTileTitles(
      ["camera/front", "points"],
      ["Logs / Diagnostics"],
    );
    await modal.episode.expectStreams([
      "/camera/front",
      "/points",
      "/log",
      "/pose",
    ]);

    await modal.episode.navigateDatasetSample("forward", tinyB.fileName);
    await modal.episode.expectStreams(
      ["/camera/rear", "/camera/side", "/scan/rear", "/status"],
      ["/camera/front", "/points", "/log", "/pose"],
    );
    await modal.episode.expectTileTitles(
      ["camera/rear", "camera/side", "scan/rear"],
      ["camera/front", "Logs / Diagnostics"],
    );
    await modal.episode.expectNoUtcTime();
    await modal.episode.expectPlayhead("0:00.00 / 0:01.50");
    await modal.episode.setSamplingRate(2);
    await modal.episode.inspectStream("/status");
    await modal.episode.expectRawField("status_code", tinyB.statusCodes[0]);
    await expectDominantColor(
      modal.episode.image("camera/rear"),
      tinyB.rearImageRgb[0],
    );

    await modal.episode.stepForward();
    await modal.episode.expectPlayhead("0:00.50 / 0:01.50");
    await modal.episode.expectRawField("status_code", tinyB.statusCodes[1]);

    await modal.episode.navigateDatasetSample("backward", tinyA.fileName);
    await modal.episode.expectTileTitleCount("camera/front", 2);
    await modal.episode.expectTileTitles(
      ["camera/front", "points"],
      ["camera/rear", "camera/side", "Logs / Diagnostics"],
    );
    await modal.episode.expectUtcTime("2024-01-01 00:00:00.000");
    await modal.episode.expectPlayhead(
      "2024-01-01 00:00:00.000 / 2024-01-01 00:00:02.000",
    );
    await modal.episode.setSamplingRate(1);
    await modal.episode.stepForward();
    await modal.episode.expectUtcTime("2024-01-01 00:00:01.000");
  });

  test("mounts, unmounts, validates, and replaces local Explorer recordings", async ({
    explorer,
  }) => {
    await explorer.open();
    await explorer.expectInvalidExtension(fixturePaths.invalid);

    await explorer.upload(fixturePaths.episodeA);
    await explorer.episode.waitForReady(tinyA.fileName);
    await explorer.episode.expectUtcTime("2024-01-01 00:00:00.000");
    await explorer.unmount();

    await explorer.upload(fixturePaths.episodeB);
    await explorer.episode.waitForReady(tinyB.fileName);
    await explorer.episode.expectStreams(
      ["/camera/rear", "/camera/side", "/scan/rear", "/status"],
      ["/camera/front", "/points", "/log", "/pose"],
    );
    await explorer.episode.expectNoUtcTime();
    await explorer.episode.expectPlayhead("0:00.00 / 0:01.50");
    await explorer.episode.setSamplingRate(2);
    await explorer.episode.stepForward();
    await explorer.episode.expectPlayhead("0:00.50 / 0:01.50");
  });

  test("shows the explicit state for a valid recording with no previewable streams", async ({
    grid,
    modal,
  }) => {
    await openMcapModal(grid, modal, sampleIndex.unsupported);
    await modal.episode.expectUnsupported();
    await modal.episode.expectNoViewerError();
  });

  test("seeks, scrubs, synchronizes sparse streams, and clamps one-hour boundaries", async ({
    grid,
    modal,
  }) => {
    await openMcapModal(grid, modal, sampleIndex.long);
    await modal.episode.waitForReady(long.fileName);
    await modal.episode.setSamplingRate(2);
    await modal.episode.expectPlayhead(
      "2024-01-01 00:00:00.000 / 2024-01-01 01:00:00.000",
    );
    await modal.episode.expectStreams([
      "/camera/front",
      "/camera/rear",
      "/lidar/points",
      "/scan/rear",
      "/odometry",
      "/camera/front/detections",
      "/tf",
      "/tf_static",
      "/status",
      "/rosout",
      "/diagnostics",
    ]);

    await modal.episode.stepForward();
    await modal.episode.expectUtcTime("2024-01-01 00:00:00.500");
    await modal.episode.stepBack();
    await modal.episode.expectUtcTime("2024-01-01 00:00:00.000");

    await modal.episode.scrubToFraction(0.5);
    await modal.episode.expectUtcTime("2024-01-01 00:30:00.000");
    await modal.episode.expectPlayhead(
      "2024-01-01 00:30:00.000 / 2024-01-01 01:00:00.000",
    );
    await modal.episode.inspectStream("/odometry");
    await modal.episode.expectRawField("pose.pose.position.x", 180);
    await modal.episode.inspectStream("/status");
    await modal.episode.expectRawField(
      "counter",
      longExpectation.statusCounterAtMidpoint,
    );
    await modal.episode.expectRawField("state", "active-warning");

    await modal.episode.inspectStream("/lidar/points");
    await modal.episode.expectRawMeta(
      relativeSecond(longExpectation.lidarBeforeGapSecond),
    );
    await modal.episode.seekToFraction(0.75);
    await modal.episode.expectUtcTime("2024-01-01 00:45:00.000");
    await modal.episode.seekToFraction(
      fractionOfLongRecording(longExpectation.lidarAfterGapSecond),
    );
    await modal.episode.expectUtcTimeAfterAtMostOneForwardStep(
      "2024-01-01 00:30:12.000",
      500,
    );
    await modal.episode.expectRawMeta(
      relativeSecond(longExpectation.lidarAfterGapSecond),
    );

    await modal.episode.scrubToFraction(1);
    await modal.episode.expectUtcTimeAfterAtMostOneForwardStep(
      "2024-01-01 01:00:00.000",
      500,
    );
    await modal.episode.expectPlayhead(
      "2024-01-01 01:00:00.000 / 2024-01-01 01:00:00.000",
    );
    await modal.episode.inspectStream("/status");
    await modal.episode.expectRawField("state", "complete");
    await modal.episode.stepForward();
    await modal.episode.expectUtcTime("2024-01-01 01:00:00.000");
    await modal.episode.stepBack();
    await modal.episode.expectUtcTime("2024-01-01 00:59:59.500");
  });

  test("resets duration, streams, playback, seek state, and values short-long-short", async ({
    grid,
    modal,
  }) => {
    await openMcapModal(grid, modal, sampleIndex.shortBeforeLong);
    await modal.episode.waitForReady(tinyA.fileName);
    await modal.episode.setSamplingRate(1);
    await modal.episode.stepForward();
    await modal.episode.expectUtcTime("2024-01-01 00:00:01.000");
    await modal.episode.inspectStream("/pose");
    await modal.episode.expectRawField("position.x", tinyA.poseX[1]);
    await expectDominantColor(
      modal.episode.image("camera/front"),
      tinyA.imageRgb[1],
    );

    await modal.episode.navigateDatasetSample("forward", long.fileName);
    await modal.episode.expectPaused();
    await modal.episode.expectPlayhead(
      "2024-01-01 00:00:00.000 / 2024-01-01 01:00:00.000",
    );
    await modal.episode.expectStreams(
      ["/camera/rear", "/odometry", "/status", "/diagnostics"],
      ["/points", "/log", "/pose"],
    );
    await modal.episode.expectTileTitles(["camera/front"], ["/pose"]);
    await modal.episode.inspectStream("/status");
    await modal.episode.expectRawField("counter", 0);
    await expectDominantColor(
      modal.episode.image("camera/front"),
      long.cameraPhaseRgb[0],
    );

    await modal.episode.seekToFraction(0.75);
    await modal.episode.expectUtcTime("2024-01-01 00:45:00.000");
    await modal.episode.expectRawField(
      "counter",
      longExpectation.statusCounterAtThreeQuarters,
    );

    await modal.episode.navigateDatasetSample("forward", tinyA.fileName);
    await modal.episode.expectPaused();
    await modal.episode.expectPlayhead(
      "2024-01-01 00:00:00.000 / 2024-01-01 00:00:02.000",
    );
    await modal.episode.expectStreams(
      ["/camera/front", "/points", "/log", "/pose"],
      ["/camera/rear", "/odometry", "/status", "/diagnostics"],
    );
    await modal.episode.expectTileTitles(
      ["camera/front", "points"],
      ["camera/rear", "/status", "Logs / Diagnostics"],
    );
    await modal.episode.expectRawSelectionCleared();
    await modal.episode.inspectStream("/pose");
    await modal.episode.expectRawField("position.x", tinyA.poseX[0]);
    await expectDominantColor(
      modal.episode.image("camera/front"),
      tinyA.imageRgb[0],
    );
  });

  test("honors rear-camera first and last temporal boundaries through seeks and scrubs", async ({
    grid,
    modal,
  }) => {
    await openMcapModal(grid, modal, sampleIndex.long);
    await modal.episode.waitForReady(long.fileName);
    await modal.episode.setSamplingRate(2);

    await modal.episode.seekToFraction(
      fractionOfLongRecording(long.rearFirstSecond - 0.5),
    );
    await modal.episode.expectUtcTimeAfterAtMostOneForwardStep(
      "2024-01-01 00:09:59.500",
      500,
    );
    await modal.episode.expectTileEmpty("camera/rear", "Starts at 10:00.00");

    await modal.episode.scrubToFraction(
      fractionOfLongRecording(long.rearFirstSecond),
    );
    await modal.episode.expectUtcTimeAfterAtMostOneForwardStep(
      "2024-01-01 00:10:00.000",
      500,
    );
    await expectDominantColor(
      modal.episode.image("camera/rear"),
      long.cameraPhaseRgb[0],
    );

    await modal.episode.seekToFraction(
      fractionOfLongRecording(long.rearLastSecond),
    );
    await modal.episode.expectUtcTimeAfterAtMostOneForwardStep(
      "2024-01-01 00:50:00.000",
      500,
    );
    await expectDominantColor(
      modal.episode.image("camera/rear"),
      long.cameraPhaseRgb[3],
    );

    await modal.episode.scrubToFraction(
      fractionOfLongRecording(long.rearLastSecond + 0.5),
    );
    await modal.episode.expectUtcTimeAfterAtMostOneForwardStep(
      "2024-01-01 00:50:00.500",
      500,
    );
    await modal.episode.expectTileEmpty("camera/rear", "No data at this time");
  });

  test("keeps sparse log and diagnostic predecessor anchors synchronized", async ({
    grid,
    modal,
  }) => {
    await openMcapModal(grid, modal, sampleIndex.long);
    await modal.episode.waitForReady(long.fileName);
    await modal.episode.addTile("log", "Logs / Diagnostics");
    await modal.episode.setSamplingRate(2);

    await modal.episode.seekToFraction(
      fractionOfLongRecording(long.midpointSecond - 0.5),
    );
    await modal.episode.expectUtcTimeAfterAtMostOneForwardStep(
      "2024-01-01 00:29:59.500",
      500,
    );
    await modal.episode.inspectStream("/diagnostics");
    await modal.episode.expectRawMeta(
      relativeSecond(longExpectation.diagnosticBeforeMidpointSecond),
    );
    await modal.episode.expectRawField("status.0.message", "nominal");
    await modal.episode.inspectStream("/rosout");
    await modal.episode.expectRawMeta(
      relativeSecond(long.logBeforeMidpointSecond),
    );
    await modal.episode.expectRawField("msg", "LONG pre-midpoint nominal");
    await expectDominantColor(
      modal.episode.image("camera/front"),
      long.cameraPhaseRgb[1],
    );

    await modal.episode.scrubToFraction(
      fractionOfLongRecording(long.midpointSecond),
    );
    await modal.episode.expectUtcTimeAfterAtMostOneForwardStep(
      "2024-01-01 00:30:00.000",
      500,
    );
    await modal.episode.focusRawTile("/diagnostics");
    await modal.episode.expectRawMeta(relativeSecond(long.midpointSecond));
    await modal.episode.expectRawField("status.0.message", "midpoint warning");
    await modal.episode.expectRawField("status.0.level", 1);
    await modal.episode.focusRawTile("/rosout");
    await modal.episode.expectRawMeta(relativeSecond(long.midpointSecond));
    await modal.episode.expectRawField("msg", "LONG midpoint warning");
    await modal.episode.expectLogs(["LONG midpoint warning"]);
    await modal.episode.expectDiagnostics(["midpoint warning"]);
    await expectDominantColor(
      modal.episode.image("camera/front"),
      long.cameraPhaseRgb[2],
    );

    await modal.episode.seekToFraction(
      fractionOfLongRecording(long.midpointSecond + 0.5),
    );
    await modal.episode.expectUtcTimeAfterAtMostOneForwardStep(
      "2024-01-01 00:30:00.500",
      500,
    );
    await modal.episode.focusRawTile("/diagnostics");
    await modal.episode.expectRawMeta(relativeSecond(long.midpointSecond));
    await modal.episode.focusRawTile("/rosout");
    await modal.episode.expectRawMeta(relativeSecond(long.midpointSecond));

    await modal.episode.scrubToFraction(
      fractionOfLongRecording(long.midpointSecond - 0.5),
    );
    await modal.episode.expectUtcTimeAfterAtMostOneForwardStep(
      "2024-01-01 00:29:59.500",
      500,
    );
    await modal.episode.focusRawTile("/diagnostics");
    await modal.episode.expectRawMeta(
      relativeSecond(longExpectation.diagnosticBeforeMidpointSecond),
    );
    await modal.episode.expectRawField("status.0.message", "nominal");
    await modal.episode.focusRawTile("/rosout");
    await modal.episode.expectRawMeta(
      relativeSecond(long.logBeforeMidpointSecond),
    );
    await modal.episode.expectRawField("msg", "LONG pre-midpoint nominal");
  });

  test.describe("diagnostic backend override", () => {
    test.use({ graphicsBackend: "webgl2" });

    test("renders stable MCAP point clouds with the forced WebGL2 backend", async ({
      grid,
      modal,
      page,
      rendererErrors,
    }) => {
      expect(new URL(page.url()).searchParams.get("graphicsBackend")).toBe(
        "webgl2",
      );

      await openMcapModal(grid, modal, sampleIndex.episodeA);
      await modal.episode.waitForReady(tinyA.fileName);
      await modal.episode.setSamplingRate(1);
      const pointTile = modal.episode.tile("points");
      const canvas = pointTile.locator('[data-graphics-surface="modal-3d"]');
      await expect(canvas).toHaveAttribute("data-graphics-backend", "webgl2");

      const pointPanel = pointTile.locator("[data-point-cloud-rendered-count]");
      await expectPointCloudSpread(pointPanel, 4, 1);
      const firstFramePixels = await canvas.screenshot();
      await modal.episode.stepForward();
      await expectPointCloudSpread(pointPanel, 4, 2);
      await expectPixelDifference(canvas, firstFramePixels, {
        minimumChangedPixels: 4,
        minimumSpan: 16,
      });
      const secondFramePixels = await canvas.screenshot();
      await modal.episode.stepForward();
      await expectPointCloudSpread(pointPanel, 5, 3);
      await expectPixelDifference(canvas, secondFramePixels, {
        minimumChangedPixels: 4,
        minimumSpan: 16,
      });

      await modal.close();
      await openMcapModal(grid, modal, sampleIndex.sidebarStart);
      await modal.episode.waitForReady(sidebarFileNames[0]);
      await modal.episode.setSidebarToggle(
        "camera/front",
        "Toggle pointcloud projections",
        false,
      );
      const imageCanvas = modal.episode.shell.locator(
        '[data-graphics-surface="modal-images"]',
      );
      await expect(imageCanvas).toHaveAttribute(
        "data-graphics-backend",
        "webgl2",
      );
      const projectionOff = await imageCanvas.screenshot();
      await modal.episode.setSidebarToggle(
        "camera/front",
        "Toggle pointcloud projections",
        true,
      );
      await expectPixelDifference(imageCanvas, projectionOff, {
        minimumChangedPixels: 4,
        minimumSpan: 12,
      });

      await modal.episode.scope
        .getByRole("tab", { name: "Scene", exact: true })
        .click();
      await modal.episode.scope.getByRole("button", { name: "Stats" }).click();
      await expect(modal.episode.scope.getByText("Graphics")).toBeVisible();
      await expectStatsRow(
        modal.episode.scope,
        "Requested backend",
        "WebGL2 (diagnostic override)",
      );
      await expectStatsRow(modal.episode.scope, "WebGPU devices", /^0 \/ \d+$/);
      await expectStatsRow(
        modal.episode.scope,
        "Surface · modal-3d",
        "1 WebGL2",
      );
      await expectStatsRow(
        modal.episode.scope,
        "Surface · modal-images",
        "1 WebGL2",
      );
      await modal.episode.expectNoViewerError();
      expect(rendererErrors).toEqual([]);
    });
  });
});

async function openMcapModal(
  grid: GridPom,
  modal: ModalPom,
  index: number,
): Promise<void> {
  await grid.openNthSample(index);
  // multimodal never mounts the classic sidebar (it has its own right panel),
  // so there's nothing to hide and no toggle to hide it with
  await modal.enterFullscreen();
}

async function sourceFactsEntryCount(page: Page): Promise<number> {
  return page.evaluate(async (databaseName) => {
    const databases = await indexedDB.databases();
    if (!databases.some((database) => database.name === databaseName)) return 0;
    return new Promise<number>((resolve) => {
      const request = indexedDB.open(databaseName);
      request.onerror = () => resolve(0);
      request.onsuccess = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("entries")) {
          database.close();
          resolve(0);
          return;
        }
        const transaction = database.transaction("entries", "readonly");
        const count = transaction.objectStore("entries").count();
        count.onerror = () => resolve(0);
        count.onsuccess = () => resolve(count.result);
        transaction.oncomplete = () => database.close();
      };
    });
  }, SOURCE_FACTS_DATABASE_NAME);
}

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
          const collectTileIds = (node: unknown): string[] => {
            if (typeof node === "string") return [node];
            if (!node || typeof node !== "object") return [];
            const branch = node as { first?: unknown; second?: unknown };
            return [
              ...collectTileIds(branch.first),
              ...collectTileIds(branch.second),
            ];
          };
          return Object.values(parsed.byDataset ?? {}).some((entry) => {
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
          });
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

function fractionOfLongRecording(second: number): number {
  return second / long.durationSeconds;
}

function relativeSecond(second: number): string {
  return `t=+${second.toFixed(3)}s`;
}

async function expectDominantColor(
  locator: Locator,
  expected: readonly [number, number, number],
): Promise<void> {
  await expect(locator).toBeVisible();
  await expect
    .poll(() => getLocatorDominantColorShare(locator, expected), {
      timeout: 20_000,
    })
    .toBeGreaterThan(0.15);
}

async function expectPointCloudSpread(
  panel: Locator,
  minimumRenderedCount: number,
  minimumSpreadAxes: number,
): Promise<void> {
  await expect(panel).toBeVisible();
  await expect
    .poll(async () => {
      const count = Number(
        await panel.getAttribute("data-point-cloud-rendered-count"),
      );
      return Number.isFinite(count) ? count : 0;
    })
    .toBeGreaterThanOrEqual(minimumRenderedCount);
  await expect
    .poll(async () => {
      const bounds =
        (await panel.getAttribute("data-point-cloud-bounds-size")) ?? "";
      return bounds
        .split(",")
        .map(Number)
        .filter((value) => Number.isFinite(value) && value > 0.1).length;
    })
    .toBeGreaterThanOrEqual(minimumSpreadAxes);
}

async function expectPixelDifference(
  locator: Locator,
  baseline: Buffer,
  {
    minimumChangedPixels,
    minimumSpan,
  }: {
    readonly minimumChangedPixels: number;
    readonly minimumSpan: number;
  },
): Promise<void> {
  await expect
    .poll(
      async () => {
        const difference = await getLocatorScreenshotDifference(
          locator,
          baseline,
        );
        return {
          changed:
            difference !== null &&
            difference.changedPixels >= minimumChangedPixels,
          spanned:
            difference !== null &&
            Math.max(difference.width, difference.height) >= minimumSpan,
        };
      },
      { timeout: 20_000 },
    )
    .toEqual({ changed: true, spanned: true });
}

async function expectStatsRow(
  scope: Locator,
  label: string,
  value: string | RegExp,
): Promise<void> {
  const row = scope.locator(`[data-stats-row=${JSON.stringify(label)}]`);
  await expect(row.locator("span").last()).toHaveText(value);
}
