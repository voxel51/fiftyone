"""
LeRobotDataset v3 importer and episode asset transport tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

from decorators import drop_datasets
import pytest

import fiftyone as fo
import fiftyone.multimodal.media_reference.asset_planning as foma
import fiftyone.multimodal.media_reference.field_model as fmm
from fiftyone.multimodal.media_reference.field_model import (
    MalformedMediaSourceError,
    MissingMediaRootError,
    UnfinalizedMediaSourceError,
)
from fiftyone.utils.lerobot import (
    LeRobotEpisodeReference,
    UnsupportedLeRobotExportModeError,
    UnsupportedLeRobotVersionError,
)
import fiftyone.types as fot
import fiftyone.utils.data as foud
import fiftyone.utils.data.importers as foudi
import fiftyone.utils.lerobot as foul
from fiftyone.utils.lerobot import (
    LeRobotDatasetImporter,
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


def _read_parquet(path):
    """Reads a Parquet file without leaving an OS handle on it.

    ``read_table`` holds the file open until its reader is collected, and on
    Windows an open handle blocks both rewriting the file and deleting the
    temporary directory it sits in.
    """
    with open(path, "rb") as file:
        return papq.read_table(pa.BufferReader(file.read()))


def _import(root, **kwargs):
    return fo.Dataset.from_dir(
        dataset_dir=root,
        dataset_type=fot.LeRobotDataset,
        **kwargs,
    )


def _source_locs(dataset):
    return {
        key: media_source["loc"]
        for key, media_source in fmm._media_sources_by_id(dataset).items()
    }


def _take_sources(dataset):
    """Removes and returns the dataset's media sources: what an unbound
    source looks like to everything downstream."""
    entries = list(fmm._media_sources_by_id(dataset).values())
    dataset._doc._media_sources = []
    dataset._doc._media_source_layouts = []
    dataset.save()
    return entries


def _put_sources(dataset, entries, loc=None):
    """Restores media sources, relocating them to ``loc`` when given. The id
    is kept: it leads every asset path already on the samples."""
    if loc is None:
        # re-recorded, not re-assigned: a stored entry names the tables it is
        # filed under, and only a reader hands back a whole description
        dataset._record_media_sources(entries)
        return

    # relocating files the source under a new root, which is the one edit a
    # move takes
    relocated = []
    for entry in entries:
        entry = dict(entry)
        entry.pop("root", None)
        entry.pop("dir", None)
        entry["loc"] = loc
        relocated.append(entry)

    dataset._record_media_sources(relocated)


_VIDEO_FEATURE = "observation.images.front"


def _delete_when_done(dataset):
    """Deletes a dataset the sweep between tests will not: only
    non-persistent datasets are swept, and this one has to outlive a child
    process that clears those as it connects."""
    if fo.dataset_exists(dataset.name):
        fo.delete_dataset(dataset.name)


def _paginate(dataset, first=20):
    """The page the grid receives, as ``paginate_samples`` builds it."""
    from fiftyone.server.samples import paginate_samples

    return asyncio.run(paginate_samples(dataset.name, [], None, first))


def _page_media(page):
    """Each sample's delivered media on ``page``, by sample id."""
    return {
        str(edge.node.sample["_id"]): edge.node.sample.get("_media")
        for edge in page.edges
    }


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
                LeRobotEpisodeReference,
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
            self.assertEqual(len({r.key for r in references}), 10)
            resolved = fmm._resolve_media_references(
                dataset,
                {str(i): r.to_mongo() for i, r in enumerate(references)},
            )
            self.assertEqual(
                len(
                    {
                        asset.path
                        for entry in resolved.values()
                        for asset in entry.assets
                        if asset.description.role.value == "video-stream"
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

            episode = references[7]

            selected = _import(root, episodes=[7, 2], max_samples=1)
            self.assertEqual(selected.values("episode_index"), [7])

            relocated_root = root + "-relocated"
            shutil.copytree(root, relocated_root)
            entries = list(fmm._media_sources_by_id(dataset).values())
            try:
                _put_sources(dataset, entries, loc=relocated_root)
                locs = _source_locs(dataset)
                self.assertEqual(locs[episode.source_id], relocated_root)
                resolved = fmm._resolve_media_references(
                    dataset, {"e": episode.to_mongo()}
                )["e"].assets
                self.assertTrue(
                    all(
                        asset.path.startswith(relocated_root)
                        and os.path.isfile(asset.path)
                        for asset in resolved
                    )
                )
            finally:
                _put_sources(dataset, entries)
                shutil.rmtree(relocated_root)

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
            rows = _read_parquet(episodes_path).to_pylist()
            rows[0]["videos/%s/from_timestamp" % _VIDEO_FEATURE] = "invalid"
            _write_parquet(episodes_path, rows)
            with self.assertRaisesRegex(
                MalformedMediaSourceError, "must be a float column"
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
        with mock.patch.object(foul.os, "sep", "\\"):
            self.assertEqual(
                foul._relative_to_root(
                    r"C:\dataset\meta\episodes\part-000.parquet",
                    r"C:\dataset",
                ),
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
    def test_typed_missing_source_errors(self):
        with tempfile.TemporaryDirectory() as root:
            _write_v3_source(root)
            dataset = _import(root, max_samples=1)
            sample = dataset.first()
            reference = sample.media_reference

            entries = _take_sources(dataset)
            try:
                # the sample still reaches the grid; only its media is absent
                page = _paginate(dataset)
                self.assertEqual(_page_media(page), {sample.id: None})
                with self.assertRaises(MissingMediaRootError):
                    fmm._resolve_media_references(
                        dataset, {"r": reference.to_mongo()}
                    )
            finally:
                _put_sources(dataset, entries)

    @drop_datasets
    def test_source_binding_survives_a_fresh_server_process(self):
        with tempfile.TemporaryDirectory() as root:
            _write_v3_source(root)
            dataset = _import(root, max_samples=1)
            # a fresh process clears non-persistent datasets as it connects,
            # and this one has to still be there when the child reads it.
            # Restored below, since only non-persistent datasets are swept
            # between tests
            dataset.persistent = True
            self.addCleanup(_delete_when_done, dataset)
            script = """
import asyncio
import os
import sys
import fiftyone.multimodal.media_reference.field_model as fmm
from fiftyone.core.dataset import load_dataset
from fiftyone.server.samples import paginate_samples

page = asyncio.run(paginate_samples(sys.argv[1], [], None, 20))
media = next(
    edge.node.sample['_media']
    for edge in page.edges
    if str(edge.node.sample['_id']) == sys.argv[2]
)
info = next(a for a in media['assets'] if a['id'].endswith('meta/info.json'))
source_id, path = info['id'].split('/', 1)
# a local source is located once for the dataset, not per page
sources = fmm.addressable_media_sources(load_dataset(sys.argv[1]))
print(os.path.join(sources[source_id], *path.split('/')))
"""
            run = (
                lambda: subprocess.check_output(
                    [
                        sys.executable,
                        "-c",
                        script,
                        dataset.name,
                        dataset.first().id,
                    ],
                    cwd=os.getcwd(),
                    text=True,
                    timeout=120,
                )
                .strip()
                .splitlines()[-1]
            )

            # import records the source's real location, so that is what a
            # reader is handed back
            self.assertEqual(
                run(),
                os.path.join(os.path.realpath(root), "meta", "info.json"),
            )

            entries = list(fmm._media_sources_by_id(dataset).values())
            with tempfile.TemporaryDirectory() as relocation_parent:
                relocated_root = os.path.join(relocation_parent, "source")
                shutil.copytree(root, relocated_root)
                _put_sources(dataset, entries, loc=relocated_root)
                # a process that recorded nothing reads the source's current
                # location out of the dataset, not a location it remembered
                self.assertEqual(
                    run(),
                    os.path.join(relocated_root, "meta", "info.json"),
                )

            _put_sources(dataset, entries)

            with tempfile.TemporaryDirectory() as export_parent:
                export_root = os.path.join(export_parent, "native")
                dataset.export(
                    export_dir=export_root,
                    dataset_type=fot.FiftyOneDataset,
                    export_media=True,
                )
                # samples carry source-keyed paths and the bundle manifest
                # names keys, so neither can name the machine's source root
                for filename in ("samples.json", "media_sources.json"):
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
            )
            official = LeRobotDataset(
                repo_id="fiftyone/test-export",
                root=export_root,
                episodes=[0, 1],
                download_videos=False,
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
            data = _read_parquet(os.path.join(export_root, data_path))
            self.assertEqual(data["index"].to_pylist(), [0, 1, 2, 3])
            self.assertEqual(data["episode_index"].to_pylist(), [0, 0, 1, 1])
            self.assertEqual(data["frame_index"].to_pylist(), [0, 1, 0, 1])
            with open(os.path.join(export_root, "meta", "stats.json")) as file:
                statistics = json.load(file)

            self.assertIn("observation.state", statistics)
            self.assertEqual(statistics["index"]["min"], [0])

            episodes = _read_parquet(
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
            resolved = fmm._resolve_media_references(
                exported, {"e": exported_reference.to_mongo()}
            )["e"].assets
            self.assertTrue(
                all(os.path.isfile(asset.path) for asset in resolved)
            )

    @drop_datasets
    def test_export_preserves_arrow_types_timestamps_and_permissions(self):
        # Windows will not unlink a file a handle is still open on, and the
        # exported Parquet outlives this block; the assertions below are what
        # the test is for, not the teardown
        with tempfile.TemporaryDirectory(
            ignore_cleanup_errors=True
        ) as temp_dir:
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

            exported_table = _read_parquet(
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
                (False, "use FiftyOneDataset to preserve thin references"),
                (0, "set export_media=True"),
                ("move", "LeRobot sources are shared and cannot be moved"),
                ("symlink", "LeRobot exports must be self-contained"),
                (
                    "manifest",
                    "use FiftyOneDataset for a thin-reference export",
                ),
            )
            for index, (mode, suggestion) in enumerate(modes):
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
                self.assertIn(suggestion, str(error))
                self.assertFalse(os.path.exists(destination))

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
                rows = _read_parquet(path).to_pylist()
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
                foud.MediaExporter,
                "export_reference_asset",
                new=track_materialization,
            ):
                selected.export(dataset_exporter=exporter)

            self.assertEqual(len(reference_plans), 1)
            plan = reference_plans[0]
            self.assertEqual(
                len(plan.occurrences),
                occurrence_count,
            )
            self.assertEqual(len(plan.references), reference_count)
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
            ):
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
            # the bundle's samples are read once, not once to observe and
            # again to insert
            self.assertEqual(len(sample_reads), 1)
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

            with mock.patch(
                "fiftyone.core.collections.foma._build_reference_asset_plan",
                wraps=foma._build_reference_asset_plan,
            ) as build_plan, mock.patch.object(
                foma,
                "_media_sources_by_id",
                wraps=foma._media_sources_by_id,
            ) as source_read:
                paths = selected._get_media_paths()

            build_plan.assert_called_once_with(selected, resolve=True)
            self.assertEqual(source_read.call_count, 1)
            self.assertEqual(len(paths), len(set(paths)))
            self.assertTrue(all(os.path.isfile(path) for path in paths))

            nested_paths = selected._get_media_paths(flat=False)
            self.assertEqual(len(nested_paths), occurrence_count)
            self.assertTrue(all(paths for paths in nested_paths))

            with mock.patch(
                "fiftyone.core.collections.foma._build_reference_asset_plan",
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
            with mock.patch(
                "fiftyone.core.collections.foma._build_reference_asset_plan",
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

            self.assertEqual(set(manifest), {"versions", "sources"})
            self.assertEqual(len(manifest["sources"]), 1)
            self.assertIsNotNone(manifest["sources"][0]["relative_root"])
            self.assertNotIn(source_root, json.dumps(manifest))

            imported = fo.Dataset.from_dir(
                dataset_dir=output_root,
                dataset_type=fot.FiftyOneDataset,
            )
            self.assertEqual(sorted(imported.values("episode_index")), [1, 3])
            self.assertNotIn("media_reference_sources", imported.info)
            source = manifest["sources"][0]
            self.assertEqual(set(source), {"kind", "id", "relative_root"})
            bundle_source_root = os.path.realpath(
                os.path.join(output_root, source["relative_root"])
            )
            # a source this import created resolves through the bundle's
            # copy, not the exporting machine's location
            self.assertEqual(
                _source_locs(imported)[source["id"]], bundle_source_root
            )

    @drop_datasets
    def test_native_thin_materialized_and_unsupported_modes(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            source_root = os.path.join(temp_dir, "source")
            thin_root = os.path.join(temp_dir, "thin")
            materialized_root = os.path.join(temp_dir, "materialized")
            _write_v3_source(source_root, episodes=3)
            dataset = _import(source_root, episodes=[0, 2])
            reference = dataset.first().media_reference

            dataset.export(
                export_dir=thin_root,
                dataset_type=fot.FiftyOneDataset,
                export_media=False,
            )
            with open(os.path.join(thin_root, "media_sources.json")) as file:
                thin_manifest = json.load(file)

            self.assertEqual(set(thin_manifest), {"versions", "sources"})
            # a thin bundle copies nothing, so no source has a location in it
            self.assertTrue(
                all(
                    source["relative_root"] is None
                    for source in thin_manifest["sources"]
                )
            )
            # samples carry source-keyed paths and the bundle manifest names
            # keys, so neither can name the machine's source root
            for filename in ("samples.json", "media_sources.json"):
                with open(os.path.join(thin_root, filename)) as file:
                    self.assertNotIn(source_root, file.read())

            for index, (filename, message) in enumerate(
                (("media_sources.json", "media-source manifest"),)
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

            thin_import = fo.Dataset.from_dir(
                dataset_dir=thin_root,
                dataset_type=fot.FiftyOneDataset,
            )
            self.assertNotIn("media_reference_sources", thin_import.info)
            # a thin bundle carries its source locations, so the import can
            # resolve without being told where the source is
            self.assertEqual(_source_locs(thin_import), _source_locs(dataset))
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
            materialized_import = fo.Dataset.from_dir(
                dataset_dir=materialized_root,
                dataset_type=fot.FiftyOneDataset,
            )
            # the bundle rebinds the source onto itself, not the original
            self.assertTrue(
                _source_locs(materialized_import)[
                    reference.source_id
                ].startswith(os.path.realpath(materialized_root))
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
            self.assertFalse(
                os.path.isfile(os.path.join(export_root, "media_sources.json"))
            )


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
