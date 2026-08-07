import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Jimp } from "jimp";
import { test as base, expect, Locator } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { McapExplorerPom } from "src/oss/poms/multimodal/mcap-explorer";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("mcap-correctness");
const fixtureDir = path.join(os.tmpdir(), datasetName);
const originalMultimodalFlag = process.env.VFF_MULTIMODAL;
const fixturePaths = {
  a: path.join(fixtureDir, "tiny-episode-a.mcap"),
  b: path.join(fixtureDir, "tiny-episode-b.mcap"),
  invalid: path.join(fixtureDir, "not-an-mcap.txt"),
  long: path.join(fixtureDir, "long-mixed-episode.mcap"),
  unsupported: path.join(fixtureDir, "unsupported.mcap"),
};

const test = base.extend<{
  explorer: McapExplorerPom;
  grid: GridPom;
  modal: ModalPom;
}>({
  explorer: async ({ page }, use) => {
    const explorer = new McapExplorerPom(page);
    await use(explorer);
    await explorer.closeIfOpen();
  },
  grid: async ({ eventUtils, page }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ eventUtils, page }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.describe.serial("MCAP correctness", () => {
  test.beforeAll(async ({ fiftyoneLoader, foWebServer, mediaFactory }) => {
    process.env.VFF_MULTIMODAL = "1";
    await foWebServer.startWebServer();
    await Promise.all([
      mediaFactory.createMcapFixture({
        kind: "tiny-episode-a",
        outputPath: fixturePaths.a,
      }),
      mediaFactory.createMcapFixture({
        kind: "tiny-episode-b",
        outputPath: fixturePaths.b,
      }),
      mediaFactory.createMcapFixture({
        kind: "unsupported",
        outputPath: fixturePaths.unsupported,
      }),
      mediaFactory.createMcapFixture({
        kind: "long-mixed-episode",
        outputPath: fixturePaths.long,
      }),
    ]);
    await fs.writeFile(fixturePaths.invalid, "not an mcap file");

    await fiftyoneLoader.executePythonCode(`
import fiftyone as fo

dataset = fo.Dataset("${datasetName}")
dataset.persistent = True
dataset.add_samples([
    fo.Sample(filepath=r"${fixturePaths.a}", name="episode-a"),
    fo.Sample(filepath=r"${fixturePaths.b}", name="episode-b"),
    fo.Sample(filepath=r"${fixturePaths.long}", name="long-episode"),
    fo.Sample(filepath=r"${fixturePaths.unsupported}", name="unsupported-episode"),
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

if fo.dataset_exists("${datasetName}"):
    fo.delete_dataset("${datasetName}")
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

  test.beforeEach(async ({ fiftyoneLoader, page }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test.afterEach(async ({ modal }) => {
    await modal.close({ ignoreError: true });
  });

  test("renders an MCAP grid preview and opens the episode modal", async ({
    grid,
    modal,
    page,
  }) => {
    const tile = grid.getNthTile(0);
    await expect(tile.locator("[data-cy=mcap-grid-renderer]")).toBeVisible();
    await expect(tile.locator("canvas")).toBeVisible();
    await expect(
      page.getByTestId("selector-episode-grid-stream"),
    ).toHaveAttribute("placeholder", "Stream: Auto");

    await grid.openFirstSample();
    await modal.episode.waitForReady("tiny-episode-a.mcap");
    await modal.episode.expectTileTitles(["camera/front", "points", "Logs"]);
    await modal.episode.expectUtcTime("00:00:00.000");
    await modal.episode.expectPlayhead("00:00:00.000 / 00:00:02.000");
    await modal.episode.expectNoViewerError();
  });

  test("keeps paused stepping, raw values, logs, and image pixels synchronized", async ({
    grid,
    modal,
  }) => {
    await grid.openFirstSample();
    await modal.episode.waitForReady("tiny-episode-a.mcap");
    await modal.episode.setSamplingRate(1);
    await modal.episode.inspectStream("/pose");
    await modal.episode.expectRawField("position.x", 0);
    await expectDominantColor(
      modal.episode.image("camera/front"),
      [231, 76, 60],
    );

    await modal.episode.stepForward();
    await modal.episode.expectUtcTime("00:00:01.000");
    await modal.episode.expectPlayhead("00:00:01.000 / 00:00:02.000");
    await modal.episode.expectRawField("position.x", 10);
    await modal.episode.expectLog("A log 1");
    await expectDominantColor(
      modal.episode.image("camera/front"),
      [46, 204, 113],
    );

    await modal.episode.stepBack();
    await modal.episode.expectUtcTime("00:00:00.000");
    await modal.episode.expectRawField("position.x", 0);
  });

  test("replaces inventory, layout, capabilities, clock, and decoded content A-B-A", async ({
    grid,
    modal,
  }) => {
    await grid.openFirstSample();
    await modal.episode.waitForReady("tiny-episode-a.mcap");
    await modal.episode.expectStreams([
      "/camera/front",
      "/points",
      "/log",
      "/pose",
    ]);

    await modal.episode.navigateDatasetSample("forward", "tiny-episode-b.mcap");
    await modal.episode.expectStreams(
      ["/camera/rear", "/camera/side", "/scan/rear", "/status"],
      ["/camera/front", "/points", "/log", "/pose"],
    );
    await modal.episode.expectTileTitles(
      ["camera/rear", "camera/side", "scan/rear"],
      ["camera/front", "Logs"],
    );
    await modal.episode.expectNoUtcTime();
    await modal.episode.expectPlayhead("0:00.00 / 0:01.50");
    await modal.episode.setSamplingRate(2);
    await modal.episode.inspectStream("/status");
    await modal.episode.expectRawField("status_code", 200);
    await expectDominantColor(
      modal.episode.image("camera/rear"),
      [155, 89, 182],
    );

    await modal.episode.stepForward();
    await modal.episode.expectPlayhead("0:00.50 / 0:01.50");
    await modal.episode.expectRawField("status_code", 201);

    await modal.episode.navigateDatasetSample(
      "backward",
      "tiny-episode-a.mcap",
    );
    await modal.episode.expectTileTitles(
      ["camera/front", "points", "Logs"],
      ["camera/rear", "camera/side"],
    );
    await modal.episode.expectUtcTime("00:00:00.000");
    await modal.episode.expectPlayhead("00:00:00.000 / 00:00:02.000");
    await modal.episode.setSamplingRate(1);
    await modal.episode.stepForward();
    await modal.episode.expectUtcTime("00:00:01.000");
  });

  test("mounts, unmounts, validates, and replaces local Explorer recordings", async ({
    explorer,
  }) => {
    await explorer.open();
    await explorer.expectInvalidExtension(fixturePaths.invalid);

    await explorer.upload(fixturePaths.a);
    await explorer.episode.waitForReady("tiny-episode-a.mcap");
    await explorer.episode.expectUtcTime("00:00:00.000");
    await explorer.unmount();

    await explorer.upload(fixturePaths.b);
    await explorer.episode.waitForReady("tiny-episode-b.mcap");
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
    await grid.openNthSample(3);
    await modal.episode.expectUnsupported();
    await modal.episode.expectNoViewerError();
  });

  test("seeks, scrubs, synchronizes sparse streams, and clamps one-hour boundaries", async ({
    grid,
    modal,
  }) => {
    await grid.openNthSample(2);
    await modal.episode.waitForReady("long-mixed-episode.mcap");
    await modal.episode.setSamplingRate(2);
    await modal.episode.expectPlayhead("00:00:00.000 / 01:00:00.000");
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
    await modal.episode.expectUtcTime("00:00:00.500");
    await modal.episode.stepBack();
    await modal.episode.expectUtcTime("00:00:00.000");

    await modal.episode.scrubToFraction(0.5);
    await modal.episode.expectUtcTime("00:30:00.000");
    await modal.episode.expectPlayhead("00:30:00.000 / 01:00:00.000");
    await modal.episode.inspectStream("/odometry");
    await modal.episode.expectRawField("pose.pose.position.x", 180);
    await modal.episode.inspectStream("/status");
    await modal.episode.expectRawField("counter", 360);
    await modal.episode.expectRawField("state", "active-warning");

    await modal.episode.inspectStream("/lidar/points");
    await modal.episode.expectRawMeta("t=+1788.000s");
    await modal.episode.seekToFraction(0.75);
    await modal.episode.expectUtcTime("00:45:00.000");
    await modal.episode.seekToFraction(1_812 / 3_600);
    await modal.episode.expectUtcTimeAfterAtMostOneForwardStep(
      "00:30:12.000",
      500,
    );
    await modal.episode.expectRawMeta("t=+1812.000s");

    await modal.episode.scrubToFraction(1);
    await modal.episode.expectUtcTimeAfterAtMostOneForwardStep(
      "01:00:00.000",
      500,
    );
    await modal.episode.expectPlayhead("01:00:00.000 / 01:00:00.000");
    await modal.episode.inspectStream("/status");
    await modal.episode.expectRawField("state", "complete");
    await modal.episode.stepForward();
    await modal.episode.expectUtcTime("01:00:00.000");
    await modal.episode.stepBack();
    await modal.episode.expectUtcTime("00:59:59.500");
  });
});

async function expectDominantColor(
  locator: Locator,
  expected: readonly [number, number, number],
): Promise<void> {
  await expect(locator).toBeVisible();
  await expect
    .poll(
      async () => {
        const image = await Jimp.read(await locator.screenshot());
        let matches = 0;
        let sampled = 0;
        for (let y = 0; y < image.bitmap.height; y += 4) {
          for (let x = 0; x < image.bitmap.width; x += 4) {
            const offset = (y * image.bitmap.width + x) * 4;
            const [red, green, blue] = image.bitmap.data.subarray(
              offset,
              offset + 3,
            );
            sampled += 1;
            if (
              Math.abs(red - expected[0]) <= 12 &&
              Math.abs(green - expected[1]) <= 12 &&
              Math.abs(blue - expected[2]) <= 12
            ) {
              matches += 1;
            }
          }
        }
        return matches / sampled;
      },
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0.15);
}
