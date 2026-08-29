"""
LeRobotDataset v3 importer and episode asset transport tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
from dataclasses import replace
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
import uuid

from decorators import drop_datasets
import pytest
from starlette.applications import Starlette
from starlette.routing import Route
from starlette.testclient import TestClient

import fiftyone as fo
import fiftyone.core.media_assets as foma
import fiftyone.multimodal.media as fomm
from fiftyone.multimodal.media import (
    InvalidMediaLocationError,
    LeRobotEpisode,
    MalformedMediaSourceError,
    MissingMediaRootError,
    MovedMediaRootError,
    StaleMediaReferenceError,
    UnfinalizedMediaSourceError,
    UnsupportedLeRobotExportModeError,
    UnsupportedLeRobotVersionError,
    UnsupportedMediaReferenceOperation,
)
from fiftyone.server import utils as fosu
from fiftyone.server.routes.groups import _filter_dict_by_fields
from fiftyone.server.routes.media_reference import MediaReferenceRoutes
from fiftyone.server.routes.sample import SampleRoutes, generate_sample_etag
from fiftyone.server.samples import _create_sample_item
import fiftyone.types as fot
import fiftyone.utils.data as foud
import fiftyone.utils.data.importers as foudi
import fiftyone.utils.lerobot as foul
from fiftyone.utils.lerobot import (
    LeRobotDatasetImporter,
    _LeRobotMediaResolver,
    bind_lerobot_source,
    relocate_lerobot_source,
    unbind_lerobot_source,
)
import fiftyone.utils.lerobot_export as foule

pa = pytest.importorskip("pyarrow")
papq = pytest.importorskip("pyarrow.parquet")

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
    def test_resolution_cache_key_includes_complete_reference(self):
        with tempfile.TemporaryDirectory() as root:
            _write_v3_source(root)
            reference = _import(root).first().media_reference
            self.addCleanup(unbind_lerobot_source, reference.source_identity)

        replacement = replace(reference, codebase_version="v3.3")

        self.assertEqual(reference.key, replacement.key)
        self.assertNotEqual(
            foul._resolution_cache_key(reference, reference.describe_assets()),
            foul._resolution_cache_key(
                replacement, replacement.describe_assets()
            ),
        )

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
            ), self.assertRaises(UnsupportedLeRobotVersionError):
                _import(root, name="source-format-before-reference")

            self.assertTrue(
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
            self.assertNotIn("source_identity", dataset.info["lerobot"])
            self.assertNotIn("source_fingerprint", dataset.info["lerobot"])
            self.assertNotIn(
                "source_binding_required", dataset.info["lerobot"]
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
                for relative_path in (
                    locator.data_location.path,
                    locator.videos[0].location.path,
                ):
                    path = os.path.join(relocated_root, relative_path)
                    stat_result = os.stat(path)
                    os.utime(
                        path,
                        ns=(
                            stat_result.st_atime_ns,
                            stat_result.st_mtime_ns + 1_000_000_000,
                        ),
                    )

                relocate_lerobot_source(
                    references[7].source_identity,
                    relocated_root,
                )
                manifest = _LeRobotMediaResolver().resolve_assets(
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
                _LeRobotMediaResolver().resolve_assets(
                    first, first.describe_assets()
                )

    @drop_datasets
    def test_version_and_structure_rejection(self):
        cases = [
            ("v2.1", UnsupportedLeRobotVersionError),
            ("v4.0", UnsupportedLeRobotVersionError),
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
                self.assertTrue(fo.dataset_exists(name))

        with tempfile.TemporaryDirectory() as root:
            name = "missing-info"
            with self.assertRaises(MalformedMediaSourceError):
                _import(root, name=name)
            self.assertTrue(fo.dataset_exists(name))

        with tempfile.TemporaryDirectory() as root:
            info_path = os.path.join(root, "meta", "info.json")
            os.makedirs(os.path.dirname(info_path), exist_ok=True)
            with open(info_path, "w") as file:
                file.write("{malformed")
            name = "malformed-info"
            with self.assertRaises(MalformedMediaSourceError):
                _import(root, name=name)
            self.assertTrue(fo.dataset_exists(name))

    def test_path_templates_reject_field_traversal(self):
        templates = (
            "data/{chunk_index.__class__}/file.parquet",
            "data/{chunk_index:100000000d}/file.parquet",
            "data/{chunk_index:>16}/file.parquet",
            "data/" + "x" * 4096,
        )
        for template in templates:
            with self.subTest(template=template), self.assertRaisesRegex(
                MalformedMediaSourceError,
                "Invalid LeRobot source path template",
            ):
                foul._format_source_path(template, chunk_index=0)

        with self.assertRaisesRegex(
            MalformedMediaSourceError, "produced an invalid path"
        ):
            foul._format_source_path("{video_key}", video_key="x" * 4097)

    def test_info_features_and_video_timestamps_are_typed(self):
        info = {
            "codebase_version": "v3.2",
            "data_path": "data/{file_index:03d}.parquet",
            "features": {"observation": 1},
            "fps": 10,
            "total_episodes": 1,
            "video_path": "videos/{file_index:03d}.mp4",
        }
        with self.assertRaisesRegex(
            MalformedMediaSourceError, "features must contain objects"
        ):
            foul._validate_v3_info(info)

        with tempfile.TemporaryDirectory() as root:
            _write_v3_source(root, episodes=2)
            episodes_path = os.path.join(
                root, "meta", "episodes", "part-000.parquet"
            )
            rows = papq.read_table(episodes_path).to_pylist()
            rows[0]["videos/%s/from_timestamp" % _VIDEO_FEATURE] = "invalid"
            _write_parquet(episodes_path, rows)
            with self.assertRaisesRegex(
                MalformedMediaSourceError, "invalid video timestamp bounds"
            ):
                _import(root)

    def test_source_paths_remain_posix_across_platforms(self):
        self.assertEqual(
            foul._format_source_path(
                "data/chunk-{chunk_index:03d}/file-{file_index:03d}.parquet",
                chunk_index=1,
                file_index=2,
            ),
            "data/chunk-001/file-002.parquet",
        )
        with mock.patch.object(
            foul.os.path,
            "relpath",
            return_value=r"meta\episodes\part-000.parquet",
        ), mock.patch.object(foul.os, "sep", "\\"):
            self.assertEqual(
                foul._get_dataset_relative_path("unused", "unused"),
                "meta/episodes/part-000.parquet",
            )

        with self.assertRaisesRegex(
            MalformedMediaSourceError, "non-canonical path"
        ):
            foul._format_source_path(
                r"data\chunk-{chunk_index:03d}\file.parquet",
                chunk_index=0,
            )

    @drop_datasets
    def test_import_and_resolution_close_parquet_files(self):
        real_parquet_file = papq.ParquetFile
        opened = []

        class _TrackedParquetFile:
            def __init__(self, *args, **kwargs):
                self._inner = real_parquet_file(*args, **kwargs)
                self.closed = False
                opened.append(self)

            def __getattr__(self, name):
                return getattr(self._inner, name)

            def __enter__(self):
                return self

            def __exit__(self, *args):
                self.close()

            def close(self):
                self._inner.close()
                self.closed = True

        with tempfile.TemporaryDirectory() as temp_dir, mock.patch.object(
            papq, "ParquetFile", _TrackedParquetFile
        ):
            source_root = os.path.join(temp_dir, "source")
            export_root = os.path.join(temp_dir, "export")
            _write_v3_source(source_root, episodes=2)
            dataset = _import(source_root)
            self.addCleanup(
                unbind_lerobot_source,
                dataset.first().media_reference.source_identity,
            )
            reference = dataset.first().media_reference
            _LeRobotMediaResolver().resolve_assets(
                reference, reference.describe_assets()
            )
            dataset.export(
                export_dir=export_root,
                dataset_type=fot.LeRobotDataset,
                export_media=True,
            )

        self.assertTrue(opened)
        self.assertTrue(all(parquet_file.closed for parquet_file in opened))

    @drop_datasets
    def test_selected_import_does_not_hash_unrelated_large_assets(self):
        with tempfile.TemporaryDirectory() as root:
            selected_video_path = _write_v3_source(root, episodes=2)
            unrelated_video_path = os.path.join(
                root,
                "videos",
                "chunk-000",
                _VIDEO_FEATURE,
                "file-006.mp4",
            )
            shutil.copy2(selected_video_path, unrelated_video_path)

            metadata_path = os.path.join(
                root, "meta", "episodes", "part-001.parquet"
            )
            with papq.ParquetFile(metadata_path) as parquet_file:
                rows = parquet_file.read().to_pylist()
            rows[0]["videos/%s/file_index" % _VIDEO_FEATURE] = 6
            _write_parquet(metadata_path, rows)

            with mock.patch.object(
                foul, "_sha256_file", wraps=foul._sha256_file
            ) as fingerprint:
                dataset = _import(root, episodes=[0])

            self.assertEqual(dataset.values("episode_index"), [0])
            hashed_paths = {
                os.path.realpath(call.args[0])
                for call in fingerprint.call_args_list
            }
            self.assertIn(os.path.realpath(selected_video_path), hashed_paths)
            self.assertNotIn(
                os.path.realpath(unrelated_video_path), hashed_paths
            )

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
            self.assertTrue(fo.dataset_exists(name))

    @drop_datasets
    def test_typed_missing_and_moved_binding_errors(self):
        with tempfile.TemporaryDirectory() as root:
            _write_v3_source(root)
            dataset = _import(root, max_samples=1)
            reference = dataset.first().media_reference
            resolver = _LeRobotMediaResolver()

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
print(any(asset['role'] == 'video-stream' for asset in response.json()['assets']))
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
            self.assertEqual(output.strip().splitlines()[-2:], ["200", "True"])

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
                    relocated_output.strip().splitlines()[-2:],
                    ["200", "True"],
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
    @drop_datasets
    def test_export_materializes_each_selected_data_table_once(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            source_root = os.path.join(temp_dir, "source")
            export_root = os.path.join(temp_dir, "export")
            _write_v3_source(source_root, episodes=4)
            dataset = _import(source_root)
            self.addCleanup(
                unbind_lerobot_source,
                dataset.first().media_reference.source_identity,
            )

            with mock.patch.object(
                foule, "_open_parquet", wraps=foule._open_parquet
            ) as open_parquet:
                dataset.export(
                    export_dir=export_root,
                    dataset_type=fot.LeRobotDataset,
                    export_media=True,
                )

            data_reads = [
                call
                for call in open_parquet.call_args_list
                if call.args[1] == "episode data"
            ]
            self.assertEqual(len(data_reads), 1)

    def test_official_reader_validation_reports_stderr(self):
        error = subprocess.CalledProcessError(
            1,
            [sys.executable, "-c", "validation"],
            stderr="invalid episode coordinates",
        )
        with mock.patch.object(
            foule.importlib.util,
            "find_spec",
            return_value=object(),
        ), mock.patch.object(
            foule.subprocess,
            "run",
            side_effect=error,
        ), self.assertRaisesRegex(
            MalformedMediaSourceError,
            "invalid episode coordinates",
        ):
            foule._validate_with_official_lerobot("/unused", 1)

    @unittest.skipUnless(
        importlib.util.find_spec("lerobot") is not None,
        "official LeRobot reader is not installed",
    )
    @drop_datasets
    def test_official_reader_opens_exported_coordinates(self):
        from lerobot.datasets.lerobot_dataset import (  # pylint: disable=import-error
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
            manifest = _LeRobotMediaResolver().resolve_assets(
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
            if os.name == "posix":
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
    def test_export_modes_and_partial_failures(self):
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

            failed_destination = os.path.join(temp_dir, "failed")
            failed_marker = os.path.join(failed_destination, "partial.txt")

            def write_then_fail(export_dir, specs):
                os.makedirs(export_dir, exist_ok=True)
                with open(failed_marker, "w") as file:
                    file.write("partial export")
                raise RuntimeError("export failed")

            with mock.patch.object(
                foule,
                "_write_lerobot_export",
                side_effect=write_then_fail,
            ), self.assertRaisesRegex(RuntimeError, "export failed"):
                dataset.export(
                    export_dir=failed_destination,
                    dataset_type=fot.LeRobotDataset,
                )

            with open(failed_marker) as file:
                self.assertEqual(file.read(), "partial export")

            obsolete_path = os.path.join(valid_destination, "obsolete")
            with open(obsolete_path, "w") as file:
                file.write("old export")
            dataset.export(
                export_dir=valid_destination,
                dataset_type=fot.LeRobotDataset,
                overwrite=True,
            )
            self.assertFalse(os.path.exists(obsolete_path))
            modes = (
                (False, "thin-reference-native-only"),
                (0, "unsupported-export-mode"),
                ("move", "shared-source-move-unsupported"),
                ("symlink", "self-contained-export-required"),
                ("manifest", "manifest-native-only"),
            )
            for index, (mode, reason) in enumerate(modes):
                destination = os.path.join(temp_dir, "mode-%d" % index)
                with self.subTest(mode=mode), self.assertRaises(
                    ValueError
                ) as context:
                    dataset.export(
                        export_dir=destination,
                        dataset_type=fot.LeRobotDataset,
                        export_media=mode,
                    )
                error = context.exception.__cause__
                self.assertIsInstance(error, UnsupportedLeRobotExportModeError)
                self.assertEqual(error.export_media, mode)
                self.assertEqual(error.reason, reason)
                self.assertFalse(os.path.exists(destination))

            first, second = [sample.media_reference for sample in dataset]
            mixed = fo.Dataset()
            mixed.add_samples(
                [
                    fo.Sample(media_reference=first),
                    fo.Sample(
                        media_reference=LeRobotEpisode(
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
            self.assertFalse(os.path.exists(info_path))

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


class MediaAssetLifecycleTests(unittest.TestCase):
    @drop_datasets
    def test_native_materialized_import_validates_every_asset_before_mutation(
        self,
    ):
        with tempfile.TemporaryDirectory() as temp_dir:
            source_root = os.path.join(temp_dir, "source")
            materialized_root = os.path.join(temp_dir, "materialized")
            _write_v3_source(source_root, episodes=2)
            dataset = _import(source_root)
            dataset.export(
                export_dir=materialized_root,
                dataset_type=fot.FiftyOneDataset,
                export_media=True,
            )

            missing_root = os.path.join(temp_dir, "missing")
            shutil.copytree(materialized_root, missing_root)
            missing_asset = next(
                os.path.join(root, filename)
                for root, _, filenames in os.walk(
                    os.path.join(missing_root, "media_sources")
                )
                for filename in filenames
            )
            os.remove(missing_asset)
            missing_name = "native-materialized-missing-asset"
            with self.assertRaisesRegex(ValueError, "asset.*missing"):
                fo.Dataset.from_dir(
                    dataset_dir=missing_root,
                    dataset_type=fot.FiftyOneDataset,
                    name=missing_name,
                )
            self.assertTrue(fo.dataset_exists(missing_name))

            stale_root = os.path.join(temp_dir, "stale")
            shutil.copytree(materialized_root, stale_root)
            stale_asset = next(
                os.path.join(root, filename)
                for root, _, filenames in os.walk(
                    os.path.join(stale_root, "media_sources")
                )
                for filename in filenames
                if filename.endswith(".mp4")
            )
            with open(stale_asset, "ab") as file:
                file.write(b"stale")

            stale_name = "native-materialized-stale-asset"
            with self.assertRaises(StaleMediaReferenceError):
                fo.Dataset.from_dir(
                    dataset_dir=stale_root,
                    dataset_type=fot.FiftyOneDataset,
                    name=stale_name,
                )
            self.assertTrue(fo.dataset_exists(stale_name))

            if os.name == "posix":
                escaping_root = os.path.join(temp_dir, "escaping")
                shutil.copytree(materialized_root, escaping_root)
                escaping_asset = next(
                    os.path.join(root, filename)
                    for root, _, filenames in os.walk(
                        os.path.join(escaping_root, "media_sources")
                    )
                    for filename in filenames
                )
                outside_asset = os.path.join(temp_dir, "outside-asset")
                shutil.copy2(escaping_asset, outside_asset)
                os.remove(escaping_asset)
                os.symlink(outside_asset, escaping_asset)
                escaping_name = "native-materialized-escaping-asset"
                with self.assertRaises(InvalidMediaLocationError):
                    fo.Dataset.from_dir(
                        dataset_dir=escaping_root,
                        dataset_type=fot.FiftyOneDataset,
                        name=escaping_name,
                    )
                self.assertTrue(fo.dataset_exists(escaping_name))

    @drop_datasets
    def test_native_reference_planning_scales_with_unique_resources(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            source_root = os.path.join(temp_dir, "source")
            output_root = os.path.join(temp_dir, "native")
            _write_v3_source(source_root, episodes=4)
            dataset = _import(source_root)

            references = {
                episode_index: dataset.match({"episode_index": episode_index})
                .first()
                .media_reference
                for episode_index in (1, 3)
            }
            dataset.add_samples(
                [
                    fo.Sample(
                        media_reference=references[episode_index],
                        episode_index=episode_index,
                    )
                    for episode_index in (1, 3, 1, 3, 1, 3)
                ]
            )
            selected = dataset.match({"episode_index": {"$in": [1, 3]}})
            occurrence_count = len(selected)
            reference_count = len(set(selected.values("media_reference.key")))
            self.assertEqual((occurrence_count, reference_count), (8, 2))

            materialized_calls = []
            export_reference_asset = foud.MediaExporter.export_reference_asset
            describe_assets = LeRobotEpisode.describe_assets
            describe_calls = []

            def track_description(reference):
                describe_calls.append(reference.key)
                return describe_assets(reference)

            def track_materialization(media_exporter, asset, destination):
                materialized_calls.append(asset.key)
                return export_reference_asset(
                    media_exporter, asset, destination
                )

            reference_plans = []
            finalize_reference_export = (
                foud.MediaExporter._finalize_reference_export
            )

            def track_finalization(media_exporter, *args, **kwargs):
                finalize_reference_export(media_exporter, *args, **kwargs)
                reference_plans.append(media_exporter._reference_asset_plan)

            exporter = foud.FiftyOneDatasetExporter(
                output_root, export_media=True
            )
            with mock.patch.object(
                foud.MediaExporter,
                "_finalize_reference_export",
                new=track_finalization,
            ), mock.patch.object(
                foudi.foo,
                "count_documents",
                side_effect=AssertionError(
                    "reference exports must not run an exact-count pre-scan"
                ),
            ), mock.patch.object(
                foma,
                "_export_media_reference_bindings",
                wraps=foma._export_media_reference_bindings,
            ) as binding_lookup, mock.patch.object(
                foma,
                "_hydrate_media_reference_binding",
                wraps=foma._hydrate_media_reference_binding,
            ) as hydrate, mock.patch.object(
                foma,
                "_plan_reference_assets",
                wraps=foma._plan_reference_assets,
            ) as describe, mock.patch.object(
                LeRobotEpisode,
                "describe_assets",
                new=track_description,
            ), mock.patch.object(
                foul,
                "_get_source_binding",
                wraps=foul._get_source_binding,
            ) as source_binding_read, mock.patch.object(
                foud.MediaExporter,
                "export_reference_asset",
                new=track_materialization,
            ):
                selected.export(dataset_exporter=exporter)

            binding_lookup.assert_called_once()
            self.assertEqual(hydrate.call_count, reference_count)
            self.assertEqual(describe.call_count, reference_count)
            self.assertEqual(len(describe_calls), reference_count)
            self.assertEqual(source_binding_read.call_count, 1)
            self.assertEqual(len(reference_plans), 1)
            plan = reference_plans[0]
            self.assertEqual(
                len(plan.occurrences),
                occurrence_count,
            )
            self.assertEqual(len(plan.bindings), reference_count)
            self.assertEqual(
                len(materialized_calls),
                len(plan.assets),
            )
            self.assertEqual(
                len(materialized_calls), len(set(materialized_calls))
            )
            usages_by_asset = {}
            for usage in plan.usages:
                usages_by_asset.setdefault(usage.asset_key, 0)
                usages_by_asset[usage.asset_key] += 1

            self.assertLessEqual(
                max(usages_by_asset.values()), reference_count
            )

            import_collection = foudi.foo.import_collection
            with mock.patch.object(
                foudi.foo,
                "import_collection",
                wraps=import_collection,
            ) as input_reads, mock.patch.object(
                foma,
                "_build_reference_asset_plan",
                side_effect=AssertionError(
                    "native import must not scan inserted samples"
                ),
            ), mock.patch.object(
                fomm,
                "_import_media_reference_bindings",
                wraps=fomm._import_media_reference_bindings,
            ) as binding_import, mock.patch.object(
                foma,
                "_hydrate_media_reference_binding",
                wraps=foma._hydrate_media_reference_binding,
            ) as import_hydrate:
                imported = fo.Dataset.from_dir(
                    dataset_dir=output_root,
                    dataset_type=fot.FiftyOneDataset,
                )

            sample_reads = [
                call
                for call in input_reads.call_args_list
                if call.args
                and os.path.basename(call.args[0])
                in ("samples", "samples.json")
            ]
            self.assertEqual(len(sample_reads), 2)
            self.assertTrue(
                all(call.kwargs.get("stream") is True for call in sample_reads)
            )
            binding_import.assert_called_once()
            self.assertEqual(import_hydrate.call_count, reference_count)
            self.assertEqual(len(imported), occurrence_count)
            self.assertEqual(
                imported.count_values("media_reference.key"),
                selected.count_values("media_reference.key"),
            )

    @drop_datasets
    def test_collection_media_paths_use_one_deduplicated_reference_plan(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            source_root = os.path.join(temp_dir, "source")
            _write_v3_source(source_root, episodes=4)
            dataset = _import(source_root)

            references = {
                episode_index: dataset.match({"episode_index": episode_index})
                .first()
                .media_reference
                for episode_index in (1, 3)
            }
            dataset.add_samples(
                [
                    fo.Sample(
                        media_reference=references[episode_index],
                        episode_index=episode_index,
                    )
                    for episode_index in (1, 3, 1, 3, 1, 3)
                ]
            )
            selected = dataset.match({"episode_index": {"$in": [1, 3]}})
            occurrence_count = len(selected)
            reference_count = len(set(selected.values("media_reference.key")))

            describe_assets = LeRobotEpisode.describe_assets
            describe_calls = []

            def track_description(reference):
                describe_calls.append(reference.key)
                return describe_assets(reference)

            with mock.patch.object(
                foma,
                "_build_reference_asset_plan",
                wraps=foma._build_reference_asset_plan,
            ) as build_plan, mock.patch.object(
                foma,
                "_export_media_reference_bindings",
                wraps=foma._export_media_reference_bindings,
            ) as binding_lookup, mock.patch.object(
                foma,
                "_hydrate_media_reference_binding",
                wraps=foma._hydrate_media_reference_binding,
            ) as hydrate, mock.patch.object(
                LeRobotEpisode,
                "describe_assets",
                new=track_description,
            ), mock.patch.object(
                foul,
                "_get_source_binding",
                wraps=foul._get_source_binding,
            ) as source_binding_read:
                paths = selected._get_media_paths()

            build_plan.assert_called_once_with(selected, resolve=True)
            binding_lookup.assert_called_once()
            self.assertEqual(hydrate.call_count, reference_count)
            self.assertEqual(len(describe_calls), reference_count)
            self.assertEqual(source_binding_read.call_count, 1)
            self.assertEqual(len(paths), len(set(paths)))
            self.assertTrue(all(os.path.isfile(path) for path in paths))

            nested_paths = selected._get_media_paths(flat=False)
            self.assertEqual(len(nested_paths), occurrence_count)
            self.assertTrue(all(paths for paths in nested_paths))

            with mock.patch.object(
                foma,
                "_build_reference_asset_plan",
                side_effect=AssertionError(
                    "include_assets=False must not build a reference plan"
                ),
            ):
                self.assertEqual(
                    selected._get_media_paths(include_assets=False), []
                )
                self.assertEqual(
                    selected._get_media_paths(
                        include_assets=False, flat=False
                    ),
                    [[] for _ in range(occurrence_count)],
                )

            filepath_dataset = fo.Dataset()
            filepath_dataset.add_samples(
                [
                    fo.Sample(filepath="/tmp/one.png"),
                    fo.Sample(filepath="/tmp/one.png"),
                    fo.Sample(filepath="/tmp/two.png"),
                ]
            )
            with mock.patch.object(
                foma,
                "_build_reference_asset_plan",
                side_effect=AssertionError(
                    "filepath mode must not build a reference plan"
                ),
            ):
                self.assertEqual(
                    filepath_dataset._get_media_paths(),
                    [
                        os.path.abspath("/tmp/one.png"),
                        os.path.abspath("/tmp/one.png"),
                        os.path.abspath("/tmp/two.png"),
                    ],
                )

    @drop_datasets
    def test_selected_view_native_materialization_deduplicates_assets(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            source_root = os.path.join(temp_dir, "source")
            output_root = os.path.join(temp_dir, "native")
            _write_v3_source(source_root, episodes=4)
            dataset = _import(source_root)
            selected = dataset.match({"episode_index": {"$in": [1, 3]}})

            self.assertEqual(
                selected.first().get_media_key(),
                selected.first().media_reference.key,
            )
            selected.export(
                export_dir=output_root,
                dataset_type=fot.FiftyOneDataset,
                export_media=True,
            )
            materialized_videos = [
                os.path.join(root, filename)
                for root, _, filenames in os.walk(output_root)
                for filename in filenames
                if filename.endswith(".mp4")
            ]
            self.assertEqual(len(materialized_videos), 1)

            manifest_path = os.path.join(output_root, "media_sources.json")
            with open(manifest_path) as file:
                manifest = json.load(file)

            self.assertEqual(set(manifest), {"version", "sources"})
            self.assertEqual(len(manifest["sources"]), 1)
            self.assertEqual(manifest["sources"][0]["binding_required"], False)
            self.assertNotIn(source_root, json.dumps(manifest))

            with open(
                os.path.join(output_root, "media_reference_bindings.json")
            ) as file:
                reference_bindings = json.load(file)["bindings"]

            self.assertEqual(len(reference_bindings), 2)
            self.assertEqual(
                {binding["_id"] for binding in reference_bindings},
                set(selected.values("media_reference.key")),
            )

            imported = fo.Dataset.from_dir(
                dataset_dir=output_root,
                dataset_type=fot.FiftyOneDataset,
            )
            self.assertEqual(sorted(imported.values("episode_index")), [1, 3])
            self.assertNotIn("media_reference_sources", imported.info)
            source = manifest["sources"][0]
            bundle_source_root = os.path.realpath(
                os.path.join(output_root, source["relative_root"])
            )
            source_binding = foul._get_source_binding(
                source["source_identity"]
            )
            self.assertEqual(source_binding.root, bundle_source_root)

    @drop_datasets
    def test_materialized_source_rebind_rolls_back_on_failure(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            source_root = os.path.join(temp_dir, "source")
            rebound_root = os.path.join(temp_dir, "rebound")
            _write_v3_source(source_root, episodes=2)
            shutil.copytree(source_root, rebound_root)
            dataset = _import(source_root)
            reference = dataset.first().media_reference
            materializer = foul._LeRobotAssetMaterializer()
            source = materializer.describe_source(reference)
            original = foul._get_source_binding(source.source_identity)

            with self.assertRaisesRegex(RuntimeError, "later binding failed"):
                with materializer.source_binding_context(source, rebound_root):
                    rebound = foul._get_source_binding(source.source_identity)
                    self.assertEqual(
                        rebound.root, os.path.realpath(rebound_root)
                    )
                    raise RuntimeError("later binding failed")

            restored = foul._get_source_binding(source.source_identity)
            self.assertEqual(restored, original)

    @drop_datasets
    def test_native_thin_materialized_and_unsupported_modes(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            source_root = os.path.join(temp_dir, "source")
            thin_root = os.path.join(temp_dir, "thin")
            materialized_root = os.path.join(temp_dir, "materialized")
            _write_v3_source(source_root, episodes=3)
            dataset = _import(source_root, episodes=[0, 2])
            reference = dataset.first().media_reference
            self.addCleanup(unbind_lerobot_source, reference.source_identity)

            dataset.export(
                export_dir=thin_root,
                dataset_type=fot.FiftyOneDataset,
                export_media=False,
            )
            with open(os.path.join(thin_root, "media_sources.json")) as file:
                thin_manifest = json.load(file)

            self.assertEqual(set(thin_manifest), {"version", "sources"})
            self.assertTrue(
                all(
                    source["binding_required"]
                    and source["relative_root"] is None
                    for source in thin_manifest["sources"]
                )
            )
            for filename in (
                "metadata.json",
                "samples.json",
                "media_sources.json",
                "media_reference_bindings.json",
            ):
                with open(os.path.join(thin_root, filename)) as file:
                    self.assertNotIn(source_root, file.read())

            for index, (filename, message) in enumerate(
                (
                    ("media_sources.json", "media-source manifest"),
                    (
                        "media_reference_bindings.json",
                        "private reference bindings",
                    ),
                )
            ):
                incomplete_root = os.path.join(
                    temp_dir, "incomplete-%d" % index
                )
                shutil.copytree(thin_root, incomplete_root)
                os.remove(os.path.join(incomplete_root, filename))
                incomplete_name = "incomplete-native-reference-%d" % index
                with self.assertRaisesRegex(ValueError, message):
                    fo.Dataset.from_dir(
                        dataset_dir=incomplete_root,
                        dataset_type=fot.FiftyOneDataset,
                        name=incomplete_name,
                    )
                self.assertTrue(fo.dataset_exists(incomplete_name))

            unbind_lerobot_source(reference.source_identity)
            thin_import = fo.Dataset.from_dir(
                dataset_dir=thin_root,
                dataset_type=fot.FiftyOneDataset,
            )
            self.assertNotIn("media_reference_sources", thin_import.info)
            missing_binding_root = os.path.join(temp_dir, "missing-binding")
            with self.assertRaises(MissingMediaRootError):
                thin_import.export(
                    export_dir=missing_binding_root,
                    dataset_type=fot.FiftyOneDataset,
                    export_media=True,
                )
            self.assertTrue(os.path.isdir(missing_binding_root))

            source = thin_manifest["sources"][0]
            bind_lerobot_source(
                source["source_identity"],
                source_root,
                source["source_fingerprint"],
            )
            rebound_root = os.path.join(temp_dir, "rebound")
            thin_import.export(
                export_dir=rebound_root,
                dataset_type=fot.FiftyOneDataset,
                export_media=True,
            )
            self.assertTrue(os.path.isdir(rebound_root))

            dataset.export(
                export_dir=materialized_root,
                dataset_type=fot.FiftyOneDataset,
                export_media=True,
            )
            unbind_lerobot_source(reference.source_identity)
            materialized_import = fo.Dataset.from_dir(
                dataset_dir=materialized_root,
                dataset_type=fot.FiftyOneDataset,
            )
            self.assertNotIn(
                "media_reference_sources", materialized_import.info
            )
            index = materialized_import.get_index_information()[
                "media_reference.key"
            ]
            self.assertFalse(index.get("unique", False))
            self.assertTrue(index["sparse"])

            roundtrip_root = os.path.join(temp_dir, "roundtrip")
            materialized_import.export(
                export_dir=roundtrip_root,
                dataset_type=fot.LeRobotDataset,
            )
            roundtrip = fo.Dataset.from_dir(
                dataset_dir=roundtrip_root,
                dataset_type=fot.LeRobotDataset,
            )
            self.assertEqual(sorted(roundtrip.values("episode_index")), [0, 1])

            for mode_index, mode in enumerate(("move", "symlink", "manifest")):
                destination = os.path.join(
                    temp_dir, "unsupported-%d" % mode_index
                )
                with self.subTest(mode=mode), self.assertRaises(ValueError):
                    dataset.export(
                        export_dir=destination,
                        dataset_type=fot.FiftyOneDataset,
                        export_media=mode,
                    )
                self.assertEqual(
                    os.path.isdir(destination), mode in ("move", "symlink")
                )

            tampered_root = os.path.join(temp_dir, "tampered")
            shutil.copytree(thin_root, tampered_root)
            tampered_manifest_path = os.path.join(
                tampered_root, "media_sources.json"
            )
            with open(tampered_manifest_path) as file:
                tampered_manifest = json.load(file)
            tampered_manifest["sources"][0][
                "source_identity"
            ] = "unrelated:source"
            with open(tampered_manifest_path, "w") as file:
                json.dump(tampered_manifest, file)

            tampered_name = "tampered-media-asset-manifest"
            with self.assertRaisesRegex(
                ValueError, "does not match the imported samples"
            ):
                fo.Dataset.from_dir(
                    dataset_dir=tampered_root,
                    dataset_type=fot.FiftyOneDataset,
                    name=tampered_name,
                )
            self.assertTrue(fo.dataset_exists(tampered_name))

            stripped_root = os.path.join(temp_dir, "stripped")
            shutil.copytree(thin_root, stripped_root)
            stripped_manifest_path = os.path.join(
                stripped_root, "media_sources.json"
            )
            with open(stripped_manifest_path) as file:
                stripped_manifest = json.load(file)
            stripped_manifest["sources"] = []
            with open(stripped_manifest_path, "w") as file:
                json.dump(stripped_manifest, file)

            stripped_name = "stripped-media-source-manifest"
            with self.assertRaisesRegex(
                ValueError, "does not match the imported samples"
            ):
                fo.Dataset.from_dir(
                    dataset_dir=stripped_root,
                    dataset_type=fot.FiftyOneDataset,
                    name=stripped_name,
                )
            self.assertTrue(fo.dataset_exists(stripped_name))

            unbind_lerobot_source(reference.source_identity)

    @drop_datasets
    def test_native_exports_bind_in_a_fresh_process(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            source_root = os.path.join(temp_dir, "source")
            thin_root = os.path.join(temp_dir, "thin")
            materialized_root = os.path.join(temp_dir, "materialized")
            relocated_root = os.path.join(temp_dir, "relocated")
            _write_v3_source(source_root, episodes=3)
            dataset = _import(source_root, episodes=[0, 2])
            duplicate_reference = dataset.first().media_reference
            source_identity = duplicate_reference.source_identity
            self.addCleanup(unbind_lerobot_source, source_identity)
            dataset.add_sample(
                fo.Sample(media_reference=duplicate_reference, episode_index=0)
            )
            dataset.export(
                export_dir=thin_root,
                dataset_type=fot.FiftyOneDataset,
                export_media=False,
            )
            dataset.export(
                export_dir=materialized_root,
                dataset_type=fot.FiftyOneDataset,
                export_media=True,
            )
            unbind_lerobot_source(source_identity)
            shutil.copytree(materialized_root, relocated_root)

            script = r"""
