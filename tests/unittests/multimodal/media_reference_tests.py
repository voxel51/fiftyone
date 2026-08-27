"""
Logical media-reference sample tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from dataclasses import FrozenInstanceError, dataclass
import json
import os
import pickle
from functools import partial
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

from decorators import drop_datasets
from mongoengine import ValidationError
from pymongo.errors import DuplicateKeyError

import fiftyone as fo
import fiftyone.core.fields as fof
import fiftyone.core.media as fom
import fiftyone.core.odm as foo
import fiftyone.core.utils as fou
import fiftyone.migrations as fomi
import fiftyone.types as fot
import fiftyone.utils.data as foud
from fiftyone.multimodal.media import (
    DatasetRelativeLocation,
    InvalidMediaLocationError,
    LeRobotEpisode,
    LeRobotV3Locator,
    MEDIA_REFERENCE_DATASET_REVISION,
    MediaAsset,
    MediaAssetRole,
    MediaReference,
    MediaReferenceError,
    RowInterval,
    UnsupportedMediaReferenceOperation,
    WholeFile,
    _get_selected_media_asset_key,
    _get_shared_media_asset_key,
    register_media_reference,
    serialize_media_reference,
)

_SOURCE_FINGERPRINT = "sha256:" + "1" * 64


@dataclass(frozen=True)
class _AlternateMediaReference(MediaReference):
    identity: str

    @property
    def key(self):
        return "alternate:%s" % self.identity

    @property
    def media_type(self):
        return "multimodal"

    @property
    def display_name(self):
        return self.identity

    def describe_assets(self):
        return ()


@dataclass(frozen=True)
class _ImageMediaReference(MediaReference):
    identity: str

    @property
    def key(self):
        return "image:%s" % self.identity

    @property
    def media_type(self):
        return "image"

    @property
    def display_name(self):
        return self.identity

    def describe_assets(self):
        return ()


@dataclass(frozen=True)
class _UnmaterializedMediaReference(MediaReference):
    identity: str

    @property
    def key(self):
        return "unmaterialized:%s" % self.identity

    @property
    def media_type(self):
        return "multimodal"

    @property
    def display_name(self):
        return self.identity

    def describe_assets(self):
        return (
            MediaAsset(
                MediaAssetRole.PRIMARY_MEDIA,
                DatasetRelativeLocation("asset.bin"),
                WholeFile(),
            ),
        )


register_media_reference(
    "test-alternate-reference",
    _AlternateMediaReference,
    "1",
    lambda reference: {"identity": reference.identity},
    lambda payload: _AlternateMediaReference(payload["identity"]),
)
register_media_reference(
    "test-image-reference",
    _ImageMediaReference,
    "1",
    lambda reference: {"identity": reference.identity},
    lambda payload: _ImageMediaReference(payload["identity"]),
)
register_media_reference(
    "test-unmaterialized-reference",
    _UnmaterializedMediaReference,
    "1",
    lambda reference: {"identity": reference.identity},
    lambda payload: _UnmaterializedMediaReference(payload["identity"]),
)


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
            _get_shared_media_asset_key(first, first.describe_assets()[0]),
            _get_shared_media_asset_key(
                next_episode, next_episode.describe_assets()[0]
            ),
        )
        self.assertNotEqual(
            _get_selected_media_asset_key(first, first.describe_assets()[-1]),
            _get_selected_media_asset_key(
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
            _get_shared_media_asset_key(reference, left),
            _get_shared_media_asset_key(reference, right),
        )
        self.assertNotEqual(
            _get_selected_media_asset_key(reference, left),
            _get_selected_media_asset_key(reference, right),
        )

    def test_unattached_whole_value_reassignment(self):
        sample = fo.Sample.from_media_reference(_make_reference(1), value=1)

        self.assertIsNone(sample.filepath)
        self.assertEqual(sample.filename, "episode-000001")
        self.assertEqual(sample.media_type, "multimodal")
        sample.media_reference = _make_reference(2)
        self.assertEqual(sample.media_reference, _make_reference(2))
        self.assertEqual(sample.filename, "episode-000002")

        sample.set_field("media_reference", _make_reference(3))
        self.assertEqual(
            sample.get_field("media_reference"), _make_reference(3)
        )

    def test_reassignment_validation_and_mutation_guards(self):
        sample = fo.Sample.from_media_reference(_make_reference(1), value=1)
        original = sample.media_reference

        for invalid in (
            None,
            {},
            serialize_media_reference(_make_reference(2)),
        ):
            with self.subTest(invalid=invalid), self.assertRaises(TypeError):
                sample.media_reference = invalid

            self.assertEqual(sample.media_reference, original)

        with self.assertRaises(fom.MediaTypeError):
            sample.media_reference = _ImageMediaReference("other-media-type")

        self.assertEqual(sample.media_reference, original)
        with self.assertRaises(AttributeError):
            sample.set_field("media_reference.payload", {})
        with self.assertRaises(AttributeError):
            sample.set_field("_media_reference.payload", {})
        with self.assertRaises(AttributeError):
            sample._media_reference = {}
        with self.assertRaises(ValueError):
            sample.filepath = "/tmp/episode.mcap"

        hydrated = sample.media_reference
        with self.assertRaises(FrozenInstanceError):
            hydrated.episode_index = 2
        with self.assertRaises(FrozenInstanceError):
            hydrated.locator.episode_metadata_row = 2

        with self.assertRaises(ValueError):
            sample.clear_field("media_reference")
        with self.assertRaises(AttributeError):
            sample.clear_field("media_reference.payload")
        with self.assertRaises(ValueError):
            sample.clear_field("_media_reference")

        filepath_sample = fo.Sample(filepath="image.jpg")
        with self.assertRaises(ValueError):
            filepath_sample.set_field("media_reference", _make_reference(2))
        with self.assertRaises(ValueError):
            filepath_sample.media_reference = _make_reference(2)
        with self.assertRaises(ValueError):
            filepath_sample["media_reference"] = _make_reference(2)

        with self.assertRaises(TypeError):
            # pylint: disable-next=no-value-for-parameter
            fo.Sample(_media_reference={})
        with self.assertRaises(TypeError):
            # pylint: disable-next=no-value-for-parameter
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
        self.assertEqual(serialized["_media_reference"]["version"], "1")
        reloaded = fo.Sample.from_dict(serialized)

        self.assertEqual(reloaded.media_reference, sample.media_reference)
        self.assertEqual(reloaded.media_type, sample.media_type)
        self.assertEqual(reloaded._doc._rand, sample._doc._rand)
        self.assertEqual(reloaded.value, 51)


class MediaReferenceDatasetTests(unittest.TestCase):
    @drop_datasets
    def test_attached_whole_value_reassignment_and_reload(self):
        dataset = fo.Dataset()
        dataset.add_sample(
            fo.Sample.from_media_reference(
                _make_reference(1), metadata=fo.Metadata(size_bytes=51)
            )
        )
        sample = dataset.first()

        replacement = _make_reference(11)
        sample.media_reference = replacement
        self.assertEqual(sample.media_reference, replacement)
        self.assertIsNone(sample.metadata)

        sample.save()
        sample.reload()
        self.assertEqual(sample.media_reference, replacement)
        self.assertIsNone(sample.metadata)

        second_replacement = _make_reference(12)
        sample.set_field("media_reference", second_replacement)
        sample.save()
        sample.reload()
        self.assertEqual(sample.media_reference, second_replacement)

    @drop_datasets
    def test_reassignment_rejects_duplicates_and_incompatible_references(self):
        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample.from_media_reference(_make_reference(1)),
                fo.Sample.from_media_reference(_make_reference(2)),
            ]
        )
        sample = dataset.first()
        persisted = dataset._sample_collection.find_one({"_id": sample._id})
        dataset_kind = dataset._doc.media_reference_kind

        with self.assertRaisesRegex(ValueError, "duplicate"):
            sample.media_reference = _make_reference(2)

        self.assertEqual(
            dataset._sample_collection.find_one({"_id": sample._id}), persisted
        )
        self.assertEqual(sample.media_reference, _make_reference(1))

        dataset._doc.media_reference_kind = None
        dataset._doc.save()
        with self.assertRaisesRegex(ValueError, "incompatible"):
            sample.media_reference = _AlternateMediaReference("other-kind")

        self.assertEqual(
            dataset._sample_collection.find_one({"_id": sample._id}), persisted
        )
        self.assertEqual(sample.media_reference, _make_reference(1))
        dataset._doc.media_reference_kind = dataset_kind
        dataset._doc.save()

        with mock.patch.object(
            fo.Sample, "_validate_unique_media_reference_key"
        ):
            sample.media_reference = _make_reference(2)

        with self.assertRaises(DuplicateKeyError):
            sample.save()

        self.assertEqual(
            dataset._sample_collection.find_one({"_id": sample._id}), persisted
        )
        sample.reload()
        self.assertEqual(sample.media_reference, _make_reference(1))

        with self.assertRaisesRegex(ValueError, "multiple reference kinds"):
            sample.media_reference = _AlternateMediaReference("other-kind")

        self.assertEqual(
            dataset._sample_collection.find_one({"_id": sample._id}), persisted
        )
        self.assertEqual(sample.media_reference, _make_reference(1))

    @drop_datasets
    def test_group_slice_compatibility_is_revalidated_on_assignment(self):
        group = fo.Group()
        dataset = fo.Dataset()
        dataset.add_sample(
            fo.Sample.from_media_reference(
                _make_reference(1), group=group.element("left")
            )
        )
        sample = dataset.first()
        persisted = dataset._sample_collection.find_one({"_id": sample._id})

        dataset._doc.group_media_types["left"] = "image"
        dataset.save()

        with self.assertRaises(fom.MediaTypeError):
            sample.media_reference = _make_reference(2)

        self.assertEqual(
            dataset._sample_collection.find_one({"_id": sample._id}), persisted
        )
        self.assertEqual(sample.media_reference, _make_reference(1))

        with self.assertRaises(fom.MediaTypeError):
            sample.media_reference = _ImageMediaReference("other-media-type")

        self.assertEqual(
            dataset._sample_collection.find_one({"_id": sample._id}), persisted
        )
        self.assertEqual(sample.media_reference, _make_reference(1))

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
                export_media=False,
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

            destination = fo.Dataset()
            destination.add_sample(
                fo.Sample.from_media_reference(_make_reference(99))
            )
            importer, _ = foud.build_dataset_importer(
                fot.FiftyOneDataset, dataset_dir=native_dir
            )
            destination.add_importer(importer)
            self.assertEqual(len(destination), 3)
            self.assertEqual(
                destination._doc.version, MEDIA_REFERENCE_DATASET_REVISION
            )
            self.assertEqual(
                destination._doc.media_reference_kind, "lerobot-episode"
            )
            self.assertTrue(
                destination.get_index_information()["_media_reference.key"][
                    "unique"
                ]
            )

            metadata_path = os.path.join(native_dir, "metadata.json")
            with open(metadata_path) as file:
                exported_metadata = json.load(file)

            exported_metadata["version"] = "1.0.0"
            with open(metadata_path, "w") as file:
                json.dump(exported_metadata, file)

            invalid_revision_name = "invalid-native-media-reference-revision"
            with self.assertRaises(MediaReferenceError):
                fo.Dataset.from_dir(
                    dataset_dir=native_dir,
                    dataset_type=fot.FiftyOneDataset,
                    name=invalid_revision_name,
                )
            self.assertFalse(fo.dataset_exists(invalid_revision_name))

            exported_metadata["version"] = MEDIA_REFERENCE_DATASET_REVISION
            with open(metadata_path, "w") as file:
                json.dump(exported_metadata, file)

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
    def test_native_thin_does_not_require_an_asset_materializer(self):
        dataset = fo.Dataset()
        reference = _UnmaterializedMediaReference("logical-only")
        dataset.add_sample(fo.Sample.from_media_reference(reference))

        with tempfile.TemporaryDirectory() as temp_dir:
            thin_dir = os.path.join(temp_dir, "thin")
            materialized_dir = os.path.join(temp_dir, "materialized")
            dataset.export(
                export_dir=thin_dir,
                dataset_type=fot.FiftyOneDataset,
                export_media=False,
            )
            imported = fo.Dataset.from_dir(
                dataset_dir=thin_dir,
                dataset_type=fot.FiftyOneDataset,
            )
            self.assertEqual(imported.first().media_reference, reference)

            with open(os.path.join(thin_dir, "media_sources.json")) as file:
                manifest = json.load(file)

            self.assertEqual(manifest, {"version": "1", "sources": []})

            with self.assertRaises(UnsupportedMediaReferenceOperation):
                dataset.export(
                    export_dir=materialized_dir,
                    dataset_type=fot.FiftyOneDataset,
                    export_media=True,
                )

            self.assertFalse(os.path.exists(materialized_dir))

    def test_asset_lifecycle_surface_is_private(self):
        sample = fo.Sample.from_media_reference(_make_reference(1))
        for name in (
            "get_media_asset_plan",
            "get_media_asset_capabilities",
            "materialize_media_assets",
        ):
            self.assertFalse(hasattr(fo.Dataset, name))

        for name in (
            "MediaAssetCapabilities",
            "MediaAssetManifest",
            "MediaAssetMaterializer",
            "MediaAssetPlan",
            "MediaAssetUsage",
            "MediaResolver",
            "MediaSourceDescriptor",
            "PlannedMediaAsset",
            "ResolvedMediaAsset",
            "get_media_asset_materializer",
            "get_media_export_planner",
            "get_media_reference_kind",
            "get_media_resolver",
            "get_selected_media_asset_key",
            "get_shared_media_asset_key",
            "register_media_asset_materializer",
            "register_media_export_planner",
            "register_media_resolver",
        ):
            self.assertFalse(hasattr(fo, name))

        self.assertEqual(
            fo.get_logical_media_identity(sample), sample.media_reference.key
        )

    @drop_datasets
    def test_from_dir_cleanup_is_scoped_to_atomic_importers(self):
        with tempfile.TemporaryDirectory() as dataset_dir:
            name = "non-atomic-import-failure"
            with mock.patch.object(
                fo.Dataset,
                "add_importer",
                side_effect=RuntimeError("legacy importer failed"),
            ), self.assertRaisesRegex(RuntimeError, "legacy importer failed"):
                fo.Dataset.from_dir(
                    dataset_dir=dataset_dir,
                    dataset_type=fot.ImageDirectory,
                    name=name,
                )

            self.assertTrue(fo.dataset_exists(name))
            fo.delete_dataset(name)

    @drop_datasets
    def test_duplicate_merge_and_homogeneous_identity_guards(self):
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

        destination.merge_samples(
            [
                fo.Sample.from_media_reference(
                    _make_reference(1), value="generic"
                ),
                fo.Sample.from_media_reference(
                    _make_reference(2), value="inserted"
                ),
            ]
        )
        self.assertEqual(len(destination), 2)
        self.assertEqual(destination[_make_reference(1).key].value, "generic")
        destination.merge_samples(
            [
                fo.Sample.from_media_reference(
                    _make_reference(3), value="projected"
                )
            ],
            fields=["value"],
        )
        projected = destination[_make_reference(3).key]
        self.assertEqual(projected.media_reference, _make_reference(3))
        self.assertEqual(projected.media_type, "multimodal")

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
        self.assertEqual(len(destination), 3)

        reference_dataset = fo.Dataset()
        reference_dataset.add_sample(
            fo.Sample.from_media_reference(_make_reference(2))
        )
        reference_config = reference_dataset.app_config.to_dict()
        with self.assertRaisesRegex(ValueError, "cannot mix"):
            reference_dataset.add_sample(fo.Sample(filepath="/tmp/mixed.mcap"))
        self.assertEqual(len(reference_dataset), 1)
        self.assertEqual(
            reference_dataset.app_config.to_dict(), reference_config
        )

        filepath_dataset = fo.Dataset()
        filepath_dataset.add_sample(fo.Sample(filepath="/tmp/mixed.mcap"))
        filepath_config = filepath_dataset.app_config.to_dict()
        indexes_before = filepath_dataset.get_index_information()
        with self.assertRaisesRegex(ValueError, "cannot mix"):
            filepath_dataset.add_sample(
                fo.Sample.from_media_reference(_make_reference(2))
            )
        self.assertEqual(len(filepath_dataset), 1)
        self.assertEqual(
            filepath_dataset.app_config.to_dict(), filepath_config
        )
        self.assertEqual(
            filepath_dataset.get_index_information(), indexes_before
        )

        other_envelope = serialize_media_reference(_make_reference(3))
        other_envelope["kind"] = "other-reference-kind"
        other_envelope["key"] = "other-reference-kind:3"
        other = fo.Sample._from_media_reference_envelope(other_envelope)
        with self.assertRaisesRegex(ValueError, "multiple reference kinds"):
            reference_dataset.add_sample(other)
        self.assertEqual(len(reference_dataset), 1)

        destination_value = destination.first().value
        with self.assertRaisesRegex(ValueError, "must be inserted by merging"):
            destination.merge_samples(
                [
                    fo.Sample.from_media_reference(
                        _make_reference(1), value="duplicate"
                    )
                ],
                key_fcn=lambda sample: "another-record",
            )
        self.assertEqual(len(destination), 3)
        self.assertEqual(destination.first().value, destination_value)

        collection_source = fo.Dataset()
        collection_source.add_sample(
            fo.Sample.from_media_reference(
                _make_reference(1), join_key="another-record"
            )
        )
        indexes_before = destination.get_index_information()
        with self.assertRaisesRegex(ValueError, "must be inserted by merging"):
            destination.merge_samples(
                collection_source,
                key_field="join_key",
            )
        self.assertEqual(len(destination), 3)
        self.assertEqual(destination.get_index_information(), indexes_before)

    @drop_datasets
    def test_duplicate_batches_fail_before_mutation(self):
        dataset = fo.Dataset()
        version = dataset._doc.version
        media_type = dataset.media_type
        field_names = set(dataset.get_field_schema())
        app_config = dataset.app_config.to_dict()
        indexes = dataset.get_index_information()
        samples = [
            fo.Sample.from_media_reference(_make_reference(index))
            for index in (0, 1, 2, 0)
        ]

        with self.assertRaisesRegex(ValueError, "duplicate"):
            dataset.add_samples(samples)

        self.assertEqual(len(dataset), 0)
        self.assertEqual(dataset._doc.version, version)
        self.assertEqual(dataset.media_type, media_type)
        self.assertEqual(set(dataset.get_field_schema()), field_names)
        self.assertIsNone(dataset._doc.media_reference_kind)
        self.assertEqual(dataset.app_config.to_dict(), app_config)
        self.assertEqual(dataset.get_index_information(), indexes)

        dataset.add_sample(fo.Sample.from_media_reference(_make_reference(5)))
        with self.assertRaisesRegex(ValueError, "duplicate"):
            dataset.add_samples(
                [
                    fo.Sample.from_media_reference(_make_reference(6)),
                    fo.Sample.from_media_reference(_make_reference(7)),
                    fo.Sample.from_media_reference(_make_reference(5)),
                ],
                batcher=partial(fou.StaticBatcher, batch_size=2),
            )
        self.assertEqual(_reference_keys(dataset), [_make_reference(5).key])

        with self.assertRaisesRegex(ValueError, "duplicate"):
            dataset.merge_samples(
                (
                    fo.Sample.from_media_reference(_make_reference(index))
                    for index in (6, 7, 6)
                )
            )
        self.assertEqual(_reference_keys(dataset), [_make_reference(5).key])

    @drop_datasets
    def test_failed_later_batch_rolls_back_capability_and_records(self):
        dataset = fo.Dataset()
        version = dataset._doc.version
        media_type = dataset.media_type
        field_names = set(dataset.get_field_schema())
        app_config = dataset.app_config.to_dict()
        indexes = dataset.get_index_information()
        original_add_batch = fo.Dataset._add_samples_batch
        calls = 0

        def add_batch(current_dataset, batch):
            nonlocal calls
            calls += 1
            if calls == 1:
                return original_add_batch(current_dataset, batch)

            raise ValueError("concurrent duplicate")

        samples = [
            fo.Sample.from_media_reference(_make_reference(index))
            for index in range(3)
        ]
        with mock.patch.object(
            fo.Dataset,
            "_add_samples_batch",
            new=add_batch,
        ), self.assertRaisesRegex(ValueError, "concurrent duplicate"):
            dataset.add_samples(
                samples,
                batcher=partial(fou.StaticBatcher, batch_size=2),
            )

        self.assertEqual(len(dataset), 0)
        self.assertEqual(dataset._doc.version, version)
        self.assertEqual(dataset.media_type, media_type)
        self.assertEqual(set(dataset.get_field_schema()), field_names)
        self.assertIsNone(dataset._doc.media_reference_kind)
        self.assertEqual(dataset.app_config.to_dict(), app_config)
        self.assertEqual(dataset.get_index_information(), indexes)

    @drop_datasets
    def test_closing_add_generator_preserves_completed_batches(self):
        dataset = fo.Dataset()
        sample_ids = dataset.add_samples(
            [
                fo.Sample.from_media_reference(_make_reference(index))
                for index in range(3)
            ],
            batcher=partial(fou.StaticBatcher, batch_size=1),
            generator=True,
        )

        first_batch = next(sample_ids)
        sample_ids.close()

        self.assertEqual(len(first_batch), 1)
        self.assertEqual(len(dataset), 1)
        self.assertEqual(
            dataset.first().media_reference.key, _make_reference(0).key
        )
        self.assertEqual(
            dataset._doc.version, MEDIA_REFERENCE_DATASET_REVISION
        )

    @drop_datasets
    def test_failed_collection_merge_rolls_back_reference_adoption(self):
        source = fo.Dataset()
        source.add_sample(fo.Sample.from_media_reference(_make_reference(1)))
        destination = fo.Dataset()
        version = destination._doc.version
        app_config = destination.app_config.to_dict()
        indexes = destination.get_index_information()

        def fail_after_partial_insert(samples, dataset, *args, **kwargs):
            document = samples._sample_collection.find_one({})
            document.pop("_id")
            document["_dataset_id"] = dataset._doc.id
            dataset._sample_collection.insert_one(document)
            raise RuntimeError("merge failed")

        with mock.patch(
            "fiftyone.core.dataset._merge_samples_pipeline",
            side_effect=fail_after_partial_insert,
        ), self.assertRaisesRegex(RuntimeError, "merge failed"):
            destination.merge_samples(source)

        self.assertEqual(len(destination), 0)
        self.assertEqual(destination._doc.version, version)
        self.assertIsNone(destination._doc.media_reference_kind)
        self.assertEqual(destination.app_config.to_dict(), app_config)
        self.assertEqual(destination.get_index_information(), indexes)

    @drop_datasets
    def test_reference_add_collection_and_migration_compatibility(self):
        source = fo.Dataset()
        source.add_sample(
            fo.Sample.from_media_reference(_make_reference(1), value="source")
        )
        destination = fo.Dataset()
        destination.add_sample(
            fo.Sample.from_media_reference(
                _make_reference(0), value="destination"
            )
        )

        added_ids = destination.add_collection(source)

        self.assertEqual(len(added_ids), 1)
        self.assertEqual(
            set(_reference_keys(destination)),
            {_make_reference(0).key, _make_reference(1).key},
        )
        self.assertFalse(fomi.needs_migration(name=destination.name))
        fomi.migrate_dataset_if_necessary(destination.name)
        self.assertEqual(
            destination._doc.version, MEDIA_REFERENCE_DATASET_REVISION
        )

        collection = foo.get_db_conn().datasets
        collection.update_one(
            {"_id": destination._doc.id},
            {"$set": {"media_reference_kind": None}},
        )
        with self.assertRaises(EnvironmentError):
            fomi.needs_migration(name=destination.name)
        collection.update_one(
            {"_id": destination._doc.id},
            {"$set": {"media_reference_kind": "lerobot-episode"}},
        )
        with mock.patch("fiftyone.migrations.runner.foc.VERSION", "2.1.0"):
            self.assertFalse(
                fomi._is_media_reference_compatibility_revision(
                    destination.name
                )
            )

    @drop_datasets
    def test_reference_clone_remaps_saved_view_record_ids(self):
        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample.from_media_reference(_make_reference(index))
                for index in range(2)
            ]
        )
        selected = dataset.select([dataset.first().id])
        dataset.save_view("selected", selected)

        clone = dataset.clone()
        cloned_view = clone.load_saved_view("selected")

        self.assertEqual(len(cloned_view), 1)
        self.assertEqual(
            cloned_view.first().media_reference.key,
            dataset.first().media_reference.key,
        )
        self.assertNotEqual(cloned_view.first().id, dataset.first().id)

    @drop_datasets
    def test_empty_reference_dataset_reload_clone_and_legacy_index(self):
        dataset = fo.Dataset()
        dataset.add_sample(fo.Sample.from_media_reference(_make_reference(0)))
        name = dataset.name
        kind = dataset._doc.media_reference_kind

        dataset.clear()
        fo.Dataset._instances.pop(name, None)
        reloaded = fo.load_dataset(name)
        self.assertEqual(len(reloaded), 0)
        self.assertEqual(reloaded._doc.media_reference_kind, kind)
        self.assertEqual(
            reloaded._doc.version, MEDIA_REFERENCE_DATASET_REVISION
        )

        with tempfile.TemporaryDirectory() as export_dir:
            reloaded.export(
                export_dir=export_dir,
                dataset_type=fot.FiftyOneDataset,
                export_media=True,
            )
            imported = fo.Dataset.from_dir(
                dataset_dir=export_dir,
                dataset_type=fot.FiftyOneDataset,
            )
            self.assertEqual(len(imported), 0)
            self.assertEqual(
                imported._doc.version, MEDIA_REFERENCE_DATASET_REVISION
            )
            self.assertEqual(imported._doc.media_reference_kind, kind)
            reference_index = imported.get_index_information()[
                "_media_reference.key"
            ]
            self.assertTrue(reference_index["unique"])
            self.assertTrue(reference_index["sparse"])

        delete_last = fo.Dataset()
        delete_last.add_sample(
            fo.Sample.from_media_reference(_make_reference(20))
        )
        delete_last.delete_samples(delete_last.first().id)
        fo.Dataset._instances.pop(delete_last.name, None)
        delete_last = fo.load_dataset(delete_last.name)
        self.assertEqual(len(delete_last), 0)
        self.assertEqual(delete_last._doc.media_reference_kind, kind)

        clone = reloaded.clone()
        fo.Dataset._instances.pop(clone.name, None)
        clone = fo.load_dataset(clone.name)
        self.assertEqual(len(clone), 0)
        self.assertEqual(clone._doc.media_reference_kind, kind)

        output = subprocess.check_output(
            [
                sys.executable,
                "-c",
                (
                    "import fiftyone as fo, sys; "
                    "dataset = fo.load_dataset(sys.argv[1]); "
                    "print(len(dataset)); dataset.delete()"
                ),
                clone.name,
            ],
            cwd=os.getcwd(),
            text=True,
            timeout=120,
        )
        self.assertEqual(output.strip().splitlines()[-1], "0")
        self.assertFalse(fo.dataset_exists(clone.name))

        legacy = fo.Dataset()
        old_revision = legacy._doc.version
        legacy.add_sample(fo.Sample.from_media_reference(_make_reference(10)))
        legacy._sample_collection.drop_index("_media_reference.key_1")
        legacy._doc.version = old_revision
        legacy._doc.media_reference_kind = None
        legacy._doc.sample_fields = [
            field
            for field in legacy._doc.sample_fields
            if field.name != "_media_reference"
        ]
        legacy._doc.save()
        legacy.add_sample(fo.Sample.from_media_reference(_make_reference(11)))
        reference_index = legacy.get_index_information()[
            "_media_reference.key"
        ]
        self.assertTrue(reference_index["unique"])
        self.assertTrue(reference_index["sparse"])
        self.assertIn(
            "_media_reference",
            {field.name for field in legacy._doc.sample_fields},
        )
        with self.assertRaisesRegex(ValueError, "duplicate"):
            legacy.add_sample(
                fo.Sample.from_media_reference(_make_reference(10))
            )

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
                dataset.set_values("media_reference", [_make_reference(2)])
            with self.assertRaises(UnsupportedMediaReferenceOperation):
                dataset.set_values("media_reference.key", ["replacement"])
            with self.assertRaises(UnsupportedMediaReferenceOperation):
                dataset.clear_sample_field("media_reference")
            with self.assertRaises(UnsupportedMediaReferenceOperation):
                dataset.rename_sample_field(
                    "media_reference", "other_media_reference"
                )
            with self.assertRaises(UnsupportedMediaReferenceOperation):
                dataset.clone_sample_field(
                    "media_reference", "other_media_reference"
                )
            with self.assertRaises(UnsupportedMediaReferenceOperation):
                dataset.delete_sample_field("media_reference")
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
