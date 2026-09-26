import type { Locator, Page } from "@playwright/test";
import {
  alternateMediaDatasetName,
  expect,
  expectDominantColor,
  fixturePaths,
  openMcapModal,
  sampleIndex,
  sidebarFileNames,
  test,
  tinyA,
  tinyB,
} from "src/oss/fixtures/mcap";
import { EventUtils } from "src/shared/event-utils";

const SOURCE_FACTS_DATABASE_NAME = "fiftyone-multimodal-source-facts";

test.describe("MCAP surfaces", () => {
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
    // opening the episode persists its source facts
    await modal.eventUtils.after("multimodal-source-facts-saved", async () => {
      await openMcapModal(grid, modal, sampleIndex.episodeA);
      await modal.episode.waitForReady(tinyA.fileName);
    });
    expect(await sourceFactsEntryCount(page)).toBeGreaterThan(0);

    await modal.close();
    await page.evaluate(async () => {
      await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
    });
    await page.reload();
    await grid.locator.waitFor();

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
      await modal.episode.waitForReady(tinyA.fileName);
      await modal.episode.expectTileTitles(
        ["camera/front", "points"],
        ["Logs / Diagnostics"],
      );
      await modal.episode.expectNoViewerError();

      await modal.afterLookerAttached(async () => {
        await modal.selectMediaField("thumbnail_path");
      });
      await modal.waitForSampleLoadDomAttribute();
      await expectDominantColor(
        modal.modalContainer.locator("canvas"),
        [255, 0, 255],
      );

      await modal.afterLookerAttached(async () => {
        await modal.getSampleNavigation("forward").click();
      });
      await modal.waitForSampleLoadDomAttribute();
      await expectDominantColor(
        modal.modalContainer.locator("canvas"),
        [0, 255, 255],
      );

      await modal.selectMediaField("filepath");
      await modal.episode.waitForReady(tinyB.fileName);
      await modal.episode.expectTileTitles(
        ["camera/rear", "camera/side", "scan/rear"],
        ["Logs / Diagnostics"],
      );
      await modal.episode.expectNoViewerError();
    });
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
      // each frame's points are drawn once the panel's render stats report
      // them, so every screenshot shows that frame's cloud
      await expectPointCloudSpread(pointPanel, 4, 1);
      await expect(canvas).toHaveScreenshot("point-frame-1.png");
      await modal.episode.stepForward();
      await expectPointCloudSpread(pointPanel, 4, 2);
      await expect(canvas).toHaveScreenshot("point-frame-2.png");
      await modal.episode.stepForward();
      await expectPointCloudSpread(pointPanel, 5, 3);
      await expect(canvas).toHaveScreenshot("point-frame-3.png");

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
      await expect(imageCanvas).toHaveScreenshot("projection-off.png");
      await modal.episode.setSidebarToggle(
        "camera/front",
        "Toggle pointcloud projections",
        true,
      );
      await expect(imageCanvas).toHaveScreenshot("projection-on.png");

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

async function sourceFactsEntryCount(page: Page): Promise<number> {
  return page.evaluate(async (databaseName) => {
    const databases = await indexedDB.databases();
    if (!databases.some((database) => database.name === databaseName)) return 0;
    return new Promise<number>((resolve) => {
      const request = indexedDB.open(databaseName);
      let settled = false;
      const settle = (database: IDBDatabase | null, value: number) => {
        if (settled) return;
        settled = true;
        database?.close();
        resolve(value);
      };
      request.onerror = () => settle(null, 0);
      request.onblocked = () => settle(null, 0);
      request.onsuccess = () => {
        const database = request.result;
        if (settled) {
          database.close();
          return;
        }
        if (!database.objectStoreNames.contains("entries")) {
          settle(database, 0);
          return;
        }
        const transaction = database.transaction("entries", "readonly");
        const count = transaction.objectStore("entries").count();
        transaction.onabort = () => settle(database, 0);
        count.onerror = () => settle(database, 0);
        count.onsuccess = () => settle(database, count.result);
      };
    });
  }, SOURCE_FACTS_DATABASE_NAME);
}

async function expectPointCloudSpread(
  panel: Locator,
  minimumRenderedCount: number,
  minimumSpreadAxes: number,
): Promise<void> {
  await new EventUtils(panel.page()).untilDom(
    panel,
    (element, [count, axes]) => {
      const rendered = Number(
        element.getAttribute("data-point-cloud-rendered-count"),
      );
      const spread = (
        element.getAttribute("data-point-cloud-bounds-size") ?? ""
      )
        .split(",")
        .map(Number)
        .filter((value) => Number.isFinite(value) && value > 0.1).length;
      return rendered >= count && spread >= axes;
    },
    [minimumRenderedCount, minimumSpreadAxes] as const,
  );
}

async function expectStatsRow(
  scope: Locator,
  label: string,
  value: string | RegExp,
): Promise<void> {
  const row = scope.locator(`[data-stats-row=${JSON.stringify(label)}]`);
  await expect(row.locator("span").last()).toHaveText(value);
}
