"""
LeRobotDataset v3 importer and episode asset transport tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
from copy import deepcopy
import json
import os
import shutil
import tempfile
import unittest

import pyarrow as pa
import pyarrow.parquet as papq
from starlette.applications import Starlette
from starlette.routing import Route
from starlette.testclient import TestClient

from decorators import drop_datasets

import fiftyone as fo
import fiftyone.types as fot
from fiftyone.multimodal.media import (
    LeRobotEpisode,
    MalformedMediaSourceError,
    MissingMediaRootError,
    MovedMediaRootError,
    StaleMediaReferenceError,
    UnfinalizedMediaSourceError,
    UnsupportedMediaReferenceVersionError,
)
from fiftyone.server import utils as fosu
from fiftyone.server.routes.groups import _filter_dict_by_fields
from fiftyone.server.routes.media_reference import MediaReferenceRoutes
from fiftyone.server.routes.sample import SampleRoutes, generate_sample_etag
from fiftyone.server.samples import _create_sample_item
from fiftyone.utils.lerobot import LeRobotEpisodeResolver

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
        },
        "fps": 10,
        "robot_type": "so101",
        "total_episodes": episodes,
        "video_path": (
            "videos/chunk-{chunk_index:03d}/{video_key}/"
            "file-{file_index:03d}.mp4"
        ),
    }
    _write_json(os.path.join(root, "meta", "info.json"), info)

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
                "tasks": ["task-%d" % episode_index],
                "videos/%s/chunk_index" % _VIDEO_FEATURE: 0,
                "videos/%s/file_index" % _VIDEO_FEATURE: 0,
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
        "file-000.mp4",
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
                    {reference.resolve_filepath() for reference in references}
                ),
                1,
            )
            self.assertEqual(dataset.info["lerobot"]["format_major"], 3)
            self.assertEqual(
                dataset.info["lerobot"]["imported_episode_count"], 10
            )

            locator = references[7].locator
            self.assertEqual(
                locator["global_dataset_row_range"],
                {
                    "coordinate_system": "dataset-global-row",
                    "end": 16,
                    "interval": "half-open",
                    "start": 14,
                },
            )
            self.assertIn("shard_row_range", locator["data"])
            self.assertIn("row_groups", locator["data"])
            self.assertIn(_VIDEO_FEATURE, locator["videos"])
            self.assertTrue(
                locator["episode_metadata"]["relative_path"].endswith(
                    "part-001.parquet"
                )
            )

            selected = _import(root, episodes=[7, 2], max_samples=1)
            self.assertEqual(selected.values("episode_index"), [7])

            relocated_root = root + "-relocated"
            shutil.copytree(root, relocated_root)
            try:
                relocated = LeRobotEpisode(
                    source_identity=references[7].source_identity,
                    dataset_root=relocated_root,
                    episode_index=references[7].episode_index,
                    codebase_version=references[7].codebase_version,
                    locator=references[7].locator,
                )
                self.assertEqual(relocated.key, references[7].key)
                manifest = LeRobotEpisodeResolver().resolve_assets(relocated)
                self.assertEqual(manifest.episode_index, 7)
            finally:
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
                LeRobotEpisodeResolver().resolve_assets(first)

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
    def test_typed_root_and_traversal_errors(self):
        with tempfile.TemporaryDirectory() as root:
            _write_v3_source(root)
            dataset = _import(root, max_samples=1)
            reference = dataset.first().media_reference
            resolver = LeRobotEpisodeResolver()

            moved = LeRobotEpisode(
                reference.source_identity,
                os.path.join(root, "moved"),
                reference.episode_index,
                reference.codebase_version,
                reference.locator,
            )
            with self.assertRaises(MovedMediaRootError):
                resolver.resolve_assets(moved)

            missing = LeRobotEpisode(
                reference.source_identity,
                "/path/whose/parents/do/not/exist/source",
                reference.episode_index,
                reference.codebase_version,
                reference.locator,
            )
            with self.assertRaises(MissingMediaRootError):
                resolver.resolve_assets(missing)

            locator = deepcopy(reference.locator)
            locator["data"]["relative_path"] = "../../outside.parquet"
            traversal = LeRobotEpisode(
                reference.source_identity,
                root,
                reference.episode_index,
                reference.codebase_version,
                locator,
            )
            with self.assertRaises(MalformedMediaSourceError):
                resolver.resolve_assets(traversal)


class LeRobotServerTests(unittest.TestCase):
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
                {"info", "metadata", "data", "video"}.issubset(
                    {asset["role"] for asset in manifest["assets"]}
                )
            )

            video = next(
                asset
                for asset in manifest["assets"]
                if asset["role"] == "video"
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
            self.assertEqual(
                client.get(
                    manifest_path + "?path=../../etc/passwd"
                ).status_code,
                200,
            )

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


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