import json
import os
import sys
import tempfile

import fiftyone as fo
import fiftyone.core.media_assets as foma
import fiftyone.types as fot
from fiftyone.multimodal.media import MissingMediaRootError
import fiftyone.utils.lerobot as foul
from fiftyone.utils.lerobot import bind_lerobot_source, unbind_lerobot_source

thin_root, materialized_root, source_root = sys.argv[1:]
created = []
try:
    thin = fo.Dataset.from_dir(
        dataset_dir=thin_root,
        dataset_type=fot.FiftyOneDataset,
    )
    created.append(thin)
    assert "media_reference_sources" not in thin.info
    with open(os.path.join(thin_root, "media_sources.json")) as file:
        source = json.load(file)["sources"][0]
    with tempfile.TemporaryDirectory() as scratch:
        missing_root = os.path.join(scratch, "missing")
        try:
            thin.export(
                export_dir=missing_root,
                dataset_type=fot.FiftyOneDataset,
                export_media=True,
            )
        except MissingMediaRootError:
            missing_binding = True
        else:
            missing_binding = False
        assert missing_binding
        assert os.path.isdir(missing_root)
    bind_lerobot_source(
        source["source_identity"],
        source_root,
        source["source_fingerprint"],
    )
    with tempfile.TemporaryDirectory() as scratch:
        rebound_root = os.path.join(scratch, "rebound")
        thin.export(
            export_dir=rebound_root,
            dataset_type=fot.FiftyOneDataset,
            export_media=True,
        )
        assert os.path.isfile(os.path.join(rebound_root, "media_sources.json"))
    unbind_lerobot_source(source["source_identity"])
    os.rename(source_root, source_root + "-unavailable")

    materialized = fo.Dataset.from_dir(
        dataset_dir=materialized_root,
        dataset_type=fot.FiftyOneDataset,
    )
    created.append(materialized)
    assert "media_reference_sources" not in materialized.info
    plan = foma._build_reference_asset_plan(materialized, resolve=True)
    assert plan.assets
    assert all(os.path.isfile(asset.path) for asset in plan.assets)
    binding = foul._get_source_binding(source["source_identity"])
    bundle_root = os.path.realpath(materialized_root)
    assert os.path.commonpath((bundle_root, binding.root)) == bundle_root
    with tempfile.TemporaryDirectory() as scratch:
        copied_root = os.path.join(scratch, "copied")
        materialized.export(
            export_dir=copied_root,
            dataset_type=fot.FiftyOneDataset,
            export_media=True,
        )
        assert os.path.isfile(os.path.join(copied_root, "media_sources.json"))
    index = materialized.get_index_information()["media_reference.key"]
    assert not index.get("unique", False) and index["sparse"]
    print(json.dumps({
        "thin_missing_binding": missing_binding,
        "thin_rebound": True,
        "materialized_bound": True,
        "asset_count": len(plan.assets),
        "sample_count": len(materialized),
    }))
