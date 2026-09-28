import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { SelectionTrayPom } from "src/oss/poms/selection-tray";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const test = base.extend<
  {
    datasetName: string;
    grid: GridPom;
    modal: ModalPom;
    sidebar: SidebarPom;
    tray: SelectionTrayPom;
  },
  { sourceRoot: string }
>({
  sourceRoot: [
    async ({ foWebServer, mediaFactory }, use) => {
      const sourceRoot = await fs.mkdtemp(
        path.join(os.tmpdir(), "selection-lerobot-"),
      );
      const videoPath = path.join(
        sourceRoot,
        "videos/chunk-000/observation.images.front/file-005.mp4",
      );
      const secondVideoPath = path.join(
        sourceRoot,
        "videos/chunk-000/observation.images.front/file-006.mp4",
      );
      try {
        await foWebServer.startWebServer();
        await fs.mkdir(path.dirname(videoPath), { recursive: true });
        await Promise.all([
          mediaFactory.createVideo({
            outputPath: videoPath,
            duration: 1,
            frameRate: 10,
            width: 64,
            height: 64,
            color: "#558855",
          }),
          mediaFactory.createVideo({
            outputPath: secondVideoPath,
            duration: 1,
            frameRate: 10,
            width: 64,
            height: 64,
            color: "#555588",
          }),
        ]);
        await use(sourceRoot);
      } finally {
        await foWebServer.stopWebServer();
        await fs.rm(sourceRoot, { force: true, recursive: true });
      }
    },
    { scope: "worker", auto: true },
  ],
  datasetName: async ({ fiftyoneLoader, sourceRoot }, use) => {
    const datasetName = getUniqueDatasetNameWithPrefix("selection-lerobot");
    await fiftyoneLoader.executePythonCode(`
import json
import os

import pyarrow as pa
import pyarrow.parquet as pq

import fiftyone as fo
import fiftyone.core.tags as fotags
import fiftyone.types as fot

root = r"${sourceRoot}"

def write_json(relative_path, value):
    target = os.path.join(root, relative_path)
    os.makedirs(os.path.dirname(target), exist_ok=True)
    with open(target, "w") as handle:
        json.dump(value, handle)

def write_parquet(relative_path, rows):
    target = os.path.join(root, relative_path)
    os.makedirs(os.path.dirname(target), exist_ok=True)
    pq.write_table(pa.Table.from_pylist(rows), target)

write_json("meta/info.json", {
    "codebase_version": "v3.2",
    "data_path": "data/chunk-{chunk_index:03d}/file-{file_index:03d}.parquet",
    "features": {
        "observation.state": {"dtype": "float32", "shape": [2]},
        "observation.images.front": {"dtype": "video", "shape": [3, 64, 64]},
        "timestamp": {"dtype": "float32", "shape": [1]},
        "frame_index": {"dtype": "int64", "shape": [1]},
        "episode_index": {"dtype": "int64", "shape": [1]},
        "index": {"dtype": "int64", "shape": [1]},
        "task_index": {"dtype": "int64", "shape": [1]},
    },
    "fps": 10,
    "robot_type": "so101",
    "total_episodes": 2,
    "total_frames": 4,
    "total_tasks": 2,
    "video_path": "videos/chunk-{chunk_index:03d}/{video_key}/file-{file_index:03d}.mp4",
})
write_json("meta/stats.json", {})
write_parquet("meta/tasks.parquet", [
    {"task_index": 0, "task": "pick"},
    {"task_index": 1, "task": "place"},
])
write_parquet("meta/episodes/part-000.parquet", [
    {
        "data/chunk_index": 0,
        "data/file_index": 0,
        "dataset_from_index": index * 2,
        "dataset_to_index": index * 2 + 2,
        "episode_index": index,
        "length": 2,
        "meta/episodes/chunk_index": 0,
        "meta/episodes/file_index": 0,
        "tasks": [task],
        "videos/observation.images.front/chunk_index": 0,
        "videos/observation.images.front/file_index": 5 + index,
        "videos/observation.images.front/from_timestamp": index * 0.2,
        "videos/observation.images.front/to_timestamp": index * 0.2 + 0.2,
    }
    for index, task in enumerate(["pick", "place"])
])
write_parquet("data/chunk-000/file-000.parquet", [
    {
        "episode_index": index // 2,
        "index": index,
        "timestamp": index / 10,
        "frame_index": index % 2,
        "task_index": index // 2,
        "observation.state": [float(index), 0.0],
    }
    for index in range(4)
])

dataset = fo.Dataset.from_dir(
    dataset_dir=root,
    dataset_type=fot.LeRobotDataset,
    name="${datasetName}",
    persistent=True,
)
first, second = list(dataset)
fotags.add_temporal_tags(dataset, [
    fotags.TemporalTag(
        second.id,
        100_000_000,
        200_000_000,
        "inspection",
        anchor="observation.images.front",
    ),
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
});

test("LeRobot whole episodes and temporal ranges reopen with their source", async ({
  datasetName,
  fiftyoneLoader,
  grid,
  modal,
  page,
  sidebar,
  tray,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await grid.assert.isTileCountEqualTo(2);
  await grid.toggleSelectNthSample(0);
  await tray.createSubset("Whole pick episode");
  await tray.openCreatedSubset();
  await grid.assert.isTileCountEqualTo(1);
  await grid.openFirstSample();
  await modal.episode.waitForReady(/^Episode 0 · pick/);
  await modal.close();

  await tray.chooseAllSamples();
  await sidebar.clickFieldDropdown("_temporal_tags");
  await sidebar.applyFilter("inspection");
  await expect(tray.locator).toContainText(/1 segment across 1 episode/);
  await tray.createSubset("Place range");
  await tray.openCreatedSubset();
  await grid.assert.isTileCountEqualTo(1);
  await expect(grid.locator.getByTestId("saved-segment-tile")).toHaveAttribute(
    "title",
    /Temporal tag: inspection/,
  );
  await grid.toggleSelectNthSample(0);
  await expect(tray.cards.first()).toHaveAttribute(
    "aria-label",
    /file-006\.mp4, 1 segment/,
  );
  await grid.openFirstSample();
  await expect(modal.episode.shell).toBeVisible();
  await modal.episode.waitForReady(/^Episode 1 · place/);
  await expect(
    modal.locator.getByText("Temporal tag: inspection").first(),
  ).toBeVisible({ timeout: 30_000 });
  await expect(modal.savedRangeBars).toHaveCount(1);
  await expect(modal.savedRangeBars.first()).toHaveAttribute(
    "title",
    /Temporal tag: inspection.*\(0\.10-0\.20s\)/,
  );
  await expect(
    modal.episode.controls.locator('[data-testid="timeline-playhead-time"]'),
  ).toHaveText(/^0:00\.1[0-4] \/ 0:00\.20$/);
  await modal.close();
});
