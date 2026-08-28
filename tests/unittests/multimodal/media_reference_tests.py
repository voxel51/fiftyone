"""
Logical media-reference sample tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from copy import deepcopy
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

from bson import ObjectId
from decorators import drop_datasets
from mongoengine import ValidationError

import fiftyone as fo
import fiftyone.core.dataset as fod
import fiftyone.core.fields as fof
import fiftyone.core.media as fom
import fiftyone.core.odm as foo
import fiftyone.core.utils as fou
import fiftyone.migrations as fomi
import fiftyone.multimodal.media as fomm
import fiftyone.types as fot
import fiftyone.utils.data as foud
from fiftyone.multimodal.media import (
    DatasetRelativeLocation,
    InvalidMediaLocationError,
    LeRobotEpisode,
    LeRobotV3Locator,
    MediaAsset,
    MediaAssetRole,
    MediaReference,
    MediaReferenceError,
    MissingMediaReferenceBindingError,
    RowInterval,
    StaleMediaReferenceError,
    UnsupportedMediaReferenceOperation,
    WholeFile,
    _MEDIA_REFERENCE_BINDINGS_COLLECTION,
    _get_selected_media_asset_key,
    _get_shared_media_asset_key,
    _hydrate_lerobot_episode,
    _serialize_media_reference_binding,
    _register_media_reference,
    _serialize_media_reference,
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
class _VideoMediaReference(MediaReference):
    identity: str

    @property
    def key(self):
        return "video:%s" % self.identity

    @property
    def media_type(self):
        return "video"

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


_register_media_reference(
    "test-alternate-reference",
    _AlternateMediaReference,
    lambda reference: {"identity": reference.identity},
    lambda payload: _AlternateMediaReference(payload["identity"]),
)
_register_media_reference(
    "test-image-reference",
    _ImageMediaReference,
    lambda reference: {"identity": reference.identity},
    lambda payload: _ImageMediaReference(payload["identity"]),
)
_register_media_reference(
    "test-video-reference",
    _VideoMediaReference,
    lambda reference: {"identity": reference.identity},
    lambda payload: _VideoMediaReference(payload["identity"]),
)
_register_media_reference(
    "test-unmaterialized-reference",
    _UnmaterializedMediaReference,
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
    def test_streaming_collection_parser_reads_trailing_input_to_eof(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = os.path.join(temp_dir, "samples.json")
            whitespace = " " * (128 * 1024)
            with open(path, "w") as file:
                file.write('{"samples":[{"value": 51}]}' + whitespace)

            samples, count = foo.import_collection(
                path, key="samples", stream=True
            )
            self.assertIsNone(count)
            self.assertEqual(list(samples), [{"value": 51}])

            with open(path, "w") as file:
                file.write(
                    '{"samples":[{"value": 51}]}' + whitespace + "unexpected"
                )

            samples, _ = foo.import_collection(
                path, key="samples", stream=True
            )
            with self.assertRaisesRegex(ValueError, "Malformed"):
                list(samples)

    def test_private_binding_queries_are_batched(self):
        keys = [
            "key-%d" % index
            for index in range(
                fomm._MEDIA_REFERENCE_BINDING_QUERY_BATCH_SIZE * 2 + 1
            )
        ]
        collection = mock.Mock()
        collection.find.side_effect = lambda query: [
            {"_id": key} for key in query["_id"]["$in"]
        ]

        bindings = fomm._find_media_reference_bindings(collection, keys)

        self.assertEqual(set(bindings), set(keys))
        self.assertEqual(collection.find.call_count, 3)
        self.assertTrue(
            all(
                len(call.args[0]["_id"]["$in"])
                <= fomm._MEDIA_REFERENCE_BINDING_QUERY_BATCH_SIZE
                for call in collection.find.call_args_list
            )
        )

    def test_lerobot_tests_skip_when_pyarrow_is_unavailable(self):
        test_path = os.path.join(os.path.dirname(__file__), "lerobot_tests.py")
        script = """
import os
import runpy
import sys

from _pytest.outcomes import Skipped

test_path = sys.argv[1]
sys.path.insert(0, os.path.dirname(os.path.dirname(test_path)))
sys.modules["pyarrow"] = None
sys.modules["pyarrow.parquet"] = None
try:
    runpy.run_path(test_path)
except Skipped:
    print("optional-pyarrow-skip")
else:
    raise AssertionError("LeRobot tests did not skip without pyarrow")
