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
    fo.Sample(filepath=r"${fixturePaths.a}", name="short-before-long"),
    fo.Sample(filepath=r"${fixturePaths.long}", name="long-episode"),
    fo.Sample(filepath=r"${fixturePaths.a}", name="short-after-long"),
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

    await openMcapModal(grid, modal);
    await modal.episode.waitForReady("tiny-episode-a.mcap");
    await modal.episode.expectTileTitles(["camera/front", "points", "Logs"]);
    await modal.episode.expectUtcTime("2024-01-01 00:00:00.000");
    await modal.episode.expectPlayhead(
      "2024-01-01 00:00:00.000 / 2024-01-01 00:00:02.000",
    );
    await modal.episode.expectNoViewerError();
  });

  test("keeps paused stepping, raw values, logs, and image pixels synchronized", async ({
    grid,
    modal,
  }) => {
    await openMcapModal(grid, modal);
    await modal.episode.waitForReady("tiny-episode-a.mcap");
    await modal.episode.setSamplingRate(1);
    await modal.episode.inspectStream("/pose");
    await modal.episode.expectRawField("position.x", 0);
    await expectDominantColor(
      modal.episode.image("camera/front"),
      [231, 76, 60],
    );

    await modal.episode.stepForward();
    await modal.episode.expectUtcTime("2024-01-01 00:00:01.000");
    await modal.episode.expectPlayhead(
      "2024-01-01 00:00:01.000 / 2024-01-01 00:00:02.000",
    );
    await modal.episode.expectRawField("position.x", 10);
    await modal.episode.expectLog("A log 1");
    await expectDominantColor(
      modal.episode.image("camera/front"),
      [46, 204, 113],
    );

    await modal.episode.stepBack();
    await modal.episode.expectUtcTime("2024-01-01 00:00:00.000");
    await modal.episode.expectRawField("position.x", 0);
  });

  test("replaces inventory, layout, capabilities, clock, and decoded content A-B-A", async ({
    grid,
    modal,
  }) => {
    await openMcapModal(grid, modal);
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

    await explorer.upload(fixturePaths.a);
    await explorer.episode.waitForReady("tiny-episode-a.mcap");
    await explorer.episode.expectUtcTime("2024-01-01 00:00:00.000");
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
    await openMcapModal(grid, modal, 5);
    await modal.episode.expectUnsupported();
    await modal.episode.expectNoViewerError();
  });

  test("seeks, scrubs, synchronizes sparse streams, and clamps one-hour boundaries", async ({
    grid,
    modal,
  }) => {
    await openMcapModal(grid, modal, 3);
    await modal.episode.waitForReady("long-mixed-episode.mcap");
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
    await modal.episode.expectRawField("counter", 360);
    await modal.episode.expectRawField("state", "active-warning");

    await modal.episode.inspectStream("/lidar/points");
    await modal.episode.expectRawMeta("t=+1788.000s");
    await modal.episode.seekToFraction(0.75);
    await modal.episode.expectUtcTime("2024-01-01 00:45:00.000");
    await modal.episode.seekToFraction(1_812 / 3_600);
    await modal.episode.expectUtcTimeAfterAtMostOneForwardStep(
      "2024-01-01 00:30:12.000",
      500,
    );
    await modal.episode.expectRawMeta("t=+1812.000s");

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
    await openMcapModal(grid, modal, 2);
    await modal.episode.waitForReady("tiny-episode-a.mcap");
    await modal.episode.setSamplingRate(1);
    await modal.episode.stepForward();
    await modal.episode.expectUtcTime("2024-01-01 00:00:01.000");
    await modal.episode.inspectStream("/pose");
    await modal.episode.expectRawField("position.x", 10);
    await expectDominantColor(
      modal.episode.image("camera/front"),
      [46, 204, 113],
    );

    await modal.episode.navigateDatasetSample(
      "forward",
      "long-mixed-episode.mcap",
    );
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
      [23, 63, 95],
    );

    await modal.episode.seekToFraction(0.75);
    await modal.episode.expectUtcTime("2024-01-01 00:45:00.000");
    await modal.episode.expectRawField("counter", 540);

    await modal.episode.navigateDatasetSample("forward", "tiny-episode-a.mcap");
    await modal.episode.expectPaused();
    await modal.episode.expectPlayhead(
      "2024-01-01 00:00:00.000 / 2024-01-01 00:00:02.000",
    );
    await modal.episode.expectStreams(
      ["/camera/front", "/points", "/log", "/pose"],
      ["/camera/rear", "/odometry", "/status", "/diagnostics"],
    );
    await modal.episode.expectTileTitles(
      ["camera/front", "points", "Logs"],
      ["camera/rear", "/status"],
    );
    await modal.episode.expectRawSelectionCleared();
    await modal.episode.inspectStream("/pose");
    await modal.episode.expectRawField("position.x", 0);
    await expectDominantColor(
      modal.episode.image("camera/front"),
      [231, 76, 60],
    );
  });

  test("honors rear-camera first and last temporal boundaries through seeks and scrubs", async ({
    grid,
    modal,
  }) => {
    await openMcapModal(grid, modal, 3);
    await modal.episode.waitForReady("long-mixed-episode.mcap");
    await modal.episode.setSamplingRate(2);

    await modal.episode.seekToFraction(599.5 / 3_600);
    await modal.episode.expectUtcTimeAfterAtMostOneForwardStep(
      "2024-01-01 00:09:59.500",
      500,
    );
    await modal.episode.expectTileEmpty("camera/rear", "Starts at 10:00.00");

    await modal.episode.scrubToFraction(600 / 3_600);
    await modal.episode.expectUtcTimeAfterAtMostOneForwardStep(
      "2024-01-01 00:10:00.000",
      500,
    );
    await expectDominantColor(modal.episode.image("camera/rear"), [23, 63, 95]);

    await modal.episode.seekToFraction(3_000 / 3_600);
    await modal.episode.expectUtcTimeAfterAtMostOneForwardStep(
      "2024-01-01 00:50:00.000",
      500,
    );
    await expectDominantColor(
      modal.episode.image("camera/rear"),
      [246, 213, 92],
    );

    await modal.episode.scrubToFraction(3_000.5 / 3_600);
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
    await openMcapModal(grid, modal, 3);
    await modal.episode.waitForReady("long-mixed-episode.mcap");
    await modal.episode.setSamplingRate(2);

    await modal.episode.seekToFraction(1_799.5 / 3_600);
    await modal.episode.expectUtcTimeAfterAtMostOneForwardStep(
      "2024-01-01 00:29:59.500",
      500,
    );
    await modal.episode.inspectStream("/diagnostics");
    await modal.episode.expectRawMeta("t=+1740.000s");
    await modal.episode.expectRawField("status.0.message", "nominal");
    await modal.episode.inspectStream("/rosout");
    await modal.episode.expectRawMeta("t=+1600.000s");
    await modal.episode.expectRawField("msg", "LONG pre-midpoint nominal");
    await expectDominantColor(
      modal.episode.image("camera/front"),
      [32, 99, 155],
    );

    await modal.episode.scrubToFraction(1_800 / 3_600);
    await modal.episode.expectUtcTimeAfterAtMostOneForwardStep(
      "2024-01-01 00:30:00.000",
      500,
    );
    await modal.episode.useRawStream("/diagnostics");
    await modal.episode.expectRawMeta("t=+1800.000s");
    await modal.episode.expectRawField("status.0.message", "midpoint warning");
    await modal.episode.expectRawField("status.0.level", 1);
    await modal.episode.useRawStream("/rosout");
    await modal.episode.expectRawMeta("t=+1800.000s");
    await modal.episode.expectRawField("msg", "LONG midpoint warning");
    await modal.episode.expectLogs([
      "LONG midpoint warning",
      "midpoint warning",
    ]);
    await expectDominantColor(
      modal.episode.image("camera/front"),
      [60, 174, 163],
    );

    await modal.episode.seekToFraction(1_800.5 / 3_600);
    await modal.episode.expectUtcTimeAfterAtMostOneForwardStep(
      "2024-01-01 00:30:00.500",
      500,
    );
    await modal.episode.useRawStream("/diagnostics");
    await modal.episode.expectRawMeta("t=+1800.000s");
    await modal.episode.useRawStream("/rosout");
    await modal.episode.expectRawMeta("t=+1800.000s");

    await modal.episode.scrubToFraction(1_799.5 / 3_600);
    await modal.episode.expectUtcTimeAfterAtMostOneForwardStep(
      "2024-01-01 00:29:59.500",
      500,
    );
    await modal.episode.useRawStream("/diagnostics");
    await modal.episode.expectRawMeta("t=+1740.000s");
    await modal.episode.expectRawField("status.0.message", "nominal");
    await modal.episode.useRawStream("/rosout");
    await modal.episode.expectRawMeta("t=+1600.000s");
    await modal.episode.expectRawField("msg", "LONG pre-midpoint nominal");
  });
});

async function openMcapModal(
  grid: GridPom,
  modal: ModalPom,
  sampleIndex = 0,
): Promise<void> {
  await grid.openNthSample(sampleIndex);
  await modal.sidebar.hide();
  await modal.enterFullscreen();
}

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
