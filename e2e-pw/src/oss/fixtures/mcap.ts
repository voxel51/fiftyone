import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ConsoleMessage, Locator } from "@playwright/test";
import { expect, test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { McapExplorerPom } from "src/oss/poms/multimodal/mcap-explorer";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { getLocatorDominantColorShare } from "src/oss/utils/screenshot";
import { MCAP_FIXTURE_CONTRACT } from "src/shared/media-factory/mcap";

const datasetName = getUniqueDatasetNameWithPrefix("mcap-correctness");
export const alternateMediaDatasetName = getUniqueDatasetNameWithPrefix(
  "mcap-alternate-grid-media",
);
export const workspaceDatasetName = getUniqueDatasetNameWithPrefix(
  "mcap-workspace-persistence",
);
const fixtureDir = path.join(os.tmpdir(), datasetName);
const originalMultimodalFlag = process.env.VFF_MULTIMODAL;
const RENDERER_ERROR_PATTERN = /(?:webgpu|webgl|graphics renderer|gpu device)/i;

export const { long, tinyA, tinyB } = MCAP_FIXTURE_CONTRACT;
const { sidebar, unsupported } = MCAP_FIXTURE_CONTRACT;
export const fixturePaths = {
  episodeA: path.join(fixtureDir, tinyA.fileName),
  episodeB: path.join(fixtureDir, tinyB.fileName),
  invalid: path.join(fixtureDir, "not-an-mcap.txt"),
  long: path.join(fixtureDir, long.fileName),
  thumbnail: path.join(fixtureDir, "episode-thumbnail.png"),
  thumbnailB: path.join(fixtureDir, "episode-thumbnail-b.png"),
  unsupported: path.join(fixtureDir, unsupported.fileName),
};
export const cameraPoseFileNames = [
  "camera-pose-a.mcap",
  "camera-pose-b.mcap",
  "camera-pose-c.mcap",
  "camera-pose-d.mcap",
] as const;
const cameraPosePaths = cameraPoseFileNames.map((fileName) =>
  path.join(fixtureDir, fileName),
);
export const sidebarFileNames = [
  "sidebar-persistence-a.mcap",
  "sidebar-persistence-b.mcap",
  "sidebar-persistence-c.mcap",
  "sidebar-persistence-d.mcap",
] as const;
const sidebarPaths = sidebarFileNames.map((fileName) =>
  path.join(fixtureDir, fileName),
);
export const sampleIndex = {
  episodeA: 0,
  episodeB: 1,
  shortBeforeLong: 2,
  long: 3,
  shortAfterLong: 4,
  unsupported: 5,
  cameraPoseStart: 6,
  sidebarStart: 10,
} as const;

type McapWorkerFixtures = {
  mcapEnvironment: void;
};

type McapFixtures = {
  explorer: McapExplorerPom;
  graphicsBackend: "auto" | "webgl2";
  grid: GridPom;
  mcapPage: void;
  modal: ModalPom;
  rendererErrors: string[];
  targetDatasetName: string;
};

export const test = base.extend<McapFixtures, McapWorkerFixtures>({
  mcapEnvironment: [
    async ({ fiftyoneLoader, foWebServer, mediaFactory }, use) => {
      process.env.VFF_MULTIMODAL = "1";
      try {
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

        await use();
      } finally {
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
      }
    },
    { auto: true, scope: "worker" },
  ],
  explorer: async ({ page }, use) => {
    const explorer = new McapExplorerPom(page);
    await use(explorer);
    await explorer.closeIfOpen();
  },
  graphicsBackend: "auto",
  grid: async ({ eventUtils, page }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  mcapPage: [
    async (
      {
        fiftyoneLoader,
        graphicsBackend,
        modal,
        page,
        rendererErrors,
        targetDatasetName,
      },
      use,
    ) => {
      rendererErrors.length = 0;
      await fiftyoneLoader.waitUntilGridVisible(page, targetDatasetName, {
        searchParams:
          graphicsBackend === "webgl2"
            ? new URLSearchParams({ graphicsBackend })
            : undefined,
        withGrid: true,
      });
      await use();
      await modal.close({ ignoreError: true });
    },
    { auto: true },
  ],
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

export async function openMcapModal(
  grid: GridPom,
  modal: ModalPom,
  index: number,
): Promise<void> {
  await grid.openNthSample(index);
  // Multimodal has its own right panel, so the classic sidebar never mounts.
  await modal.enterFullscreen();
}

export async function expectDominantColor(
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

export { expect } from "src/oss/fixtures";