"""
        result = subprocess.run(
            [sys.executable, "-c", script, test_path],
            capture_output=True,
            check=True,
            cwd=os.getcwd(),
            text=True,
            timeout=30,
        )
        self.assertEqual(result.stdout.strip(), "optional-pyarrow-skip")

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

        filepath_sample = fo.Sample(filepath="sample.jpg")
        self.assertIsNone(filepath_sample.media_reference)

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

        binding = _serialize_media_reference_binding(reference)
        binding["payload"]["locator"]["data"]["row_groups"] = 0
        with self.assertRaisesRegex(
            MediaReferenceError, "episode data row groups"
        ):
            _hydrate_lerobot_episode(binding["payload"])

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
        reference = _make_reference(1)
        sample = fo.Sample(media_reference=reference, value=1)

        self.assertFalse(hasattr(fo.Sample, "from_media_reference"))
        self.assertIsNone(sample.filepath)
        self.assertNotIn("filepath", sample.field_names)
        self.assertIn("media_reference", sample.field_names)
        self.assertNotIn("filepath", sample.to_dict())
        self.assertEqual(
            set(sample.to_dict()["media_reference"]), {"kind", "key"}
        )
        self.assertEqual(sample.media_reference, reference)
        self.assertEqual(sample.get_media_key(), reference.key)
        self.assertEqual(sample["media_reference"], reference)
        self.assertEqual(sample.filename, "episode-000001")
        self.assertEqual(sample.media_type, "multimodal")
        sample.media_reference = _make_reference(2)
        self.assertEqual(sample.media_reference, _make_reference(2))
        self.assertEqual(sample.filename, "episode-000002")

        sample.set_field("media_reference", _make_reference(3))
        self.assertEqual(
            sample.get_field("media_reference"), _make_reference(3)
        )
        self.assertEqual(sample.get_media_key(), _make_reference(3).key)

        filepath_sample = fo.Sample(filepath="image.jpg")
        self.assertEqual(
            filepath_sample.get_media_key(), filepath_sample.filepath
        )

    def test_reassignment_validation_and_mutation_guards(self):
        sample = fo.Sample(media_reference=_make_reference(1), value=1)
        original = sample.media_reference

        for invalid in (
            None,
            {},
            _serialize_media_reference(_make_reference(2)),
        ):
            with self.subTest(invalid=invalid), self.assertRaises(TypeError):
                sample.media_reference = invalid

            self.assertEqual(sample.media_reference, original)

        with self.assertRaises(fom.MediaTypeError):
            sample.media_reference = _ImageMediaReference("other-media-type")

        self.assertEqual(sample.media_reference, original)
        with self.assertRaises(AttributeError):
            sample.set_field("media_reference.payload", {})
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
        filepath_sample = fo.Sample(filepath="image.jpg")
        with self.assertRaises(ValueError):
            filepath_sample.set_field("media_reference", _make_reference(2))
        with self.assertRaises(ValueError):
            filepath_sample.media_reference = _make_reference(2)
        with self.assertRaises(ValueError):
            filepath_sample["media_reference"] = _make_reference(2)

        with self.assertRaises(TypeError):
            # pylint: disable-next=no-value-for-parameter
            fo.Sample(media_reference={})
        with self.assertRaises(TypeError):
            # pylint: disable-next=no-value-for-parameter
            fo.Sample()

    def test_document_xor_validation(self):
        reference = _make_reference(1)
        both = foo.DatasetSampleDocument(
            filepath="/tmp/episode.mcap",
            media_reference=reference,
            _media_type="multimodal",
        )
        neither = foo.DatasetSampleDocument(_media_type="multimodal")

        with self.assertRaises((MediaReferenceError, ValidationError)):
            both.validate()
        with self.assertRaises((MediaReferenceError, ValidationError)):
            neither.validate()

    def test_sample_native_round_trip(self):
        sample = fo.Sample(media_reference=_make_reference(3), value=51)
        serialized = json.loads(json.dumps(sample.to_dict()))
        self.assertEqual(set(serialized["media_reference"]), {"kind", "key"})
        reloaded = fo.Sample.from_dict(serialized)

        self.assertEqual(reloaded.media_reference, sample.media_reference)
        self.assertEqual(reloaded.media_type, sample.media_type)
        self.assertEqual(reloaded.value, 51)

    @drop_datasets
    def test_private_binding_hydration_failures_are_typed_and_non_mutating(
        self,
    ):
        dataset = fo.Dataset()
        reference = _make_reference(8123)
        dataset.add_sample(fo.Sample(media_reference=reference))
        sample = dataset.first()
        self.assertEqual(sample.get_media_key(), reference.key)
        persisted = dataset._sample_collection.find_one({"_id": sample._id})
        bindings = foo.get_db_conn()[_MEDIA_REFERENCE_BINDINGS_COLLECTION]

        binding = bindings.find_one({"_id": reference.key})
        bindings.delete_one({"_id": reference.key})
        try:
            with self.assertRaises(MissingMediaReferenceBindingError):
                sample.reload()

            self.assertEqual(
                dataset._sample_collection.find_one({"_id": sample._id}),
                persisted,
            )

            bindings.insert_one(binding)
            bindings.update_one(
                {"_id": reference.key},
                {"$set": {"display_name": "stale-display-name"}},
            )
            with self.assertRaises(StaleMediaReferenceError):
                sample.reload()

            self.assertEqual(
                dataset._sample_collection.find_one({"_id": sample._id}),
                persisted,
            )
        finally:
            bindings.delete_one({"_id": reference.key})

    @drop_datasets
    def test_reload_rejects_missing_descriptor_without_mutating_sample(self):
        dataset = fo.Dataset()
        reference = _make_reference(8124)
        dataset.add_sample(fo.Sample(media_reference=reference))
        sample = dataset.first()
        persisted = dataset._sample_collection.find_one({"_id": sample._id})

        dataset._sample_collection.update_one(
            {"_id": sample._id}, {"$unset": {"media_reference": ""}}
        )
        try:
            with self.assertRaisesRegex(
                MediaReferenceError, "no longer contains"
            ):
                sample.reload()

            self.assertEqual(sample.media_reference, reference)
        finally:
            dataset._sample_collection.replace_one(
                {"_id": sample._id}, persisted
            )


class MediaReferenceDatasetTests(unittest.TestCase):
    def test_reference_merge_preflight_batches_destination_keys(self):
        source = mock.Mock(media_type=fom.IMAGE)
        destination = mock.Mock(media_type=fom.IMAGE)
        destination._dataset = destination
        destination._doc.media_reference_kind = "test-reference"
        key_count = (
            {
                "_id": "key-%d" % index,
                "count": 1,
            }
            for index in range(fod._REFERENCE_MERGE_KEY_BATCH_SIZE + 1)
        )
        with mock.patch.object(
            fod,
            "_iter_reference_merge_key_counts",
            side_effect=(key_count, iter(()), iter(())),
        ) as iter_counts:
            fod._validate_reference_merge_key_uniqueness(
                destination, source, "media_reference.key"
            )

        destination_calls = iter_counts.call_args_list[1:]
        self.assertEqual(len(destination_calls), 2)
        self.assertEqual(
            [len(call.kwargs["keys"]) for call in destination_calls],
            [fod._REFERENCE_MERGE_KEY_BATCH_SIZE, 1],
        )

    @drop_datasets
    def test_failed_reference_video_collection_merge_rolls_back_frames(self):
        source = fo.Dataset()
        sample = fo.Sample(media_reference=_VideoMediaReference("source"))
        sample.frames[1] = fo.Frame(label="frame")
        source.add_sample(sample)
        destination = fo.Dataset()
        destination._doc.reload()
        destination_document = destination._doc.to_dict()
        destination_indexes = destination.get_index_information()
        frame_collection = None
        merge_samples = fod._merge_samples_python

        def fail_after_merge(*args, **kwargs):
            nonlocal frame_collection
            merge_samples(*args, **kwargs)
            frame_collection = destination._frame_collection
            raise RuntimeError("late collection merge failure")

        with mock.patch.object(
            fod,
            "_merge_samples_python",
            side_effect=fail_after_merge,
        ), self.assertRaisesRegex(
            RuntimeError, "late collection merge failure"
        ):
            destination.merge_samples(source)

        self.assertEqual(len(destination), 0)
        self.assertEqual(frame_collection.count_documents({}), 0)
        self.assertEqual(destination._doc.to_dict(), destination_document)
        self.assertEqual(
            destination.get_index_information(), destination_indexes
        )

    @drop_datasets
    def test_reference_native_export_rejects_filepath_before_copy(self):
        dataset = fo.Dataset()
        sample_id = dataset.add_sample(
            fo.Sample(media_reference=_make_reference(9350))
        )
        dataset._sample_collection.update_one(
            {"_id": ObjectId(sample_id)},
            {
                "$set": {"filepath": "/private/do-not-copy.jpg"},
                "$unset": {"media_reference": ""},
            },
        )

        with tempfile.TemporaryDirectory() as temp_dir:
            output_dir = os.path.join(temp_dir, "output")
            with mock.patch.object(
                foud.MediaExporter,
                "export",
                side_effect=AssertionError(
                    "invalid filepath samples must fail before media copy"
                ),
            ) as export_media, self.assertRaisesRegex(
                ValueError, "contain filepath samples"
            ):
                dataset.export(
                    export_dir=output_dir,
                    dataset_type=fot.FiftyOneDataset,
                    export_media=True,
                )

            export_media.assert_not_called()
            self.assertFalse(os.path.exists(output_dir))

    @drop_datasets
    def test_loading_hydrates_each_reference_once(self):
        dataset = fo.Dataset()
        dataset.add_sample(fo.Sample(media_reference=_make_reference(8210)))

        with mock.patch.object(
            fomm,
            "_hydrate_media_reference",
            wraps=fomm._hydrate_media_reference,
        ) as hydrate:
            sample = dataset.first()

        self.assertEqual(sample.media_reference, _make_reference(8210))
        hydrate.assert_called_once()

    @drop_datasets
    def test_media_source_mode_is_authoritative_across_dataset_loads(self):
        reference_dataset = fo.Dataset()
        reference_name = reference_dataset.name
        self.assertEqual(
            fod._get_media_identity_mode(reference_dataset), "filepath"
        )
        fo.Dataset._instances.pop(reference_name, None)
        reference_writer = fo.load_dataset(reference_name)
        reference_writer.add_sample(
            fo.Sample(media_reference=_make_reference(1))
        )
        reference_dataset.reload()

        with self.assertRaisesRegex(ValueError, "cannot mix"):
            reference_dataset.add_sample(fo.Sample(filepath="sample.jpg"))
        with self.assertRaises(UnsupportedMediaReferenceOperation):
            reference_dataset.set_values("filepath", ["replacement.jpg"])

        stored = list(reference_dataset._sample_collection.find({}))
        self.assertEqual(len(stored), 1)
        self.assertNotIn("filepath", stored[0])
        self.assertIn("media_reference", stored[0])

        filepath_dataset = fo.Dataset()
        filepath_name = filepath_dataset.name
        self.assertEqual(
            fod._get_media_identity_mode(filepath_dataset), "filepath"
        )
        fo.Dataset._instances.pop(filepath_name, None)
        filepath_writer = fo.load_dataset(filepath_name)
        filepath_writer.add_sample(fo.Sample(filepath="sample.jpg"))
        filepath_dataset.reload()

        with self.assertRaisesRegex(ValueError, "cannot mix"):
            filepath_dataset.add_sample(
                fo.Sample(media_reference=_make_reference(2))
            )

        stored = list(filepath_dataset._sample_collection.find({}))
        self.assertEqual(len(stored), 1)
        self.assertEqual(
            stored[0].get("filepath"), os.path.abspath("sample.jpg")
        )
        self.assertNotIn("media_reference", stored[0])

    @drop_datasets
    def test_incompatible_reserved_schema_fails_before_migration(self):
        dataset = fo.Dataset()
        name = dataset.name
        database = foo.get_db_conn()
        persisted = database.datasets.find_one({"_id": dataset._doc.id})
        incompatible = deepcopy(persisted)
        media_reference_field = foo.SampleFieldDocument.from_field(
            foo.create_field("media_reference", fof.StringField)
        )
        incompatible["sample_fields"].append(media_reference_field.to_dict())
        database.datasets.replace_one({"_id": dataset._doc.id}, incompatible)
        fo.Dataset._instances.pop(name, None)
        try:
            with mock.patch.object(
                fomi, "migrate_dataset_if_necessary"
            ) as migrate:
                with self.assertRaisesRegex(ValueError, "incompatible schema"):
                    fo.load_dataset(name)

                migrate.assert_not_called()

            self.assertEqual(
                database.datasets.find_one({"_id": dataset._doc.id}),
                incompatible,
            )
        finally:
            database.datasets.replace_one({"_id": dataset._doc.id}, persisted)
            fo.Dataset._instances.pop(name, None)

    @drop_datasets
    def test_attached_whole_value_reassignment_and_reload(self):
        dataset = fo.Dataset()
        dataset.add_sample(
            fo.Sample(
                media_reference=_make_reference(1),
                metadata=fo.Metadata(size_bytes=51),
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
    def test_reassignment_allows_duplicates_and_rejects_incompatible_references(
        self,
    ):
        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(media_reference=_make_reference(1)),
                fo.Sample(media_reference=_make_reference(2)),
            ]
        )
        sample = dataset.first()
        persisted = dataset._sample_collection.find_one({"_id": sample._id})
        dataset_kind = dataset._doc.media_reference_kind

        sample.media_reference = _make_reference(2)
        sample.save()
        sample.reload()
        self.assertEqual(sample.media_reference, _make_reference(2))
        self.assertEqual(
            dataset.count_values("media_reference.key")[
                _make_reference(2).key
            ],
            2,
        )

        duplicate = dataset.last()
        duplicate_rand = duplicate._doc._rand
        self.assertNotEqual(sample._doc._rand, duplicate_rand)
        persisted = dataset._sample_collection.find_one({"_id": sample._id})

        dataset._doc.media_reference_kind = None
        dataset._doc.save()
        with self.assertRaisesRegex(ValueError, "incompatible"):
            sample.media_reference = _AlternateMediaReference("other-kind")

        self.assertEqual(
            dataset._sample_collection.find_one({"_id": sample._id}), persisted
        )
        self.assertEqual(sample.media_reference, _make_reference(2))
        dataset._doc.media_reference_kind = dataset_kind
        dataset._doc.save()

        with self.assertRaisesRegex(ValueError, "multiple reference kinds"):
            sample.media_reference = _AlternateMediaReference("other-kind")

        self.assertEqual(
            dataset._sample_collection.find_one({"_id": sample._id}), persisted
        )
        self.assertEqual(sample.media_reference, _make_reference(2))

    @drop_datasets
    def test_group_slice_compatibility_is_revalidated_on_assignment(self):
        group = fo.Group()
        dataset = fo.Dataset()
        dataset.add_sample(
            fo.Sample(
                media_reference=_make_reference(1), group=group.element("left")
            )
        )
        schema = dataset.get_field_schema()
        self.assertIn("media_reference", schema)
        self.assertNotIn("filepath", schema)
        grouped_schema = dataset.select_group_slices().get_field_schema()
        self.assertIn("media_reference", grouped_schema)
        self.assertNotIn("filepath", grouped_schema)
        sample = dataset.first()
        self.assertEqual(sample.get_media_key(), _make_reference(1).key)
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
            fo.Sample(
                media_reference=_make_reference(index), episode_index=index
            )
            for index in range(4)
        ]
        dataset.add_samples(samples)

        raw_samples = list(dataset._sample_collection.find())
        self.assertTrue(
            all("filepath" not in sample for sample in raw_samples)
        )
        self.assertEqual(
            len({sample["media_reference"]["key"] for sample in raw_samples}),
            4,
        )
        self.assertEqual(len({sample["_rand"] for sample in raw_samples}), 4)
        self.assertEqual(dataset.media_type, "multimodal")
        self.assertEqual(
            dataset.app_config.grid_media_field, "media_reference"
        )
        self.assertIn("media_reference", dataset.app_config.media_fields)
        reference_index = dataset.get_index_information()[
            "media_reference.key"
        ]
        self.assertFalse(reference_index.get("unique", False))
        self.assertTrue(reference_index["sparse"])
        self.assertNotIn("filepath", dataset.get_index_information())
        self.assertNotIn("filepath", dataset._get_default_indexes())
        self.assertIn(
            "media_reference", dataset._sample_doc_cls._get_default_fields()
        )
        self.assertNotIn(
            "filepath", dataset._sample_doc_cls._get_default_fields()
        )
        with self.assertRaises(ValueError):
            dataset.drop_index("media_reference.key")
        with self.assertRaises(ValueError):
            dataset.rename_sample_field("media_reference", "renamed")
        with self.assertRaises(ValueError):
            dataset.delete_sample_field("media_reference")

        private_schema = dataset.get_field_schema(include_private=True)
        public_schema = dataset.get_field_schema()
        self.assertNotIn("filepath", public_schema)
        self.assertIsInstance(
            public_schema["media_reference"], fof.MediaReferenceField
        )
        self.assertIsInstance(
            private_schema["media_reference"], fof.MediaReferenceField
        )
        self.assertIs(
            type(private_schema["media_reference"]), fof.MediaReferenceField
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
        self.assertEqual(
            [sample.get_media_key() for sample in selected],
            [sample.media_reference.key for sample in selected],
        )
        expected_keys = [
            reference.key for reference in map(_make_reference, range(4))
        ]
        self.assertEqual(dataset.values("media_reference.key"), expected_keys)
        self.assertEqual(
            len(dataset.match({"media_reference.kind": "lerobot-episode"})),
            4,
        )
        self.assertEqual(
            len(
                dataset.match(
                    {"media_reference.key": {"$in": expected_keys[1:3]}}
                )
            ),
            2,
        )
        serialized_reference = dataset.first().to_dict()["media_reference"]
        self.assertEqual(set(serialized_reference), {"kind", "key"})
        self.assertNotIn("filepath", dataset.first().to_dict())
        selected_schema = dataset.select_fields(
            "episode_index"
        ).get_field_schema()
        self.assertNotIn("filepath", selected_schema)
        self.assertIn("media_reference", selected_schema)
        self.assertEqual(
            dataset.select_fields("media_reference").first().media_reference,
            dataset.first().media_reference,
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
        self.assertEqual(copied._doc._rand, dataset.first()._doc._rand)
        self.assertEqual(
            view_copy.media_reference.key, dataset.first().media_reference.key
        )
        self.assertEqual(view_copy._doc._rand, dataset.first()._doc._rand)

        id_only_copy = dataset.first().copy(fields=["id"])
        self.assertIsNone(id_only_copy.id)
        self.assertEqual(
            id_only_copy.media_reference, dataset.first().media_reference
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
    def test_reference_index_repair_is_nonunique_and_scan_free(self):
        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(media_reference=_make_reference(index))
                for index in range(2)
            ]
        )
        index_name = next(
            name
            for name, index in dataset._sample_collection.index_information().items()
            if index.get("key") == [("media_reference.key", 1)]
        )
        dataset._sample_collection.drop_index(index_name)
        dataset._sample_collection.create_index(
            "media_reference.key", sparse=True, unique=True
        )
        dataset._reference_media_capable = False

        with mock.patch.object(
            dataset._sample_collection,
            "find_one",
            side_effect=AssertionError("index repair must not scan samples"),
        ):
            dataset._mark_media_reference_capable(
                dataset._doc.media_reference_kind
            )

        index = dataset.get_index_information()["media_reference.key"]
        self.assertTrue(index["sparse"])
        self.assertFalse(index.get("unique", False))

    @drop_datasets
    def test_dataset_native_dict_and_json_round_trips(self):
        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(media_reference=_make_reference(index))
                for index in (0, 0, 1)
            ]
        )
        expected_keys = _reference_keys(dataset)
        expected_rand = _private_values(dataset, "_rand")
        self.assertEqual(len(set(expected_rand)), 3)
        self.assertEqual(
            dataset.shuffle(seed=51).values("id"),
            dataset.shuffle(seed=51).values("id"),
        )
        self.assertEqual(len(dataset.take(2, seed=51)), 2)

        from_dict = fo.Dataset.from_dict(dataset.to_dict())
        self.assertEqual(_reference_keys(from_dict), expected_keys)
        self.assertEqual(len(set(_private_values(from_dict, "_rand"))), 3)

        with tempfile.TemporaryDirectory() as temp_dir:
            json_path = os.path.join(temp_dir, "dataset.json")
            dataset.write_json(json_path)
            from_json = fo.Dataset.from_json(json_path)

        self.assertEqual(_reference_keys(from_json), expected_keys)
        self.assertEqual(len(set(_private_values(from_json, "_rand"))), 3)

        with tempfile.TemporaryDirectory() as export_dir:
            native_dir = os.path.join(export_dir, "native")
            previous_umask = os.umask(0o027)
            try:
                dataset.export(
                    export_dir=native_dir,
                    dataset_type=fot.FiftyOneDataset,
                    export_media=False,
                )
            finally:
                os.umask(previous_umask)

            if os.name == "posix":
                self.assertEqual(os.stat(native_dir).st_mode & 0o777, 0o750)
            samples_path = os.path.join(native_dir, "samples.json")
            with open(samples_path) as file:
                exported_document = json.load(file)

            exported_samples = exported_document["samples"]

            self.assertTrue(
                all("filepath" not in sample for sample in exported_samples)
            )
            self.assertTrue(
                all("media_reference" in sample for sample in exported_samples)
            )

            imported = fo.Dataset.from_dir(
                dataset_dir=native_dir,
                dataset_type=fot.FiftyOneDataset,
            )

            destination = fo.Dataset()
            destination.add_sample(
                fo.Sample(media_reference=_make_reference(99))
            )
            importer, _ = foud.build_dataset_importer(
                fot.FiftyOneDataset, dataset_dir=native_dir
            )
            destination.add_importer(importer)
            self.assertEqual(len(destination), 4)
            self.assertEqual(
                destination._doc.media_reference_kind, "lerobot-episode"
            )
            self.assertFalse(
                destination.get_index_information()["media_reference.key"].get(
                    "unique", False
                )
            )

            binding_path = os.path.join(
                native_dir, "media_reference_bindings.json"
            )
            with open(binding_path) as file:
                bindings = json.load(file)["bindings"]

            self.assertEqual(len(bindings), 2)
            self.assertEqual(
                {binding["_id"] for binding in bindings},
                {
                    sample["media_reference"]["key"]
                    for sample in exported_samples
                },
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
    def test_native_thin_does_not_require_an_asset_materializer(self):
        dataset = fo.Dataset()
        reference = _UnmaterializedMediaReference("logical-only")
        dataset.add_sample(fo.Sample(media_reference=reference))

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

    @drop_datasets
    def test_failed_native_import_rolls_back_new_private_bindings(self):
        dataset = fo.Dataset()
        references = [_make_reference(9100), _make_reference(9101)]
        dataset.add_samples(
            [fo.Sample(media_reference=reference) for reference in references]
        )
        keys = [reference.key for reference in references]

        with tempfile.TemporaryDirectory() as export_dir:
            dataset.export(
                export_dir=export_dir,
                dataset_type=fot.FiftyOneDataset,
                export_media=False,
            )

            bindings = foo.get_db_conn()[_MEDIA_REFERENCE_BINDINGS_COLLECTION]
            bindings.delete_many({"_id": {"$in": keys}})

            samples_path = os.path.join(export_dir, "samples.json")
            with open(samples_path) as file:
                samples_document = json.load(file)

            samples_document["samples"][-1]["_media_type"] = "image"
            with open(samples_path, "w") as file:
                json.dump(samples_document, file)

            name = "failed-private-binding-import"
            with self.assertRaisesRegex(ValueError, "inconsistent"):
                fo.Dataset.from_dir(
                    dataset_dir=export_dir,
                    dataset_type=fot.FiftyOneDataset,
                    name=name,
                )

            self.assertFalse(fo.dataset_exists(name))
            self.assertEqual(
                bindings.count_documents({"_id": {"$in": keys}}), 0
            )

            destination = fo.Dataset()
            destination.add_sample(
                fo.Sample(media_reference=_make_reference(9200))
            )
            destination._doc.reload()
            destination_document = destination._doc.to_dict()
            destination_samples = list(destination._sample_collection.find({}))
            destination_indexes = destination.get_index_information()
            with self.assertRaisesRegex(ValueError, "inconsistent"):
                destination.add_dir(
                    dataset_dir=export_dir,
                    dataset_type=fot.FiftyOneDataset,
                )

            self.assertEqual(destination._doc.to_dict(), destination_document)
            self.assertEqual(
                list(destination._sample_collection.find({})),
                destination_samples,
            )
            self.assertEqual(
                destination.get_index_information(), destination_indexes
            )
            self.assertEqual(
                bindings.count_documents({"_id": {"$in": keys}}), 0
            )

            samples_document["samples"][-1]["_media_type"] = "multimodal"
            with open(samples_path, "w") as file:
                json.dump(samples_document, file)

            with mock.patch.object(
                foud.FiftyOneDatasetImporter,
                "_bind_imported_media_sources",
                side_effect=RuntimeError("late source binding failure"),
            ), self.assertRaisesRegex(
                RuntimeError, "late source binding failure"
            ):
                destination.add_dir(
                    dataset_dir=export_dir,
                    dataset_type=fot.FiftyOneDataset,
                )

            self.assertEqual(destination._doc.to_dict(), destination_document)
            self.assertEqual(
                list(destination._sample_collection.find({})),
                destination_samples,
            )
            self.assertEqual(
                destination.get_index_information(), destination_indexes
            )
            self.assertEqual(
                bindings.count_documents({"_id": {"$in": keys}}), 0
            )

    @drop_datasets
    def test_failed_native_video_import_rolls_back_frames(self):
        source = fo.Dataset()
        sample = fo.Sample(
            media_reference=_VideoMediaReference("late-failure")
        )
        sample.frames[1] = fo.Frame(label="frame")
        source.add_sample(sample)

        destination = fo.Dataset()
        existing = fo.Sample(media_reference=_VideoMediaReference("existing"))
        existing.frames[1] = fo.Frame(label="existing-frame")
        destination.add_sample(existing)
        destination._doc.reload()
        destination_document = destination._doc.to_dict()
        destination_samples = list(destination._sample_collection.find({}))
        destination_frames = list(destination._frame_collection.find({}))
        destination_indexes = destination.get_index_information()

        with tempfile.TemporaryDirectory() as export_dir:
            source.export(
                export_dir=export_dir,
                dataset_type=fot.FiftyOneDataset,
                export_media=False,
            )

            with mock.patch.object(
                foud.FiftyOneDatasetImporter,
                "_bind_imported_media_sources",
                side_effect=RuntimeError("late source binding failure"),
            ), self.assertRaisesRegex(
                RuntimeError, "late source binding failure"
            ):
                destination.add_dir(
                    dataset_dir=export_dir,
                    dataset_type=fot.FiftyOneDataset,
                )

        self.assertEqual(destination._doc.to_dict(), destination_document)
        self.assertEqual(
            list(destination._sample_collection.find({})),
            destination_samples,
        )
        self.assertEqual(
            list(destination._frame_collection.find({})),
            destination_frames,
        )
        self.assertEqual(
            destination.get_index_information(), destination_indexes
        )

    def test_asset_lifecycle_surface_is_private(self):
        sample = fo.Sample(media_reference=_make_reference(1))
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
            "get_logical_media_identity",
            "get_media_resolver",
            "get_selected_media_asset_key",
            "get_shared_media_asset_key",
            "register_media_asset_materializer",
            "register_media_export_planner",
            "register_media_resolver",
        ):
            self.assertFalse(hasattr(fo, name))

        self.assertEqual(sample.get_media_key(), sample.media_reference.key)

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
            fo.Sample(media_reference=_make_reference(1), value="source")
        )
        destination = fo.Dataset()
        destination.add_sample(
            fo.Sample(media_reference=_make_reference(1), value="destination")
        )
        destination.merge_samples(source)
        self.assertEqual(len(destination), 1)
        self.assertEqual(destination.first().value, "source")

        destination.merge_samples(
            [
                fo.Sample(media_reference=_make_reference(1), value="generic"),
                fo.Sample(
                    media_reference=_make_reference(2), value="inserted"
                ),
            ]
        )
        self.assertEqual(len(destination), 2)
        self.assertEqual(destination[_make_reference(1).key].value, "generic")
        destination.merge_samples(
            [fo.Sample(media_reference=_make_reference(3), value="projected")],
            fields=["value"],
        )
        projected = destination[_make_reference(3).key]
        self.assertEqual(projected.media_reference, _make_reference(3))
        self.assertEqual(projected.media_type, "multimodal")

        duplicate_id = destination.add_sample(
            fo.Sample(media_reference=_make_reference(1), value="duplicate")
        )
        self.assertEqual(len(destination), 4)
        duplicate_occurrences = list(
            destination.match({"media_reference.key": _make_reference(1).key})
        )
        self.assertEqual(len(duplicate_occurrences), 2)
        self.assertEqual(
            len({sample._doc._rand for sample in duplicate_occurrences}), 2
        )
        self.assertIn(
            duplicate_id, [sample.id for sample in duplicate_occurrences]
        )

        with self.assertRaisesRegex(ValueError, "multiple samples"):
            destination.merge_sample(
                fo.Sample(
                    media_reference=_make_reference(1), value="ambiguous"
                )
            )
        with self.assertRaisesRegex(ValueError, "duplicated.*destination"):
            destination.merge_samples(source)

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
        self.assertEqual(len(destination), 4)

        reference_dataset = fo.Dataset()
        reference_dataset.add_sample(
            fo.Sample(media_reference=_make_reference(2))
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
                fo.Sample(media_reference=_make_reference(2))
            )
        self.assertEqual(len(filepath_dataset), 1)
        self.assertEqual(
            filepath_dataset.app_config.to_dict(), filepath_config
        )
        self.assertEqual(
            filepath_dataset.get_index_information(), indexes_before
        )

        other = fo.Sample(
            media_reference=_AlternateMediaReference("other-kind")
        )
        with self.assertRaisesRegex(ValueError, "multiple reference kinds"):
            reference_dataset.add_sample(other)
        self.assertEqual(len(reference_dataset), 1)

        destination.merge_samples(
            [
                fo.Sample(
                    media_reference=_make_reference(1),
                    join_key="another-record",
                    value="custom-key-occurrence",
                )
            ],
            key_fcn=lambda sample: getattr(sample, "join_key", None),
        )
        self.assertEqual(len(destination), 5)
        self.assertEqual(
            destination.count_values("media_reference.key")[
                _make_reference(1).key
            ],
            3,
        )

    @drop_datasets
    def test_duplicate_batches_and_collections_preserve_every_occurrence(self):
        dataset = fo.Dataset()
        samples = [
            fo.Sample(media_reference=_make_reference(index))
            for index in (0, 1, 2, 0)
        ]

        sample_ids = dataset.add_samples(samples)
        self.assertEqual(len(sample_ids), 4)
        self.assertEqual(len(dataset), 4)
        self.assertEqual(
            _reference_keys(dataset).count(_make_reference(0).key), 2
        )
        self.assertEqual(
            len({sample._doc._rand for sample in dataset.iter_samples()}), 4
        )

        source = fo.Dataset()
        source.add_samples(
            [
                fo.Sample(media_reference=_make_reference(index))
                for index in (3, 3, 4)
            ]
        )
        added_ids = dataset.add_collection(source)
        self.assertEqual(len(added_ids), 3)
        self.assertEqual(len(dataset), 7)
        self.assertEqual(
            _reference_keys(dataset).count(_make_reference(3).key), 2
        )

        with self.assertRaisesRegex(ValueError, "duplicated.*source"):
            dataset.merge_samples(source)

        merged_by_id = fo.Dataset()
        merged_by_id.merge_samples(source, key_field="id")
        self.assertEqual(len(merged_by_id), 3)
        self.assertEqual(
            _reference_keys(merged_by_id).count(_make_reference(3).key), 2
        )

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

            current_dataset._sample_collection.create_index("unrelated")
            raise ValueError("concurrent duplicate")

        samples = [
            fo.Sample(media_reference=_make_reference(index))
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
        restored_indexes = dataset.get_index_information()
        self.assertIn("unrelated", restored_indexes)
        for name, info in indexes.items():
            self.assertEqual(restored_indexes[name], info)
        self.assertNotIn("media_reference.key", restored_indexes)

    @drop_datasets
    def test_closing_add_generator_preserves_completed_batches(self):
        dataset = fo.Dataset()
        sample_ids = dataset.add_samples(
            [
                fo.Sample(media_reference=_make_reference(index))
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

    @drop_datasets
    def test_failed_collection_merge_rolls_back_reference_adoption(self):
        source = fo.Dataset()
        source.add_sample(fo.Sample(media_reference=_make_reference(1)))
        destination = fo.Dataset()
        version = destination._doc.version
        app_config = destination.app_config.to_dict()
        indexes = destination.get_index_information()

        def fail_after_partial_insert(dataset, samples, *args, **kwargs):
            document = samples._sample_collection.find_one({})
            document.pop("_id")
            document["_dataset_id"] = dataset._doc.id
            dataset._sample_collection.insert_one(document)
            raise RuntimeError("merge failed")

        with mock.patch(
            "fiftyone.core.dataset._merge_samples_python",
            side_effect=fail_after_partial_insert,
        ), self.assertRaisesRegex(RuntimeError, "merge failed"):
            destination.merge_samples(source)

        self.assertEqual(len(destination), 0)
        self.assertEqual(destination._doc.version, version)
        self.assertIsNone(destination._doc.media_reference_kind)
        self.assertEqual(destination.app_config.to_dict(), app_config)
        self.assertEqual(destination.get_index_information(), indexes)

    @drop_datasets
    def test_reference_add_collection_preserves_normal_revision(self):
        source = fo.Dataset()
        source.add_samples(
            [
                fo.Sample(media_reference=_make_reference(1), value="source"),
                fo.Sample(media_reference=_make_reference(1), value="repeat"),
            ]
        )
        destination = fo.Dataset()
        destination.add_sample(
            fo.Sample(media_reference=_make_reference(0), value="destination")
        )

        added_ids = destination.add_collection(source)

        self.assertEqual(len(added_ids), 2)
        self.assertEqual(len(destination), 3)
        self.assertEqual(
            set(_reference_keys(destination)),
            {_make_reference(0).key, _make_reference(1).key},
        )
        self.assertEqual(
            _reference_keys(destination).count(_make_reference(1).key), 2
        )
        self.assertFalse(fomi.needs_migration(name=destination.name))
        fomi.migrate_dataset_if_necessary(destination.name)
        self.assertEqual(destination._doc.version, source._doc.version)

    @drop_datasets
    def test_reference_clone_remaps_saved_view_record_ids(self):
        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(media_reference=_make_reference(index))
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
    def test_empty_reference_dataset_reload_clone_and_index(self):
        dataset = fo.Dataset()
        dataset.add_sample(fo.Sample(media_reference=_make_reference(0)))
        name = dataset.name
        kind = dataset._doc.media_reference_kind

        dataset.clear()
        fo.Dataset._instances.pop(name, None)
        reloaded = fo.load_dataset(name)
        self.assertEqual(len(reloaded), 0)
        self.assertEqual(reloaded._doc.media_reference_kind, kind)

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
            self.assertEqual(imported._doc.media_reference_kind, kind)
            reference_index = imported.get_index_information()[
                "media_reference.key"
            ]
            self.assertFalse(reference_index.get("unique", False))
            self.assertTrue(reference_index["sparse"])

        delete_last = fo.Dataset()
        delete_last.add_sample(fo.Sample(media_reference=_make_reference(20)))
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

    @drop_datasets
    def test_guarded_file_operations_and_record_only_deletion(self):
        with tempfile.TemporaryDirectory() as root:
            os.makedirs(os.path.join(root, "meta"))
            anchor = os.path.join(root, "meta", "info.json")
            with open(anchor, "w") as file:
                json.dump({}, file)

            dataset = fo.Dataset()
            dataset.add_sample(fo.Sample(media_reference=_make_reference(1)))
            with self.assertRaises(UnsupportedMediaReferenceOperation):
                dataset.values("filepath")
            persisted = dataset._sample_collection.find_one()

            view = dataset.add_stage(
                fo.SetField("media_reference.key", fo.ViewField("id"))
            )
            with self.assertRaises(UnsupportedMediaReferenceOperation):
                view.save()

            with self.assertRaises(UnsupportedMediaReferenceOperation):
                dataset.add_stage(fo.SetField("filepath", fo.ViewField("id")))

            self.assertEqual(dataset._sample_collection.find_one(), persisted)

            dataset.set_field("tags", ["valid"]).save(fields=["tags"])
            self.assertEqual(dataset.first().tags, ["valid"])
            persisted = dataset._sample_collection.find_one()
            with self.assertRaises(UnsupportedMediaReferenceOperation):
                dataset.mongo(
                    [
                        {
                            "$set": {
                                "filepath": None,
                                "media_reference": None,
                                "tags": ["invalid"],
                            }
                        }
                    ]
                ).save(fields=["tags"])
            self.assertEqual(dataset.first().tags, ["valid"])

            view = dataset.add_stage(
                fo.SetField("media_reference.key", fo.ViewField("id"))
            )
            with self.assertRaises(UnsupportedMediaReferenceOperation):
                view.save(fields=["media_reference"])
            self.assertEqual(dataset._sample_collection.find_one(), persisted)

            with self.assertRaises(UnsupportedMediaReferenceOperation):
                dataset.set_values("filepath", ["/tmp/replacement.mcap"])
            with self.assertRaises(UnsupportedMediaReferenceOperation):
                dataset.set_field("filepath", fo.ViewField("episode_index"))
            with self.assertRaises(UnsupportedMediaReferenceOperation):
                dataset.clear_sample_field("filepath")
            with self.assertRaises(UnsupportedMediaReferenceOperation):
                dataset.set_values("media_reference", [{}])
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
            live = dataset.first()
            self.assertIsNone(live.metadata)
            with self.assertRaises(UnsupportedMediaReferenceOperation):
                live.compute_metadata(overwrite=True, skip_failures=True)
            live.reload()
            self.assertIsNone(live.metadata)
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
