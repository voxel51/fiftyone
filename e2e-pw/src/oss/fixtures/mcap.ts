import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ConsoleMessage } from "@playwright/test";
import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { McapExplorerPom } from "src/oss/poms/multimodal/mcap-explorer";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type {
  DatasetFactory,
  MultimodalDatasetOptions,
} from "src/shared/dataset-factory";
import {
  MCAP_FIXTURE_CONTRACT,
  type McapFixtureKind,
  type McapSpec,
} from "src/shared/media-factory/mcap";

const datasetName = getUniqueDatasetNameWithPrefix("mcap-correctness");
export const alternateMediaDatasetName = getUniqueDatasetNameWithPrefix(
  "mcap-alternate-grid-media",
);
export const workspaceDatasetName = getUniqueDatasetNameWithPrefix(
  "mcap-workspace-persistence",
);
// recordings the specs upload through the Explorer, outside any dataset
const uploadDir = path.join(os.tmpdir(), `${datasetName}-uploads`);
const originalMultimodalFlag = process.env.VFF_MULTIMODAL;
const RENDERER_ERROR_PATTERN = /(?:webgpu|webgl|graphics renderer|gpu device)/i;

export const { long, tinyA, tinyB } = MCAP_FIXTURE_CONTRACT;
const { sidebar, unsupported } = MCAP_FIXTURE_CONTRACT;
export const fixturePaths = {
  episodeA: path.join(uploadDir, tinyA.fileName),
  episodeB: path.join(uploadDir, tinyB.fileName),
  invalid: path.join(uploadDir, "not-an-mcap.txt"),
};
export const cameraPoseFileNames = [
  "camera-pose-a.mcap",
  "camera-pose-b.mcap",
  "camera-pose-c.mcap",
  "camera-pose-d.mcap",
] as const;
export const sidebarFileNames = [
  "sidebar-persistence-a.mcap",
  "sidebar-persistence-b.mcap",
  "sidebar-persistence-c.mcap",
  "sidebar-persistence-d.mcap",
] as const;

/** A sample's recording, under the file name the episode surfaces show */
interface Recording {
  fileName: string;
  mcap: McapSpec;
}

const recording = (
  { fileName, kind }: { fileName: string; kind: McapFixtureKind },
  channelIdOffset?: number,
): Recording => ({ fileName, mcap: { kind, channelIdOffset } });

// samples that name the same file share its recording, as the three short
// episodes share episode A's
const recordings: Recording[] = [
  recording(tinyA),
  recording(tinyB),
  recording(tinyA),
  recording(long),
  recording(tinyA),
  recording(unsupported),
  ...cameraPoseFileNames.map((fileName, index) =>
    recording({ fileName, kind: tinyA.kind }, index % 2),
  ),
  ...sidebarFileNames.map((fileName, index) =>
    recording({ fileName, kind: sidebar.kind }, index % 2 === 0 ? 0 : 3),
  ),
];
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

const createEpisodes = (
  datasetFactory: typeof DatasetFactory,
  name: string,
  episodes: Recording[],
  options: Pick<MultimodalDatasetOptions, "appConfig" | "mediaFields"> = {},
) =>
  datasetFactory.createDataset({
    mediaType: "multimodal",
    datasetName: name,
    numSamples: episodes.length,
    mcapOptions: (index) => episodes[index].mcap,
    fileNames: (index) => episodes[index].fileName.replace(/\.mcap$/, ""),
    ...options,
  });

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
    async (
      { datasetFactory, fiftyoneLoader, foWebServer, mediaFactory },
      use,
    ) => {
      process.env.VFF_MULTIMODAL = "1";
      try {
        await foWebServer.startWebServer();
        await fs.mkdir(uploadDir, { recursive: true });
        await Promise.all([
          mediaFactory.createMcapFixture({
            kind: tinyA.kind,
            outputPath: fixturePaths.episodeA,
          }),
          mediaFactory.createMcapFixture({
            kind: tinyB.kind,
            outputPath: fixturePaths.episodeB,
          }),
          fs.writeFile(fixturePaths.invalid, "not an mcap file"),
          createEpisodes(datasetFactory, datasetName, recordings),
          createEpisodes(
            datasetFactory,
            alternateMediaDatasetName,
            [recording(tinyA), recording(tinyB)],
            {
              mediaFields: {
                thumbnail_path: (index) => ({
                  fillColor: ["#ff00ff", "#00ffff"][index],
                  width: 128,
                  height: 96,
                }),
              },
              appConfig: {
                media_fields: ["filepath", "thumbnail_path"],
                grid_media_field: "thumbnail_path",
                modal_media_field: "filepath",
              },
            },
          ),
          createEpisodes(datasetFactory, workspaceDatasetName, [
            recording(tinyA),
            recording(tinyB),
          ]),
        ]);

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
          console.warn("Error deleting MCAP E2E datasets:", error);
        }
        try {
          await foWebServer.stopWebServer();
        } catch (error) {
          console.warn("Error stopping FiftyOne webserver:", error);
        }
        await fs.rm(uploadDir, { force: true, recursive: true });
      }
    },
    { auto: true, scope: "worker" },
  ],
  explorer: async ({ eventUtils, page }, use) => {
    const explorer = new McapExplorerPom(page, eventUtils);
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

export { expect } from "src/oss/fixtures";
