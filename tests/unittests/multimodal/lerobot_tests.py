"""
LeRobotDataset v3 importer and episode asset transport tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
import errno
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

import pyarrow as pa
import pyarrow.parquet as papq
from starlette.applications import Starlette
from starlette.routing import Route
from starlette.testclient import TestClient

from decorators import drop_datasets

import fiftyone as fo
import fiftyone.types as fot
import fiftyone.utils.data as foud
import fiftyone.utils.lerobot as foul
import fiftyone.utils.lerobot_export as foule
from fiftyone.multimodal.media import (
    LeRobotEpisode,
    MalformedMediaSourceError,
    MissingMediaRootError,
    MovedMediaRootError,
    StaleMediaReferenceError,
    UnfinalizedMediaSourceError,
    UnsupportedLeRobotExportModeError,
    UnsupportedMediaReferenceVersionError,
)
from fiftyone.server import utils as fosu
from fiftyone.server.routes.groups import _filter_dict_by_fields
from fiftyone.server.routes.media_reference import MediaReferenceRoutes
from fiftyone.server.routes.sample import SampleRoutes, generate_sample_etag
from fiftyone.server.samples import _create_sample_item
from fiftyone.utils.lerobot import (
    bind_lerobot_source,
    LeRobotDatasetImporter,
    LeRobotMediaResolver,
    relocate_lerobot_source,
    unbind_lerobot_source,
)

_VIDEO_FEATURE = "observation.images.front"


def _write_v3_source(root, version="v3.2", episodes=10):
    info = {
        "codebase_version": version,
        "data_path": "data/chunk-{chunk_index:03d}/file-{file_index:03d}.parquet",
        "features": {
            "observation.state": {"dtype": "float32", "shape": [2]},
            _VIDEO_FEATURE: {
                "dtype": "video",
                "shape": [3, 8, 8],
            },
            "timestamp": {"dtype": "float32", "shape": [1]},
            "frame_index": {"dtype": "int64", "shape": [1]},
            "episode_index": {"dtype": "int64", "shape": [1]},
            "index": {"dtype": "int64", "shape": [1]},
            "task_index": {"dtype": "int64", "shape": [1]},
        },
        "fps": 10,
        "robot_type": "so101",
        "total_episodes": episodes,
        "total_frames": episodes * 2,
        "total_tasks": episodes,
        "video_path": (
            "videos/chunk-{chunk_index:03d}/{video_key}/"
            "file-{file_index:03d}.mp4"
        ),
    }
    _write_json(os.path.join(root, "meta", "info.json"), info)
    _write_json(os.path.join(root, "meta", "stats.json"), {})
    _write_parquet(
        os.path.join(root, "meta", "tasks.parquet"),
        [
            {"task_index": index, "task": "task-%d" % index}
            for index in range(episodes)
        ],
    )

    rows = []
    episode_indexes = []
    global_indexes = []
    for episode_index in range(episodes):
        start = episode_index * 2
        end = start + 2
        rows.append(
            {
                "data/chunk_index": 0,
                "data/file_index": 0,
                "dataset_from_index": start,
                "dataset_to_index": end,
                "episode_index": episode_index,
                "length": 2,
                "meta/episodes/chunk_index": 0,
                "meta/episodes/file_index": 0,
                "tasks": ["task-%d" % episode_index],
                "videos/%s/chunk_index" % _VIDEO_FEATURE: 0,
                "videos/%s/file_index" % _VIDEO_FEATURE: 5,
                "videos/%s/from_timestamp" % _VIDEO_FEATURE: start / 10,
                "videos/%s/to_timestamp" % _VIDEO_FEATURE: end / 10,
            }
        )
        episode_indexes.extend([episode_index, episode_index])
        global_indexes.extend([start, start + 1])

    split = max(1, episodes // 2)
    _write_parquet(
        os.path.join(root, "meta", "episodes", "part-000.parquet"),
        rows[:split],
    )
    _write_parquet(
        os.path.join(root, "meta", "episodes", "part-001.parquet"),
        rows[split:],
    )
    _write_parquet(
        os.path.join(root, "data", "chunk-000", "file-000.parquet"),
        {
            "episode_index": episode_indexes,
            "index": global_indexes,
            "observation.state": [
                [float(index), 0.0] for index in global_indexes
            ],
        },
    )
    video_path = os.path.join(
        root,
        "videos",
        "chunk-000",
        _VIDEO_FEATURE,
        "file-005.mp4",
    )
    os.makedirs(os.path.dirname(video_path), exist_ok=True)
    with open(video_path, "wb") as file:
        file.write(b"0123456789abcdefghijklmnopqrstuvwxyz")

    return video_path


def _write_json(path, value):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as file:
        json.dump(value, file)


def _write_parquet(path, value):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    table = (
        pa.Table.from_pylist(value)
        if isinstance(value, list)
        else pa.table(value)
    )
    papq.write_table(table, path, row_group_size=4)


def _import(root, **kwargs):
    return fo.Dataset.from_dir(
        dataset_dir=root,
        dataset_type=fot.LeRobotDataset,
        **kwargs,
    )


def _make_route_app():
    route_defs = MediaReferenceRoutes + SampleRoutes
    return Starlette(
        routes=[Route(path, endpoint) for path, endpoint in route_defs]
    )


class LeRobotImporterTests(unittest.TestCase):
    @drop_datasets
    def test_source_format_selects_importer_before_reference_construction(
        self,
    ):
        with tempfile.TemporaryDirectory() as root:
            _write_v3_source(root, version="v2.1")
            importer, _ = foud.build_dataset_importer(
                fot.LeRobotDataset, dataset_dir=root
            )
            self.assertIsInstance(importer, LeRobotDatasetImporter)

            with mock.patch.object(
                foul.LeRobotEpisode,
                "__init__",
                side_effect=AssertionError("constructed a reference"),
            ), self.assertRaises(UnsupportedMediaReferenceVersionError):
                _import(root, name="source-format-before-reference")

            self.assertFalse(
                fo.dataset_exists("source-format-before-reference")
            )

    @drop_datasets
    def test_multishard_ten_episode_import_and_relocation(self):
        with tempfile.TemporaryDirectory() as root:
            _write_v3_source(root)
            dataset = _import(root, max_samples=10)

            self.assertEqual(len(dataset), 10)
            references = [sample.media_reference for sample in dataset]
            self.assertEqual(
                len({reference.key for reference in references}), 10
            )
            self.assertEqual(
                len(
                    {
                        asset.location.path
                        for reference in references
                        for asset in reference.describe_assets()
                        if asset.role.value == "video-stream"
                    }
                ),
                1,
            )
            self.assertTrue(
                all(
                    not hasattr(reference, "dataset_root")
                    for reference in references
                )
            )
            self.assertEqual(dataset.info["lerobot"]["format_major"], 3)
            self.assertEqual(
                dataset.info["lerobot"]["imported_episode_count"], 10
            )

            locator = references[7].locator
            self.assertEqual(
                (
                    locator.global_dataset_rows.coordinate_system,
                    locator.global_dataset_rows.start,
                    locator.global_dataset_rows.end,
                ),
                ("lerobot-v3-global-dataset-row", 14, 16),
            )
            self.assertEqual(locator.parquet_file_rows.start, 14)
            self.assertTrue(locator.parquet_row_groups)
            self.assertEqual(locator.videos[0].feature_name, _VIDEO_FEATURE)
            self.assertTrue(
                locator.episode_metadata_location.path.endswith(
                    "part-001.parquet"
                )
            )

            selected = _import(root, episodes=[7, 2], max_samples=1)
            self.assertEqual(selected.values("episode_index"), [7])

            relocated_root = root + "-relocated"
            shutil.copytree(root, relocated_root)
            try:
                relocate_lerobot_source(
                    references[7].source_identity,
                    relocated_root,
                )
                manifest = LeRobotMediaResolver().resolve_assets(
                    references[7], references[7].describe_assets()
                )
                self.assertEqual(manifest.episode_index, 7)
            finally:
                relocate_lerobot_source(
                    references[7].source_identity,
                    root,
                )
                shutil.rmtree(relocated_root)

    @drop_datasets
    def test_source_content_changes_identity_and_stales_locator(self):
        with tempfile.TemporaryDirectory() as root:
            video_path = _write_v3_source(root)
            first = _import(root, max_samples=1).first().media_reference

            with open(video_path, "ab") as file:
                file.write(b"changed")

            second = _import(root, max_samples=1).first().media_reference
            self.assertNotEqual(first.source_identity, second.source_identity)
            with self.assertRaises(StaleMediaReferenceError):
                LeRobotMediaResolver().resolve_assets(
                    first, first.describe_assets()
                )

    @drop_datasets
    def test_atomic_version_and_structure_rejection(self):
        cases = [
            ("v2.1", UnsupportedMediaReferenceVersionError),
            ("v4.0", UnsupportedMediaReferenceVersionError),
            ("not-a-version", MalformedMediaSourceError),
        ]
        for index, (version, error_type) in enumerate(cases):
            with self.subTest(
                version=version
            ), tempfile.TemporaryDirectory() as root:
                _write_v3_source(root, version=version)
                name = "invalid-version-%d" % index
                with self.assertRaises(error_type):
                    _import(root, name=name)
                self.assertFalse(fo.dataset_exists(name))

        with tempfile.TemporaryDirectory() as root:
            name = "missing-info"
            with self.assertRaises(MalformedMediaSourceError):
                _import(root, name=name)
            self.assertFalse(fo.dataset_exists(name))

        with tempfile.TemporaryDirectory() as root:
            info_path = os.path.join(root, "meta", "info.json")
            os.makedirs(os.path.dirname(info_path), exist_ok=True)
            with open(info_path, "w") as file:
                file.write("{malformed")
            name = "malformed-info"
            with self.assertRaises(MalformedMediaSourceError):
                _import(root, name=name)
            self.assertFalse(fo.dataset_exists(name))

    @drop_datasets
    def test_unfinalized_parquet_has_actionable_error(self):
        with tempfile.TemporaryDirectory() as root:
            _write_v3_source(root)
            shard = os.path.join(root, "meta", "episodes", "part-001.parquet")
            with open(shard, "wb") as file:
                file.write(b"recording was not finalized")

            name = "bad-footer"
            with self.assertRaisesRegex(
                UnfinalizedMediaSourceError, "finalize or repair"
            ):
                _import(root, name=name)
            self.assertFalse(fo.dataset_exists(name))

    @drop_datasets
    def test_typed_missing_and_moved_binding_errors(self):
        with tempfile.TemporaryDirectory() as root:
            _write_v3_source(root)
            dataset = _import(root, max_samples=1)
            reference = dataset.first().media_reference
            resolver = LeRobotMediaResolver()

            bind_lerobot_source(
                reference.source_identity,
                os.path.join(root, "moved"),
                reference.source_fingerprint,
            )
            with self.assertRaises(MovedMediaRootError):
                resolver.resolve_assets(reference, reference.describe_assets())

            unbind_lerobot_source(reference.source_identity)
            with self.assertRaises(MissingMediaRootError):
                resolver.resolve_assets(reference, reference.describe_assets())

            bind_lerobot_source(
                reference.source_identity,
                root,
                "sha256:" + "0" * 64,
            )
            with self.assertRaises(StaleMediaReferenceError):
                resolver.resolve_assets(reference, reference.describe_assets())
            unbind_lerobot_source(reference.source_identity)

    @drop_datasets
    def test_source_binding_survives_a_fresh_server_process(self):
        with tempfile.TemporaryDirectory() as root:
            _write_v3_source(root)
            dataset = _import(root, max_samples=1)
            sample = dataset.first()
            script = """