finally:
    for dataset in reversed(created):
        dataset.delete()
"""
            result = subprocess.run(
                [
                    sys.executable,
                    "-c",
                    script,
                    thin_root,
                    relocated_root,
                    source_root,
                ],
                check=False,
                capture_output=True,
                text=True,
                timeout=120,
                env={
                    **os.environ,
                    "FIFTYONE_DATABASE_NAME": (
                        "codex_lerobot_native_fresh_" + uuid.uuid4().hex
                    ),
                },
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            outcome = json.loads(result.stdout.strip().splitlines()[-1])
            self.assertEqual(
                outcome,
                {
                    "thin_missing_binding": True,
                    "thin_rebound": True,
                    "materialized_bound": True,
                    "asset_count": outcome["asset_count"],
                    "sample_count": 3,
                },
            )
            self.assertGreater(outcome["asset_count"], 1)
            unbind_lerobot_source(source_identity)

    @drop_datasets
    def test_native_materialization_failure_leaves_partial_export(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            source_root = os.path.join(temp_dir, "source")
            export_root = os.path.join(temp_dir, "export")
            _write_v3_source(source_root, episodes=2)
            dataset = _import(source_root)

            with mock.patch.object(
                foud.MediaExporter,
                "export_reference_asset",
                side_effect=RuntimeError("materializer failed"),
            ):
                with self.assertRaisesRegex(
                    RuntimeError, "materializer failed"
                ):
                    dataset.export(
                        export_dir=export_root,
                        dataset_type=fot.FiftyOneDataset,
                        export_media=True,
                    )

            self.assertTrue(os.path.isdir(export_root))
            self.assertTrue(
                os.path.isfile(os.path.join(export_root, "samples.json"))
            )
            self.assertTrue(
                os.path.isfile(
                    os.path.join(export_root, "media_reference_bindings.json")
                )
            )


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
                    "fiftyone.server.routes.media_reference._open_asset",
                    side_effect=error,
                ):
                    response = client.get(video_url)
                    self.assertEqual(response.status_code, status)
                    self.assertEqual(
                        response.headers["X-FiftyOne-Error-Kind"], kind
                    )
                    self.assertNotIn(root, response.text)

            with mock.patch(
                "fiftyone.server.routes.media_reference._open_asset",
                side_effect=FileNotFoundError(),
            ):
                response = client.get(video_url)
            self.assertEqual(response.status_code, 404)
            self.assertEqual(
                response.headers["X-FiftyOne-Error-Kind"],
                "missing-media-asset",
            )

            with mock.patch(
                "fiftyone.server.routes.media_reference._open_asset",
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
    def test_asset_open_rejects_post_resolution_symlink_replacement(self):
        if (
            os.name != "posix"
            or not hasattr(os, "O_NOFOLLOW")
            or os.open not in os.supports_dir_fd
        ):
            self.skipTest(
                "descriptor-relative no-follow opens are unavailable"
            )

        with tempfile.TemporaryDirectory() as root, tempfile.TemporaryDirectory() as outside:
            video_path = _write_v3_source(root)
            dataset = _import(root, max_samples=1)
            sample = dataset.first()
            reference = sample.media_reference
            manifest = _LeRobotMediaResolver().resolve_assets(
                reference, reference.describe_assets()
            )
            video = next(
                asset
                for asset in manifest.assets
                if asset.description.role.value == "video-stream"
            )
            outside_path = os.path.join(outside, "video.mp4")
            shutil.copy2(video_path, outside_path)
            os.remove(video_path)
            os.symlink(outside_path, video_path)

            client = TestClient(_make_route_app())
            url = "/dataset/%s/sample/%s/multimodal/assets/%s" % (
                dataset._doc.id,
                sample.id,
                video.asset_id,
            )
            with mock.patch(
                "fiftyone.server.routes.media_reference._resolve_manifest",
                return_value=(dataset, sample, manifest),
            ):
                response = client.get(url)

            self.assertEqual(response.status_code, 409)
            self.assertEqual(
                response.headers["X-FiftyOne-Error-Kind"],
                "stale-media-asset",
            )
            self.assertNotIn(outside, response.text)

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
            self.assertEqual(set(manifest), {"assets"})
            self.assertNotIn(root, encoded)
            self.assertNotIn("relative_path", encoded)
            self.assertNotIn("locator", encoded)
            self.assertNotIn("selector", encoded)
            self.assertNotIn("feature_name", encoded)
            self.assertNotIn("fingerprint", encoded)
            self.assertTrue(
                all(
                    set(asset)
                    == {
                        "asset_id",
                        "role",
                        "size_bytes",
                        "media_type",
                        "url",
                    }
                    for asset in manifest["assets"]
                )
            )
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
            full = client.get(video["url"])
            self.assertEqual(full.status_code, 200)
            self.assertEqual(
                full.content,
                b"0123456789abcdefghijklmnopqrstuvwxyz",
            )
            ranged = client.get(video["url"], headers={"Range": "bytes=0-3"})
            self.assertEqual(ranged.status_code, 206)
            self.assertEqual(ranged.content, b"0123")
            self.assertEqual(ranged.headers["accept-ranges"], "bytes")
            multipart = client.get(
                video["url"], headers={"Range": "bytes=0-1,4-5"}
            )
            self.assertEqual(multipart.status_code, 206)
            self.assertTrue(
                multipart.headers["content-type"].startswith(
                    "multipart/byteranges; boundary="
                )
            )

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
            descriptor = serialized["media_reference"]
            self.assertEqual(set(descriptor), {"kind", "key"})
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
                    set(transported["media_reference"]),
                    {"kind", "key"},
                )
                self.assertEqual(transported["_media_type"], "multimodal")

            unbind_lerobot_source(first.media_reference.source_identity)
            try:
                unbound = asyncio.run(
                    _create_sample_item(
                        dataset,
                        raw,
                        {},
                        {},
                        True,
                        additional_media_fields=(None, (), ()),
                    )
                )
                self.assertEqual(
                    set(unbound.sample["media_reference"]),
                    {"kind", "key"},
                )
                self.assertNotIn(root, json.dumps(unbound.sample, default=str))
            finally:
                bind_lerobot_source(
                    first.media_reference.source_identity,
                    root,
                    first.media_reference.source_fingerprint,
                )

            malformed_descriptor = dict(raw["media_reference"])
            malformed_descriptor["key"] = None
            malformed_descriptor["payload"] = {"private_root": root}
            malformed_raw = dict(raw)
            malformed_raw["media_reference"] = malformed_descriptor
            isolated = asyncio.run(
                _create_sample_item(
                    dataset,
                    malformed_raw,
                    {},
                    {},
                    True,
                    additional_media_fields=(None, (), ()),
                )
            )
            self.assertIsNone(isolated.sample["media_reference"])
            self.assertEqual(isolated.sample["_media_type"], "unknown")
            self.assertNotIn(root, json.dumps(isolated.sample, default=str))

            missing_media_type = dict(raw)
            missing_media_type["media_reference"] = descriptor
            missing_media_type.pop("_media_type", None)
            isolated = asyncio.run(
                _create_sample_item(
                    dataset,
                    missing_media_type,
                    {},
                    {},
                    True,
                    additional_media_fields=(None, (), ()),
                )
            )
            self.assertIsNone(isolated.sample["media_reference"])
            self.assertEqual(isolated.sample["_media_type"], "unknown")

            grouped = _filter_dict_by_fields(serialized, {"task"})
            self.assertIn("media_reference", grouped)
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
                set(patched.json()["media_reference"]),
                {"kind", "key"},
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
                {"$set": {"media_reference.kind": "unknown-reference"}},
            )
            fo.Sample._clear(dataset._sample_collection_name)
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
