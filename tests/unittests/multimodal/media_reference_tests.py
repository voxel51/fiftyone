"""
Logical media-reference sample tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json
import os
import pickle
import tempfile
import unittest
from unittest import mock

from decorators import drop_datasets
from mongoengine import ValidationError

import fiftyone as fo
import fiftyone.core.fields as fof
import fiftyone.core.odm as foo
import fiftyone.types as fot
from fiftyone.multimodal.media import (
    DatasetRelativeLocation,
    InvalidMediaLocationError,
    LeRobotEpisode,
    LeRobotV3Locator,
    MEDIA_REFERENCE_DATASET_REVISION,
    MediaAsset,
    MediaAssetRole,
    MediaReferenceError,
    RowInterval,
    UnsupportedMediaReferenceOperation,
    WholeFile,
    get_selected_media_asset_key,
    get_shared_media_asset_key,
    serialize_media_reference,
)

_SOURCE_FINGERPRINT = "sha256:" + "1" * 64


def _make_reference(episode_index):
    start = episode_index * 2
    return LeRobotEpisode(
        source_identity="hub:org/dataset@revision",
        source_fingerprint=_SOURCE_FINGERPRINT,
        episode_index=episode_index,
        codebase_version="v3.2",
        locator=LeRobotV3Locator(
            schema_version=1,
            source_fingerprint=_SOURCE_FINGERPRINT,
            locator_fingerprint="sha256:" + "2" * 64,
            info_location=DatasetRelativeLocation("meta/info.json"),
            statistics_location=None,
            statistics_content_fingerprint=None,
            tasks_location=None,
            tasks_content_fingerprint=None,
            episode_metadata_location=DatasetRelativeLocation(
                "meta/episodes/part-000.parquet"
            ),
            episode_metadata_row=episode_index,
            data_location=DatasetRelativeLocation(
                "data/chunk-000/file-000.parquet"
            ),
            data_content_fingerprint="sha256:" + "3" * 64,
            data_chunk_index=0,
            data_file_index=0,
            global_dataset_rows=RowInterval(
                "lerobot-v3-global-dataset-row", start, start + 2
            ),
            parquet_file_rows=RowInterval(
                "parquet-file-row", start, start + 2
            ),
            parquet_row_groups=(0,),
            videos=(),
            images=(),
        ),
    )


def _read_reference_key(sample):
    return sample.media_reference.key


def _mark_updated(sample):
    sample["updated"] = True


def _reference_keys(dataset):
    return [sample.media_reference.key for sample in dataset]


def _private_values(dataset, field_name):
    return [sample._doc.get_field(field_name) for sample in dataset]


class MediaReferenceDomainTests(unittest.TestCase):
    def test_stable_domain_identity_and_pickling(self):
        first = _make_reference(17)
        same_episode = _make_reference(17)
        next_episode = _make_reference(18)

        self.assertEqual(first.key, same_episode.key)
        self.assertNotEqual(first.key, next_episode.key)
        self.assertEqual(first.display_name, "episode-000017")
        self.assertEqual(first.media_type, "multimodal")
        self.assertFalse(hasattr(first, "resolve_filepath"))
        self.assertFalse(hasattr(first, "dataset_root"))
        self.assertEqual(
            first.describe_assets()[0].location,
            next_episode.describe_assets()[0].location,
        )
        self.assertEqual(
            get_shared_media_asset_key(first, first.describe_assets()[0]),
            get_shared_media_asset_key(
                next_episode, next_episode.describe_assets()[0]
            ),
        )
        self.assertNotEqual(
            get_selected_media_asset_key(first, first.describe_assets()[-1]),
            get_selected_media_asset_key(
                next_episode, next_episode.describe_assets()[-1]
            ),
        )
        self.assertEqual(pickle.loads(pickle.dumps(first)), first)

    def test_typed_asset_description_validation(self):
        reference = _make_reference(3)
        assets = reference.describe_assets()
        self.assertTrue(all(isinstance(asset, MediaAsset) for asset in assets))
        self.assertEqual(assets[0].role, MediaAssetRole.DATASET_INFO)

        invalid_paths = (
            "/absolute/file.json",
            "../outside.json",
            "meta//info.json",
            "C:/dataset/info.json",
            "meta\\info.json",
        )
        for path in invalid_paths:
            with self.subTest(path=path), self.assertRaises(
                InvalidMediaLocationError
            ):
                DatasetRelativeLocation(path)

        with self.assertRaises(MediaReferenceError):
            RowInterval("unknown-rows", 0, 1)
        with self.assertRaises(MediaReferenceError):
            RowInterval("parquet-file-row", 1, 1)
        with self.assertRaises(TypeError):
            MediaAsset(
                "other",
                DatasetRelativeLocation("meta/info.json"),
                WholeFile(),
            )

        shared_location = DatasetRelativeLocation(
            "data/chunk-000/file-000.parquet"
        )
        left = MediaAsset(
            MediaAssetRole.IMAGE_PAYLOAD,
            shared_location,
            RowInterval("parquet-file-row", 0, 2),
            feature_name="observation.images.left",
        )
        right = MediaAsset(
            MediaAssetRole.IMAGE_PAYLOAD,
            shared_location,
            RowInterval("parquet-file-row", 0, 2),
            feature_name="observation.images.right",
        )
        self.assertEqual(
            get_shared_media_asset_key(reference, left),
            get_shared_media_asset_key(reference, right),
        )
        self.assertNotEqual(
            get_selected_media_asset_key(reference, left),
            get_selected_media_asset_key(reference, right),
        )

    def test_public_construction_and_assignment_guards(self):
        sample = fo.Sample.from_media_reference(_make_reference(1), value=1)

        self.assertIsNone(sample.filepath)
        self.assertEqual(sample.filename, "episode-000001")
        self.assertEqual(sample.media_type, "multimodal")
        with self.assertRaises(AttributeError):
            sample.media_reference = _make_reference(2)
        with self.assertRaises(AttributeError):
            sample._media_reference = {}
        with self.assertRaises(ValueError):
            sample.filepath = "/tmp/episode.mcap"
        with self.assertRaises(AttributeError):
            fo.Sample(_media_reference={})
        with self.assertRaises(ValueError):
            fo.Sample()

    def test_document_xor_validation(self):
        envelope = serialize_media_reference(_make_reference(1))
        both = foo.DatasetSampleDocument(
            filepath="/tmp/episode.mcap",
            _media_reference=envelope,
            _media_type="multimodal",
        )
        neither = foo.DatasetSampleDocument(_media_type="multimodal")

        with self.assertRaises((MediaReferenceError, ValidationError)):
            both.validate()
        with self.assertRaises((MediaReferenceError, ValidationError)):
            neither.validate()

    def test_sample_native_round_trip(self):
        sample = fo.Sample.from_media_reference(_make_reference(3), value=51)
        serialized = json.loads(json.dumps(sample.to_dict()))
        reloaded = fo.Sample.from_dict(serialized)

        self.assertEqual(reloaded.media_reference, sample.media_reference)
        self.assertEqual(reloaded.media_type, sample.media_type)
        self.assertEqual(reloaded._doc._rand, sample._doc._rand)
        self.assertEqual(reloaded.value, 51)


class MediaReferenceDatasetTests(unittest.TestCase):
    @drop_datasets
    def test_persistence_views_iteration_and_workflows(self):
        dataset = fo.Dataset()
        samples = [
            fo.Sample.from_media_reference(
                _make_reference(index), episode_index=index
            )
            for index in range(4)
        ]
        dataset.add_samples(samples)

        raw_samples = list(dataset._sample_collection.find())
        self.assertTrue(
            all("filepath" not in sample for sample in raw_samples)
        )
        self.assertEqual(
            len({sample["_media_reference"]["key"] for sample in raw_samples}),
            4,
        )
        self.assertEqual(len({sample["_rand"] for sample in raw_samples}), 4)
        self.assertEqual(dataset.media_type, "multimodal")
        self.assertEqual(
            dataset.app_config.grid_media_field, "_media_reference"
        )
        self.assertIn("_media_reference", dataset.app_config.media_fields)
        self.assertEqual(
            dataset._doc.version, MEDIA_REFERENCE_DATASET_REVISION
        )

        reference_index = dataset.get_index_information()[
            "_media_reference.key"
        ]
        self.assertTrue(reference_index["unique"])
        self.assertTrue(reference_index["sparse"])
        with self.assertRaises(ValueError):
            dataset.drop_index("_media_reference.key")

        private_schema = dataset.get_field_schema(include_private=True)
        self.assertIsInstance(
            private_schema["_media_reference"], fof.DictField
        )
        self.assertNotIsInstance(
            private_schema["_media_reference"], LeRobotEpisode
        )

        with mock.patch.object(
            LeRobotEpisode,
            "describe_assets",
            side_effect=AssertionError("iteration described physical media"),
        ):
            loaded = list(dataset.iter_samples())
            selected = list(
                dataset.select_fields("episode_index").iter_samples()
            )

        self.assertEqual(
            [sample.media_reference.key for sample in loaded],
            [sample.media_reference.key for sample in selected],
        )
        logical_key = loaded[2].media_reference.key
        self.assertEqual(dataset[logical_key].id, loaded[2].id)
        self.assertEqual(dataset.limit(3)[logical_key].id, loaded[2].id)

        for sample in dataset.iter_samples(autosave=True):
            sample["autosaved"] = True
        self.assertEqual(dataset.count("autosaved"), 4)

        mapped = dict(
            dataset.map_samples(
                _read_reference_key,
                parallelize_method="process",
                num_workers=2,
            )
        )
        self.assertEqual(
            set(mapped.values()),
            {ref.key for ref in map(_make_reference, range(4))},
        )

        dataset.update_samples(
            _mark_updated,
            parallelize_method="thread",
            num_workers=2,
        )
        self.assertEqual(dataset.count("updated"), 4)

        copied = dataset.first().copy()
        view_copy = dataset.select_fields("episode_index").first().copy()
        self.assertEqual(
            copied.media_reference.key, dataset.first().media_reference.key
        )
        self.assertEqual(
            view_copy.media_reference.key, dataset.first().media_reference.key
        )

        destination = fo.Dataset()
        destination.add_samples(dataset.iter_samples())
        self.assertEqual(
            _reference_keys(destination),
            _reference_keys(dataset),
        )
        self.assertTrue(
            set(destination.values("id")).isdisjoint(dataset.values("id"))
        )

        clone = dataset.clone()
        self.assertEqual(
            _reference_keys(clone),
            _reference_keys(dataset),
        )
        self.assertTrue(
            set(clone.values("id")).isdisjoint(dataset.values("id"))
        )

    @drop_datasets
    def test_dataset_native_dict_and_json_round_trips(self):
        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample.from_media_reference(_make_reference(index))
                for index in range(2)
            ]
        )
        expected_keys = _reference_keys(dataset)
        expected_rand = _private_values(dataset, "_rand")

        from_dict = fo.Dataset.from_dict(dataset.to_dict())
        self.assertEqual(_reference_keys(from_dict), expected_keys)
        self.assertEqual(_private_values(from_dict, "_rand"), expected_rand)

        with tempfile.TemporaryDirectory() as temp_dir:
            json_path = os.path.join(temp_dir, "dataset.json")
            dataset.write_json(json_path)
            from_json = fo.Dataset.from_json(json_path)

        self.assertEqual(_reference_keys(from_json), expected_keys)
        self.assertEqual(_private_values(from_json, "_rand"), expected_rand)

        with tempfile.TemporaryDirectory() as export_dir:
            native_dir = os.path.join(export_dir, "native")
            dataset.export(
                export_dir=native_dir,
                dataset_type=fot.FiftyOneDataset,
                export_media=True,
            )
            samples_path = os.path.join(native_dir, "samples.json")
            with open(samples_path) as file:
                exported_document = json.load(file)

            exported_samples = exported_document["samples"]

            self.assertTrue(
                all("filepath" not in sample for sample in exported_samples)
            )
            self.assertTrue(
                all(
                    "_media_reference" in sample for sample in exported_samples
                )
            )

            imported = fo.Dataset.from_dir(
                dataset_dir=native_dir,
                dataset_type=fot.FiftyOneDataset,
            )

            exported_samples[0]["filepath"] = "/tmp/injected.jpg"
            with open(samples_path, "w") as file:
                json.dump(exported_document, file)

            malformed_name = "malformed-native-media-reference"
            with self.assertRaises(MediaReferenceError):
                fo.Dataset.from_dir(
                    dataset_dir=native_dir,
                    dataset_type=fot.FiftyOneDataset,
                    name=malformed_name,
                )
            self.assertFalse(fo.dataset_exists(malformed_name))

        self.assertEqual(_reference_keys(imported), expected_keys)
        self.assertEqual(_private_values(imported, "_rand"), expected_rand)

    @drop_datasets
    def test_duplicate_merge_and_mixed_identity_guards(self):
        source = fo.Dataset()
        source.add_sample(
            fo.Sample.from_media_reference(_make_reference(1), value="source")
        )
        destination = fo.Dataset()
        destination.add_sample(
            fo.Sample.from_media_reference(
                _make_reference(1), value="destination"
            )
        )
        destination.merge_samples(source)
        self.assertEqual(len(destination), 1)
        self.assertEqual(destination.first().value, "source")

        with self.assertRaises(ValueError):
            destination.add_sample(
                fo.Sample.from_media_reference(_make_reference(1))
            )

        filepath_dataset = fo.Dataset()
        filepath_dataset.add_sample(fo.Sample(filepath="/tmp/episode.mcap"))
        indexes_before = set(filepath_dataset.list_indexes())
        with self.assertRaises(ValueError):
            filepath_dataset.merge_samples(source)
        self.assertEqual(set(filepath_dataset.list_indexes()), indexes_before)
        self.assertNotIn(
            "filepath_1",
            {
                index
                for index in filepath_dataset.list_indexes()
                if filepath_dataset.get_index_information()[index].get(
                    "unique"
                )
            },
        )
        self.assertEqual(len(filepath_dataset), 1)

        with self.assertRaises(ValueError):
            destination.merge_samples(
                [fo.Sample(filepath="/tmp/incompatible.mcap")]
            )
        self.assertEqual(len(destination), 1)

        mixed = fo.Dataset()
        mixed.add_sample(fo.Sample.from_media_reference(_make_reference(2)))
        mixed.add_sample(fo.Sample(filepath="/tmp/mixed.mcap"))
        self.assertEqual(len(mixed), 2)

    @drop_datasets
    def test_guarded_file_operations_and_record_only_deletion(self):
        with tempfile.TemporaryDirectory() as root:
            os.makedirs(os.path.join(root, "meta"))
            anchor = os.path.join(root, "meta", "info.json")
            with open(anchor, "w") as file:
                json.dump({}, file)

            dataset = fo.Dataset()
            dataset.add_sample(
                fo.Sample.from_media_reference(_make_reference(1))
            )
            self.assertEqual(dataset.values("filepath"), [None])

            with self.assertRaises(UnsupportedMediaReferenceOperation):
                dataset.set_values("filepath", ["/tmp/replacement.mcap"])
            with self.assertRaises(UnsupportedMediaReferenceOperation):
                dataset.set_field("filepath", fo.ViewField("episode_index"))
            with self.assertRaises(UnsupportedMediaReferenceOperation):
                dataset.clear_sample_field("filepath")
            with self.assertRaises(AttributeError):
                dataset.set_values("_media_reference", [{}])
            with self.assertRaises(UnsupportedMediaReferenceOperation):
                dataset.compute_metadata()
            with self.assertRaises(UnsupportedMediaReferenceOperation):
                dataset.export(
                    export_dir=os.path.join(root, "export"),
                    dataset_type=fot.ImageDirectory,
                )

            live = dataset.first()
            dataset.delete_samples(live.id)
            self.assertFalse(live.in_dataset)
            self.assertEqual(live.media_reference.key, _make_reference(1).key)
            self.assertTrue(os.path.isfile(anchor))


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