import sys
from starlette.applications import Starlette
from starlette.routing import Route
from starlette.testclient import TestClient
from fiftyone.server.routes.media_reference import MediaReferenceRoutes

app = Starlette(routes=[Route(path, endpoint) for path, endpoint in MediaReferenceRoutes])
path = '/dataset/%s/sample/%s/multimodal/manifest' % (sys.argv[1], sys.argv[2])
response = TestClient(app).get(path)
print(response.status_code)
print(response.json().get('episode_index'))
"""
            output = subprocess.check_output(
                [
                    sys.executable,
                    "-c",
                    script,
                    str(dataset._doc.id),
                    sample.id,
                ],
                cwd=os.getcwd(),
                text=True,
                timeout=120,
            )
            self.assertEqual(output.strip().splitlines()[-2:], ["200", "0"])

            with tempfile.TemporaryDirectory() as relocation_parent:
                relocated_root = os.path.join(relocation_parent, "source")
                shutil.copytree(root, relocated_root)
                relocate_lerobot_source(
                    sample.media_reference.source_identity, relocated_root
                )
                relocated_output = subprocess.check_output(
                    [
                        sys.executable,
                        "-c",
                        script,
                        str(dataset._doc.id),
                        sample.id,
                    ],
                    cwd=os.getcwd(),
                    text=True,
                    timeout=120,
                )
                self.assertEqual(
                    relocated_output.strip().splitlines()[-2:], ["200", "0"]
                )

            relocate_lerobot_source(
                sample.media_reference.source_identity, root
            )

            with tempfile.TemporaryDirectory() as export_parent:
                export_root = os.path.join(export_parent, "native")
                dataset.export(
                    export_dir=export_root,
                    dataset_type=fot.FiftyOneDataset,
                    export_media=True,
                )
                for filename in ("metadata.json", "samples.json"):
                    with open(os.path.join(export_root, filename)) as file:
                        self.assertNotIn(root, file.read())


class LeRobotExporterTests(unittest.TestCase):
    @unittest.skipUnless(
        importlib.util.find_spec("lerobot") is not None,
        "official LeRobot reader is not installed",
    )
    @drop_datasets
    def test_official_reader_opens_exported_coordinates(self):
        from lerobot.datasets.lerobot_dataset import (
            LeRobotDataset,
            LeRobotDatasetMetadata,
        )

        with tempfile.TemporaryDirectory() as temp_dir:
            source_root = os.path.join(temp_dir, "source")
            export_root = os.path.join(temp_dir, "export")
            _write_v3_source(source_root, episodes=4)
            dataset = _import(source_root, episodes=[1, 3])
            dataset.export(
                export_dir=export_root,
                dataset_type=fot.LeRobotDataset,
                export_media=True,
            )

            metadata = LeRobotDatasetMetadata(
                repo_id="fiftyone/test-export",
                root=export_root,
                token=False,
            )
            official = LeRobotDataset(
                repo_id="fiftyone/test-export",
                root=export_root,
                episodes=[0, 1],
                download_videos=False,
                token=False,
            )
            self.assertEqual(metadata.total_episodes, 2)
            self.assertEqual(
                {int(value) for value in official.hf_dataset["episode_index"]},
                {0, 1},
            )
            self.assertEqual(int(official.hf_dataset[0]["frame_index"]), 0)

    @drop_datasets
    def test_self_contained_selected_episode_export(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            source_root = os.path.join(temp_dir, "source")
            export_root = os.path.join(temp_dir, "export")
            source_video = _write_v3_source(source_root, episodes=4)
            dataset = _import(source_root)
            selected = dataset.select(
                dataset.match({"episode_index": {"$in": [1, 3]}}).values("id")
            )

            selected.export(
                export_dir=export_root,
                dataset_type=fot.LeRobotDataset,
                export_media=True,
            )

            exported = _import(export_root)
            self.assertEqual(exported.values("episode_index"), [0, 1])
            self.assertEqual(exported.values("length"), [2, 2])
            with open(os.path.join(export_root, "meta", "info.json")) as file:
                info = json.load(file)

            self.assertEqual(info["total_episodes"], 2)
            self.assertEqual(info["total_frames"], 4)
            data_path = info["data_path"].format(chunk_index=0, file_index=0)
            data = papq.read_table(os.path.join(export_root, data_path))
            self.assertEqual(data["index"].to_pylist(), [0, 1, 2, 3])
            self.assertEqual(data["episode_index"].to_pylist(), [0, 0, 1, 1])
            self.assertEqual(data["frame_index"].to_pylist(), [0, 1, 0, 1])
            with open(os.path.join(export_root, "meta", "stats.json")) as file:
                statistics = json.load(file)

            self.assertIn("observation.state", statistics)
            self.assertEqual(statistics["index"]["min"], [0])

            episodes = papq.read_table(
                os.path.join(
                    export_root,
                    "meta",
                    "episodes",
                    "chunk-000",
                    "file-000.parquet",
                )
            )
            self.assertEqual(
                episodes["meta/episodes/chunk_index"].to_pylist(), [0, 0]
            )
            self.assertEqual(
                episodes["meta/episodes/file_index"].to_pylist(), [0, 0]
            )
            self.assertEqual(
                episodes["videos/%s/file_index" % _VIDEO_FEATURE].to_pylist(),
                [0, 0],
            )
            self.assertIn("stats/index/min", episodes.column_names)

            exported_video = os.path.join(
                export_root,
                "videos",
                "chunk-000",
                _VIDEO_FEATURE,
                "file-000.mp4",
            )
            with open(source_video, "rb") as source_file, open(
                exported_video, "rb"
            ) as exported_file:
                self.assertEqual(exported_file.read(), source_file.read())

            second_export_root = os.path.join(temp_dir, "second-export")
            selected.export(
                export_dir=second_export_root,
                dataset_type=fot.LeRobotDataset,
                export_media=True,
            )
            exported_reference = exported.first().media_reference
            manifest = LeRobotMediaResolver().resolve_assets(
                exported_reference,
                exported_reference.describe_assets(),
            )
            self.assertEqual(manifest.episode_index, 0)

    @drop_datasets
    def test_export_preserves_arrow_types_timestamps_and_permissions(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            source_root = os.path.join(temp_dir, "source")
            export_root = os.path.join(temp_dir, "export")
            _write_v3_source(source_root, episodes=2)
            data_path = os.path.join(
                source_root, "data", "chunk-000", "file-000.parquet"
            )
            state_type = pa.list_(pa.float32(), 2)
            source_table = pa.table(
                {
                    "episode_index": pa.array([0, 0, 1, 1], pa.int64()),
                    "index": pa.array([0, 1, 2, 3], pa.int64()),
                    "frame_index": pa.array([0, 1, 0, 1], pa.int64()),
                    "timestamp": pa.array(
                        [0.01, 0.11, 0.02, 0.12], pa.float32()
                    ),
                    "task_index": pa.array([0, 0, 1, 1], pa.int64()),
                    "observation.state": pa.array(
                        [[0, 1], [2, 3], [4, 5], [6, 7]],
                        type=state_type,
                    ),
                }
            )
            papq.write_table(source_table, data_path)
            dataset = _import(source_root)

            previous_umask = os.umask(0o077)
            try:
                dataset.export(
                    export_dir=export_root,
                    dataset_type=fot.LeRobotDataset,
                )
            finally:
                os.umask(previous_umask)

            exported_table = papq.read_table(
                os.path.join(
                    export_root, "data", "chunk-000", "file-000.parquet"
                )
            )
            self.assertEqual(
                exported_table.schema.field("observation.state").type,
                state_type,
            )
            self.assertEqual(
                exported_table.schema.field("timestamp").type, pa.float32()
            )
            self.assertEqual(
                exported_table["timestamp"].to_pylist(),
                source_table["timestamp"].to_pylist(),
            )
            self.assertEqual(os.stat(export_root).st_mode & 0o777, 0o700)

            aggregate = foule._aggregate_episode_statistics(
                [
                    {
                        "stats/camera/min": [0],
                        "stats/camera/max": [1],
                        "stats/camera/mean": [0.5],
                        "stats/camera/std": [0.5],
                        "stats/camera/count": [2],
                        "stats/camera/q50": [0.5],
                    },
                    {
                        "stats/camera/min": [100],
                        "stats/camera/max": [100],
                        "stats/camera/mean": [100],
                        "stats/camera/std": [0],
                        "stats/camera/count": [1],
                        "stats/camera/q50": [100],
                    },
                ],
                "camera",
            )
            self.assertNotIn("q50", aggregate)

    @drop_datasets
    def test_export_modes_and_preflight_are_atomic(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = os.path.join(temp_dir, "source")
            _write_v3_source(root, episodes=2)
            dataset = _import(root)

            valid_destination = os.path.join(temp_dir, "existing")
            dataset.export(
                export_dir=valid_destination,
                dataset_type=fot.LeRobotDataset,
            )
            info_path = os.path.join(valid_destination, "meta", "info.json")
            with open(info_path, "rb") as file:
                existing_info = file.read()

            obsolete_path = os.path.join(valid_destination, "obsolete")
            with open(obsolete_path, "w") as file:
                file.write("old export")
            dataset.export(
                export_dir=valid_destination,
                dataset_type=fot.LeRobotDataset,
                overwrite=True,
            )
            self.assertFalse(os.path.exists(obsolete_path))
            with open(info_path, "rb") as file:
                existing_info = file.read()

            modes = (
                (False, "thin-reference-native-only"),
                (0, "unsupported-export-mode"),
                ("move", "shared-source-move-unsupported"),
                ("symlink", "self-contained-export-required"),
                ("manifest", "manifest-native-only"),
            )
            for index, (mode, reason) in enumerate(modes):
                destination = os.path.join(temp_dir, "mode-%d" % index)
                with self.subTest(mode=mode), self.assertRaisesRegex(
                    UnsupportedLeRobotExportModeError,
                    "export_media=.*export_media=True",
                ) as context:
                    dataset.export(
                        export_dir=destination,
                        dataset_type=fot.LeRobotDataset,
                        export_media=mode,
                    )
                self.assertEqual(context.exception.export_media, mode)
                self.assertEqual(context.exception.reason, reason)
                self.assertFalse(os.path.exists(destination))

            first, second = [sample.media_reference for sample in dataset]
            mixed = fo.Dataset()
            mixed.add_samples(
                [
                    fo.Sample.from_media_reference(first),
                    fo.Sample.from_media_reference(
                        LeRobotEpisode(
                            source_identity="hub:other/source@revision",
                            source_fingerprint=second.source_fingerprint,
                            episode_index=second.episode_index,
                            codebase_version=second.codebase_version,
                            locator=second.locator,
                        )
                    ),
                ]
            )
            mixed_destination = os.path.join(temp_dir, "mixed")
            with self.assertRaisesRegex(ValueError, "source_identity"):
                mixed.export(
                    export_dir=mixed_destination,
                    dataset_type=fot.LeRobotDataset,
                )
            self.assertFalse(os.path.exists(mixed_destination))

            video_path = os.path.join(
                root,
                "videos",
                "chunk-000",
                _VIDEO_FEATURE,
                "file-005.mp4",
            )
            with open(video_path, "ab") as file:
                file.write(b"stale")

            stale_destination = os.path.join(temp_dir, "stale")
            with self.assertRaises(StaleMediaReferenceError):
                dataset.export(
                    export_dir=stale_destination,
                    dataset_type=fot.LeRobotDataset,
                )
            self.assertFalse(os.path.exists(stale_destination))

            with self.assertRaises(StaleMediaReferenceError):
                dataset.export(
                    export_dir=valid_destination,
                    dataset_type=fot.LeRobotDataset,
                    overwrite=True,
                )
            with open(info_path, "rb") as file:
                self.assertEqual(file.read(), existing_info)

    @drop_datasets
    def test_export_rejects_frames_without_declared_tasks(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            source_root = os.path.join(temp_dir, "source")
            export_root = os.path.join(temp_dir, "export")
            _write_v3_source(source_root, episodes=2)
            for path in (
                os.path.join(
                    source_root,
                    "meta",
                    "episodes",
                    "part-000.parquet",
                ),
                os.path.join(
                    source_root,
                    "meta",
                    "episodes",
                    "part-001.parquet",
                ),
            ):
                rows = papq.read_table(path).to_pylist()
                for row in rows:
                    row["tasks"] = []
                _write_parquet(path, rows)

            dataset = _import(source_root)
            with self.assertRaisesRegex(
                MalformedMediaSourceError, "declared task"
            ):
                dataset.export(
                    export_dir=export_root,
                    dataset_type=fot.LeRobotDataset,
                )

            self.assertFalse(os.path.exists(export_root))


class LeRobotServerTests(unittest.TestCase):
    @drop_datasets
    def test_manifest_cache_avoids_rehashing_and_detects_changes(self):
        with tempfile.TemporaryDirectory() as root:
            video_path = _write_v3_source(root)
            dataset = _import(root, max_samples=1)
            sample = dataset.first()
            reference = sample.media_reference
            client = TestClient(_make_route_app())
            manifest_path = "/dataset/%s/sample/%s/multimodal/manifest" % (
                dataset._doc.id,
                sample.id,
            )

            bind_lerobot_source(
                reference.source_identity,
                root,
                reference.source_fingerprint,
            )
            with mock.patch.object(
                foul, "_sha256_file", wraps=foul._sha256_file
            ) as fingerprint:
                manifest = client.get(manifest_path).json()
                video = next(
                    asset
                    for asset in manifest["assets"]
                    if asset["role"] == "video-stream"
                )
                first_hash_count = fingerprint.call_count
                self.assertGreater(first_hash_count, 0)

                for _ in range(2):
                    response = client.get(
                        video["url"], headers={"Range": "bytes=0-3"}
                    )
                    self.assertEqual(response.status_code, 206)

                self.assertEqual(fingerprint.call_count, first_hash_count)

                with open(video_path, "ab") as file:
                    file.write(b"changed")

                stale = client.get(
                    video["url"], headers={"Range": "bytes=0-3"}
                )
                self.assertEqual(stale.status_code, 409)
                self.assertEqual(
                    stale.headers["X-FiftyOne-Error-Kind"],
                    "stale-media-reference",
                )

    @drop_datasets
    def test_range_stat_races_have_typed_public_errors(self):
        with tempfile.TemporaryDirectory() as root:
            _write_v3_source(root)
            dataset = _import(root, max_samples=1)
            sample = dataset.first()
            client = TestClient(_make_route_app())
            manifest_path = "/dataset/%s/sample/%s/multimodal/manifest" % (
                dataset._doc.id,
                sample.id,
            )
            manifest = client.get(manifest_path).json()
            video_url = next(
                asset["url"]
                for asset in manifest["assets"]
                if asset["role"] == "video-stream"
            )

            cases = (
                (FileNotFoundError(), 404, "missing-media-asset"),
                (NotADirectoryError(), 404, "missing-media-asset"),
                (PermissionError(), 403, "media-source-authorization"),
                (
                    OSError(errno.EIO, root + "/private/video.mp4"),
                    409,
                    "stale-media-asset",
                ),
            )
            for error, status, kind in cases:
                with self.subTest(error=type(error).__name__), mock.patch(
                    "fiftyone.server.routes.media_reference._stat_asset",
                    side_effect=error,
                ):
                    response = client.get(video_url)
                    self.assertEqual(response.status_code, status)
                    self.assertEqual(
                        response.headers["X-FiftyOne-Error-Kind"], kind
                    )
                    self.assertNotIn(root, response.text)

            with mock.patch(
                "fiftyone.server.routes.media_reference.os.open",
                side_effect=FileNotFoundError(),
            ):
                response = client.get(video_url)
            self.assertEqual(response.status_code, 404)
            self.assertEqual(
                response.headers["X-FiftyOne-Error-Kind"],
                "missing-media-asset",
            )

            with mock.patch(
                "fiftyone.server.routes.media_reference.os.open",
                return_value=51,
            ), mock.patch(
                "fiftyone.server.routes.media_reference.os.fstat",
                side_effect=OSError(errno.EIO, "unreadable descriptor"),
            ), mock.patch(
                "fiftyone.server.routes.media_reference.os.close"
            ) as close:
                response = client.get(video_url)

            self.assertEqual(response.status_code, 409)
            self.assertEqual(
                response.headers["X-FiftyOne-Error-Kind"],
                "stale-media-asset",
            )
            close.assert_any_call(51)

    @drop_datasets
    def test_manifest_range_scope_and_redaction(self):
        with tempfile.TemporaryDirectory() as root:
            _write_v3_source(root)
            dataset = _import(root, max_samples=2)
            first, second = list(dataset)
            client = TestClient(_make_route_app())
            manifest_path = "/dataset/%s/sample/%s/multimodal/manifest" % (
                dataset._doc.id,
                first.id,
            )
            response = client.get(manifest_path)
            self.assertEqual(response.status_code, 200)
            manifest = response.json()
            encoded = json.dumps(manifest)
            self.assertNotIn(root, encoded)
            self.assertNotIn("relative_path", encoded)
            self.assertNotIn("locator", encoded)
            self.assertEqual(manifest["episode_index"], 0)
            self.assertEqual(manifest["frame_count"], 2)
            self.assertEqual(manifest["robot_type"], "so101")
            self.assertIn("source_fingerprint", manifest)
            self.assertTrue(
                {
                    "dataset-info",
                    "episode-metadata",
                    "tabular-frame-data",
                    "video-stream",
                }.issubset({asset["role"] for asset in manifest["assets"]})
            )

            video = next(
                asset
                for asset in manifest["assets"]
                if asset["role"] == "video-stream"
            )
            ranged = client.get(video["url"], headers={"Range": "bytes=0-3"})
            self.assertEqual(ranged.status_code, 206)
            self.assertEqual(ranged.content, b"0123")
            self.assertEqual(ranged.headers["accept-ranges"], "bytes")

            cross_sample_url = "/dataset/%s/sample/%s/multimodal/assets/%s" % (
                dataset._doc.id,
                second.id,
                video["asset_id"],
            )
            self.assertEqual(client.get(cross_sample_url).status_code, 404)
            traversal = client.get(manifest_path + "?path=../../etc/passwd")
            self.assertEqual(traversal.status_code, 200)
            self.assertEqual(traversal.json(), manifest)

            serialized = fosu.json.serialize(first)
            descriptor = serialized["_media_reference"]
            self.assertEqual(set(descriptor), {"kind", "key", "version"})
            self.assertEqual(serialized["_media_type"], "multimodal")
            self.assertNotIn(root, json.dumps(serialized))

            raw = dataset._sample_collection.find_one({"_id": first._id})
            grid = asyncio.run(
                _create_sample_item(
                    dataset,
                    raw,
                    {},
                    {},
                    True,
                    additional_media_fields=(None, (), ()),
                )
            )
            modal = asyncio.run(
                _create_sample_item(
                    dataset,
                    raw,
                    {},
                    {},
                    False,
                    additional_media_fields=(None, (), ()),
                )
            )
            for transported in (grid.sample, modal.sample):
                self.assertEqual(
                    set(transported["_media_reference"]),
                    {"kind", "key", "version"},
                )
                self.assertEqual(transported["_media_type"], "multimodal")

            grouped = _filter_dict_by_fields(serialized, {"task"})
            self.assertIn("_media_reference", grouped)
            self.assertIn("_media_type", grouped)

            patch_path = "/dataset/%s/sample/%s" % (
                dataset._doc.id,
                first.id,
            )
            patched = client.patch(
                patch_path,
                headers={
                    "Content-Type": "application/json",
                    "If-Match": generate_sample_etag(first),
                },
                json={"task": "updated"},
            )
            self.assertEqual(patched.status_code, 200)
            self.assertEqual(
                set(patched.json()["_media_reference"]),
                {"kind", "key", "version"},
            )
            self.assertNotIn(root, patched.text)

            moved_root = root + "-moved"
            os.rename(root, moved_root)
            try:
                moved_response = client.get(manifest_path)
                self.assertEqual(moved_response.status_code, 409)
                self.assertEqual(
                    moved_response.headers["X-FiftyOne-Error-Kind"],
                    "moved-media-root",
                )
                self.assertNotIn(root, moved_response.text)
                self.assertNotIn(moved_root, moved_response.text)
            finally:
                os.rename(moved_root, root)

            dataset._sample_collection.update_one(
                {"_id": first._id},
                {"$set": {"_media_reference.kind": "unknown-reference"}},
            )
            first.reload()
            malformed = client.get(manifest_path)
            self.assertEqual(malformed.status_code, 422)
            self.assertEqual(
                malformed.headers["X-FiftyOne-Error-Kind"],
                "malformed-media-reference",
            )
            self.assertNotIn(root, malformed.text)


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
