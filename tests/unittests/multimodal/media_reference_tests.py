"""
Logical media-reference sample tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from copy import deepcopy
from typing import ClassVar
from functools import partial
import json
import os
import pickle
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

from bson import ObjectId
from decorators import drop_datasets
from mongoengine import InvalidDocumentError, ValidationError
from pymongo.errors import DuplicateKeyError

import fiftyone as fo
import fiftyone.core.dataset as fod
import fiftyone.core.fields as fof
import fiftyone.core.media as fom
import fiftyone.core.odm as foo
import fiftyone.core.utils as fou
import fiftyone.migrations as fomi
import fiftyone.multimodal.media_reference.field_model as fmm
from fiftyone.core.media_reference import MediaReference
from fiftyone.multimodal.media_reference.field_model import (
    InvalidMediaLocationError,
    MalformedMediaSourceError,
    MediaReferenceError,
    UnsupportedMediaReferenceOperation,
)
from fiftyone.utils.lerobot import (
    LEROBOT_EPISODE_KIND,
    LeRobotEpisodeReference,
)
import fiftyone.types as fot
import fiftyone.utils.data as foud

# One source key per kind: a sample's key names its source, and the source
# entry on the dataset is what says which kind that is.
_SOURCE_KEY = "a1b2c3d4e5f6"
_ALTERNATE_KEY = "b1b2c3d4e5f6"
_UNRESOLVABLE_KEY = "e1b2c3d4e5f6"

_ALTERNATE_KIND = "test-alternate-reference"
_UNRESOLVABLE_KIND = "test-unresolvable-reference"


def _key(reference):
    """The identity a test compares references by."""
    return reference.key


class _FakeMediaReference(MediaReference):
    """A reference with no resolver: everything about a sample's media
    identity, nothing about where its bytes are."""

    @classmethod
    def of(cls, source_id, identity, **coordinates):
        return cls(key="%s/%s" % (source_id, identity), **coordinates)

    @property
    def identity(self):
        return self.key.partition("/")[2]

    @property
    def display_name(self):
        return self.identity


class _AlternateMediaReference(_FakeMediaReference):
    @property
    def media_type(self):
        return "multimodal"


class _UnresolvableMediaReference(_FakeMediaReference):
    @property
    def media_type(self):
        return "multimodal"


def _make_reference(episode_index, source=_SOURCE_KEY):
    return LeRobotEpisodeReference.of(
        source,
        episode_index,
        data=[0, 0, episode_index, episode_index + 1],
        videos={"camera": [0, 0, float(episode_index), episode_index + 1.0]},
        tasks=["demo"],
    )


def _located(path):
    """A path as the platform resolves it. A recorded location is stored
    with forward slashes and the path a test spelled carries the platform's
    separators, case and drive; both resolve to the same place."""
    return os.path.normcase(os.path.realpath(path))


def _record_source(dataset, kind=LEROBOT_EPISODE_KIND, key=_SOURCE_KEY):
    """Records the source a test's references name. A reference-backed
    sample cannot join a dataset that records no source for its key."""
    dataset._record_media_sources(
        [fmm._media_source(kind, key, "/tmp/media-source-%s" % key)]
    )
    return dataset


def _reference_dataset(kind=LEROBOT_EPISODE_KIND, key=_SOURCE_KEY, **kwargs):
    return _record_source(fo.Dataset(**kwargs), kind=kind, key=key)


def _dataset_kind(dataset):
    """The kind a dataset records for its media sources."""
    sources = list(fmm._media_sources_by_id(dataset).values())
    return sources[0]["kind"] if sources else None


def _reference_of(raw_sample):
    """The reference on a raw Mongo sample document."""
    stored = raw_sample["media_reference"]
    return LeRobotEpisodeReference(key=stored["key"])


def _read_reference_key(sample):
    return _key(sample.media_reference)


def _mark_updated(sample):
    sample["updated"] = True


def _reference_keys(dataset):
    return [_key(sample.media_reference) for sample in dataset]


def _private_values(dataset, field_name):
    return [sample._doc.get_field(field_name) for sample in dataset]


class MediaReferenceDomainTests(unittest.TestCase):
    def test_streaming_collection_parser_reads_trailing_input_to_eof(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = os.path.join(temp_dir, "samples.json")
            whitespace = " " * (128 * 1024)
            with open(path, "w") as file:
                file.write('{"samples":[{"value": 51}]}' + whitespace)

            samples, count = foo.import_collection(path, key="samples")
            self.assertIsNone(count)
            self.assertEqual(list(samples), [{"value": 51}])

            with open(path, "w") as file:
                file.write(
                    '{"samples":[{"value": 51}]}' + whitespace + "unexpected"
                )

            samples, _ = foo.import_collection(path, key="samples")
            with self.assertRaisesRegex(ValueError, "Malformed"):
                list(samples)

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
        self.assertIn("optional-pyarrow-skip", result.stdout.splitlines())

    def test_stable_domain_identity_and_pickling(self):
        first = _make_reference(17)
        same_episode = _make_reference(17)
        next_episode = _make_reference(18)

        self.assertEqual(_key(first), _key(same_episode))
        self.assertNotEqual(_key(first), _key(next_episode))
        self.assertEqual(first.display_name, "episode-000017")
        self.assertEqual(first.media_type, "multimodal")
        self.assertEqual(first.source_id, next_episode.source_id)
        self.assertEqual(_key(first), "%s/17" % _SOURCE_KEY)
        self.assertEqual(first.episode, 17)
        self.assertEqual(pickle.loads(pickle.dumps(first)), first)

        filepath_sample = fo.Sample(filepath="sample.jpg")
        self.assertIsNone(filepath_sample.media_reference)

    def test_typed_asset_description_validation(self):
        invalid_paths = (
            "",
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
                fmm._validate_asset_path(path)

        # a path within a source carries no key: the key is on the reference
        self.assertEqual(
            fmm._validate_asset_path("meta/info.json"), "meta/info.json"
        )

    def test_unattached_whole_value_reassignment(self):
        reference = _make_reference(1)
        sample = fo.Sample(media_reference=reference, value=1)

        self.assertIsNone(sample.filepath)
        self.assertNotIn("filepath", sample.field_names)
        self.assertNotIn("filepath", sample.to_dict())
        self.assertEqual(
            sample.to_dict()["media_reference"]["key"], reference.key
        )
        self.assertEqual(sample.media_reference, reference)
        self.assertEqual(sample.get_media_key(), reference.key)
        self.assertEqual(sample.filename, "episode-000001")
        self.assertEqual(sample.media_type, "multimodal")
        sample.media_reference = _make_reference(2)
        self.assertEqual(sample.media_reference, _make_reference(2))
        self.assertEqual(sample.filename, "episode-000002")

        sample.media_reference = _make_reference(3)
        self.assertEqual(sample.media_reference, _make_reference(3))
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
            "%s/2" % _SOURCE_KEY,
        ):
            with self.subTest(invalid=invalid), self.assertRaises(TypeError):
                sample.media_reference = invalid

            self.assertEqual(sample.media_reference, original)

        self.assertEqual(sample.media_reference, original)
        with self.assertRaises(AttributeError):
            sample.set_field("media_reference.payload", {})
        with self.assertRaises(ValueError):
            sample.filepath = "/tmp/episode.mcap"

        stored = sample.media_reference
        with self.assertRaises(ValueError):
            stored.key = "ffffffffffff/2"

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
        # a sample stores the whole reference, and nothing about its source
        self.assertEqual(
            serialized["media_reference"]["key"], _make_reference(3).key
        )
        self.assertNotIn("loc", serialized["media_reference"])
        reloaded = fo.Sample.from_dict(serialized)

        # the reference round-trips whole; nothing has to resolve it
        self.assertIsInstance(
            reloaded.media_reference, LeRobotEpisodeReference
        )
        self.assertEqual(reloaded.media_reference, sample.media_reference)
        self.assertEqual(reloaded.media_type, sample.media_type)
        self.assertEqual(reloaded.value, 51)

    @drop_datasets
    def test_reload_uses_normal_backing_document_behavior(self):
        dataset = _reference_dataset()
        reference = _make_reference(8124)
        dataset.add_sample(fo.Sample(media_reference=reference))
        sample = dataset.first()
        persisted = dataset._sample_collection.find_one({"_id": sample._id})

        dataset._sample_collection.update_one(
            {"_id": sample._id}, {"$unset": {"media_reference": ""}}
        )
        try:
            sample.reload()
            self.assertIsNone(sample.media_reference)
        finally:
            dataset._sample_collection.replace_one(
                {"_id": sample._id}, persisted
            )
            sample.reload()


class MediaReferenceDatasetTests(unittest.TestCase):
    @drop_datasets
    def test_reference_merge_uses_standard_pipeline(self):
        source = _reference_dataset()
        source.add_sample(fo.Sample(media_reference=_make_reference(1)))
        destination = _reference_dataset()
        destination.add_sample(fo.Sample(media_reference=_make_reference(2)))

        merge = fod._merge_samples_pipeline
        with mock.patch.object(
            fod, "_merge_samples_pipeline", wraps=merge
        ) as merge_pipeline, mock.patch.object(
            fod,
            "_merge_samples_python",
            side_effect=AssertionError("collection merge used Python"),
        ):
            destination.merge_samples(source)

        merge_pipeline.assert_called_once()
        self.assertTrue(
            destination.get_index_information()["media_reference"].get(
                "unique", False
            )
        )

    @drop_datasets
    def test_reference_native_export_rejects_filepath_before_copy(self):
        dataset = _reference_dataset()
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
            self.assertTrue(os.path.isdir(output_dir))

    @drop_datasets
    def test_media_source_mode_is_authoritative_across_dataset_loads(self):
        reference_dataset = fo.Dataset()
        reference_name = reference_dataset.name
        self.assertEqual(
            fod._get_media_identity_mode(reference_dataset), "filepath"
        )
        _record_source(reference_dataset)
        fo.Dataset._instances.pop(reference_name, None)
        reference_writer = fo.load_dataset(reference_name)
        reference_writer.add_sample(
            fo.Sample(media_reference=_make_reference(1))
        )
        reference_dataset.reload()

        # a filepath sample cannot join a reference-backed dataset, and the
        # collection is left exactly as it was
        with self.assertRaises((ValueError, TypeError)):
            reference_dataset.add_sample(fo.Sample(filepath="sample.jpg"))
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

        with self.assertRaises((ValueError, TypeError)):
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
    def test_attached_whole_value_reassignment_and_reload(self):
        dataset = _reference_dataset()
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
        dataset = _reference_dataset()
        dataset.add_samples(
            [
                fo.Sample(media_reference=_make_reference(1)),
                fo.Sample(media_reference=_make_reference(2)),
            ]
        )
        sample = dataset.first()
        persisted = dataset._sample_collection.find_one({"_id": sample._id})

        sample.media_reference = _make_reference(2)
        sample.save()
        sample.reload()
        self.assertEqual(sample.media_reference, _make_reference(2))
        self.assertEqual(
            len(dataset.values("media_reference.key")),
            2,
        )

        duplicate = dataset.last()
        duplicate_rand = duplicate._doc._rand
        self.assertNotEqual(sample._doc._rand, duplicate_rand)
        persisted = dataset._sample_collection.find_one({"_id": sample._id})

        # a source the dataset does not record is refused outright
        with self.assertRaisesRegex(
            ValueError, "does not record media source"
        ):
            sample.media_reference = _AlternateMediaReference.of(
                _ALTERNATE_KEY, "other-kind"
            )

        self.assertEqual(
            dataset._sample_collection.find_one({"_id": sample._id}), persisted
        )
        self.assertEqual(sample.media_reference, _make_reference(2))

    @drop_datasets
    def test_group_slice_compatibility_is_revalidated_on_assignment(self):
        group = fo.Group()
        dataset = _reference_dataset()
        dataset.add_sample(
            fo.Sample(
                media_reference=_make_reference(1), group=group.element("left")
            )
        )
        self.assertNotIn("filepath", dataset.get_field_schema())
        self.assertNotIn(
            "filepath", dataset.select_group_slices().get_field_schema()
        )
        sample = dataset.first()
        self.assertEqual(sample.get_media_key(), sample.media_reference.key)
        persisted = dataset._sample_collection.find_one({"_id": sample._id})

        dataset._doc.group_media_types["left"] = "image"
        dataset.save()

        with self.assertRaises(fom.MediaTypeError):
            sample.media_reference = _make_reference(2)

        self.assertEqual(
            dataset._sample_collection.find_one({"_id": sample._id}), persisted
        )
        self.assertEqual(sample.media_reference, _make_reference(1))

        self.assertEqual(
            dataset._sample_collection.find_one({"_id": sample._id}), persisted
        )
        self.assertEqual(sample.media_reference, _make_reference(1))

    @drop_datasets
    def test_persistence_views_iteration_and_workflows(self):
        dataset = _reference_dataset()
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
        self.assertEqual(len({_key(_reference_of(s)) for s in raw_samples}), 4)
        self.assertEqual(len({sample["_rand"] for sample in raw_samples}), 4)
        self.assertEqual(dataset.media_type, "multimodal")
        reference_index = dataset.get_index_information()[
            "media_reference.key"
        ]
        self.assertFalse(reference_index.get("unique", False))
        self.assertTrue(reference_index["sparse"])
        self.assertNotIn("filepath", dataset.get_index_information())
        self.assertNotIn("filepath", dataset._get_default_indexes())
        with self.assertRaises(ValueError):
            dataset.drop_index("media_reference.key")
        with self.assertRaises(ValueError):
            dataset.rename_sample_field("media_reference", "renamed")
        with self.assertRaises(ValueError):
            dataset.delete_sample_field("media_reference")

        public_schema = dataset.get_field_schema()
        # the reference replaces the filepath as the sample's media identity
        self.assertNotIn("filepath", public_schema)
        self.assertIs(
            type(public_schema["media_reference"]), fof.MediaReferenceField
        )

        with mock.patch.object(
            fmm,
            "_resolve_media_references",
            side_effect=AssertionError("iteration resolved physical media"),
        ):
            loaded = list(dataset.iter_samples())
            selected = list(
                dataset.select_fields("episode_index").iter_samples()
            )

        self.assertEqual(
            [_key(sample.media_reference) for sample in loaded],
            [_key(sample.media_reference) for sample in selected],
        )
        self.assertEqual(
            [sample.get_media_key() for sample in selected],
            [sample.media_reference.key for sample in selected],
        )
        self.assertEqual(
            dataset.values("media_reference.key"),
            [_make_reference(index).key for index in range(4)],
        )
        self.assertEqual(
            len(
                dataset.match(
                    {
                        "media_reference.key": {
                            "$in": [_make_reference(i).key for i in (1, 2)]
                        }
                    }
                )
            ),
            2,
        )
        self.assertEqual(
            dataset.first().to_dict()["media_reference"]["key"],
            _make_reference(0).key,
        )
        self.assertNotIn("filepath", dataset.first().to_dict())
        selected_schema = dataset.select_fields(
            "episode_index"
        ).get_field_schema()
        self.assertNotIn("filepath", selected_schema)
        # a reference key names one sample, not its whole source
        reference_key = loaded[2].media_reference.key
        self.assertEqual(dataset[reference_key].id, loaded[2].id)
        self.assertEqual(
            dataset.limit(3)[loaded[0].media_reference.key].id, loaded[0].id
        )

        for sample in dataset.iter_samples(autosave=True):
            sample["autosaved"] = True
        self.assertEqual(dataset.count("autosaved"), 4)

        mapped = dict(
            dataset.map_samples(
                _read_reference_key,
                parallelize_method="thread",
                num_workers=2,
            )
        )
        self.assertEqual(
            set(mapped.values()),
            {_key(ref) for ref in map(_make_reference, range(4))},
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
            _key(copied.media_reference), _key(dataset.first().media_reference)
        )
        self.assertNotEqual(copied._doc._rand, dataset.first()._doc._rand)
        self.assertEqual(
            _key(view_copy.media_reference),
            _key(dataset.first().media_reference),
        )
        self.assertNotEqual(view_copy._doc._rand, dataset.first()._doc._rand)

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
        self.assertEqual(clone.values("id"), dataset.values("id"))

    @drop_datasets
    def test_reference_reload_does_not_repair_indexes(self):
        dataset = _reference_dataset()
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
            "media_reference", sparse=True, unique=True
        )
        with mock.patch.object(
            dataset._sample_collection,
            "create_index",
            side_effect=AssertionError("reload must not create indexes"),
        ), mock.patch.object(
            dataset._sample_collection,
            "drop_index",
            side_effect=AssertionError("reload must not drop indexes"),
        ):
            dataset.reload()

        index = dataset.get_index_information()["media_reference"]
        self.assertTrue(index["sparse"])
        self.assertTrue(index.get("unique", False))

    @drop_datasets
    def test_dataset_native_dict_and_json_round_trips(self):
        dataset = _reference_dataset()
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

        # a sample carries its key, never the assets the key names, so
        # serializing is flat in the number of samples
        with mock.patch.object(
            fmm,
            "_resolve_media_references",
            side_effect=AssertionError(
                "serialization resolved physical media"
            ),
        ):
            serialized = dataset.to_dict()

        self.assertEqual(
            [
                sample["media_reference"]["key"]
                for sample in serialized["samples"]
            ],
            expected_keys,
        )
        from_dict = fo.Dataset.from_dict(serialized)
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

            destination = _reference_dataset()
            destination.add_sample(
                fo.Sample(media_reference=_make_reference(99))
            )
            importer, _ = foud.build_dataset_importer(
                fot.FiftyOneDataset, dataset_dir=native_dir
            )
            destination.add_importer(importer)
            self.assertEqual(len(destination), 4)
            self.assertEqual(_dataset_kind(destination), "lerobot-episode")
            self.assertFalse(
                destination.get_index_information()["media_reference.key"].get(
                    "unique", False
                )
            )

        self.assertEqual(_reference_keys(imported), expected_keys)
        self.assertEqual(_private_values(imported, "_rand"), expected_rand)

    @drop_datasets
    def test_native_import_records_a_bundles_own_media_sources(self):
        bundled_key = "f1b2c3d4e5f6"
        dataset = _reference_dataset(key=bundled_key)
        dataset.add_samples(
            [
                fo.Sample(
                    media_reference=_make_reference(index, source=bundled_key)
                )
                for index in range(2)
            ]
        )

        with tempfile.TemporaryDirectory() as export_dir:
            native_dir = os.path.join(export_dir, "native")
            dataset.export(
                export_dir=native_dir,
                dataset_type=fot.FiftyOneDataset,
                export_media=False,
            )

            # a non-empty destination records a source of its own, so the
            # bundle's source is one it has never seen
            destination = _reference_dataset()
            destination.add_sample(
                fo.Sample(media_reference=_make_reference(99))
            )
            importer, _ = foud.build_dataset_importer(
                fot.FiftyOneDataset, dataset_dir=native_dir
            )
            destination.add_importer(importer)

        self.assertEqual(len(destination), 3)
        recorded = fmm._media_sources_by_id(destination)
        self.assertEqual(set(recorded), {_SOURCE_KEY, bundled_key})
        self.assertEqual(
            _located(recorded[bundled_key]["loc"]),
            _located("/tmp/media-source-%s" % bundled_key),
        )

    @drop_datasets
    def test_native_thin_does_not_require_a_media_resolver(self):
        dataset = _reference_dataset(
            kind=_UNRESOLVABLE_KIND, key=_UNRESOLVABLE_KEY
        )
        reference = _UnresolvableMediaReference.of(
            _UNRESOLVABLE_KEY, "logical-only"
        )
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

            self.assertEqual(
                manifest,
                {
                    "versions": {"ingest": fmm.INGEST_VERSION},
                    "sources": [
                        {
                            "kind": _UNRESOLVABLE_KIND,
                            "id": _UNRESOLVABLE_KEY,
                            "relative_root": None,
                        }
                    ],
                },
            )

            with self.assertRaises(UnsupportedMediaReferenceOperation):
                dataset.export(
                    export_dir=materialized_dir,
                    dataset_type=fot.FiftyOneDataset,
                    export_media=True,
                )

            self.assertTrue(os.path.isdir(materialized_dir))

    @drop_datasets
    def test_legacy_native_export_uses_media_exporter(self):
        dataset = _reference_dataset()
        dataset.add_samples(
            [
                fo.Sample(media_reference=_make_reference(index))
                for index in (0, 1)
            ]
        )

        with tempfile.TemporaryDirectory() as export_dir:
            dataset.export(
                export_dir=export_dir,
                dataset_type=fot.LegacyFiftyOneDataset,
                export_media=False,
            )

            with open(os.path.join(export_dir, "metadata.json")) as file:
                metadata = json.load(file)
            with open(os.path.join(export_dir, "samples.json")) as file:
                samples = json.load(file)["samples"]

            manifest_path = os.path.join(export_dir, "media_sources.json")
            self.assertTrue(os.path.isfile(manifest_path))
            with open(manifest_path) as file:
                manifest = json.load(file)

            # The kind is a property of the source, not of the dataset
            self.assertEqual(
                {source["kind"] for source in manifest["sources"]},
                {LEROBOT_EPISODE_KIND},
            )
            self.assertEqual(
                {source["id"] for source in manifest["sources"]},
                {_SOURCE_KEY},
            )
            self.assertTrue(
                all(
                    "media_reference" in sample and "filepath" not in sample
                    for sample in samples
                )
            )

    @drop_datasets
    def test_import_keeps_the_destination_source_it_already_records(self):
        source = _reference_dataset()
        source.add_sample(fo.Sample(media_reference=_make_reference(1)))

        destination = _reference_dataset()
        destination.add_sample(fo.Sample(media_reference=_make_reference(2)))
        destination._doc.reload()
        entries = list(fmm._media_sources_by_id(destination).values())
        roots = [dict(root) for root in destination._doc._media_roots]

        with tempfile.TemporaryDirectory() as export_dir:
            source.export(
                export_dir=export_dir,
                dataset_type=fot.FiftyOneDataset,
                export_media=False,
            )
            destination.add_dir(
                dataset_dir=export_dir, dataset_type=fot.FiftyOneDataset
            )

        # the imported samples resolve through the source the destination
        # already had, which covers every one of its episodes
        destination._doc.reload()
        self.assertEqual(len(destination), 2)
        self.assertEqual(
            list(fmm._media_sources_by_id(destination).values()), entries
        )
        self.assertEqual(
            [dict(root) for root in destination._doc._media_roots], roots
        )

    @drop_datasets
    def test_from_dir_preserves_standard_partial_dataset_behavior(self):
        with tempfile.TemporaryDirectory() as dataset_dir:
            name = "partial-import-failure"
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
        source = _reference_dataset()
        source.add_sample(
            fo.Sample(media_reference=_make_reference(1), value="source")
        )
        destination = _reference_dataset()
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
        projected = destination.match(
            {"media_reference.key": _make_reference(3).key}
        ).first()
        self.assertEqual(projected.media_reference, _make_reference(3))
        self.assertEqual(projected.media_type, "multimodal")

        with self.assertRaisesRegex(ValueError, "duplicate key"):
            destination.add_sample(
                fo.Sample(
                    media_reference=_make_reference(1), value="duplicate"
                )
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

        reference_dataset = _reference_dataset()
        reference_dataset.add_sample(
            fo.Sample(media_reference=_make_reference(2))
        )
        reference_config = reference_dataset.app_config.to_dict()
        self.assertEqual(len(reference_dataset), 1)
        self.assertEqual(
            reference_dataset.app_config.to_dict(), reference_config
        )

        custom_destination = _reference_dataset()
        custom_destination.add_sample(
            fo.Sample(media_reference=_make_reference(1))
        )
        custom_destination.merge_samples(
            [
                fo.Sample(
                    media_reference=_make_reference(1),
                    join_key="another-record",
                    value="custom-key-occurrence",
                )
            ],
            key_fcn=lambda sample: getattr(sample, "join_key", None),
        )
        self.assertEqual(len(custom_destination), 2)
        self.assertEqual(
            len(custom_destination.values("media_reference.key")),
            2,
        )

    @drop_datasets
    def test_duplicate_batches_and_collections_preserve_every_occurrence(self):
        dataset = _reference_dataset()
        samples = [
            fo.Sample(media_reference=_make_reference(index))
            for index in (0, 1, 2, 0)
        ]

        sample_ids = dataset.add_samples(samples)
        self.assertEqual(len(sample_ids), 4)
        self.assertEqual(len(dataset), 4)
        self.assertEqual(
            _reference_keys(dataset).count(_key(_make_reference(0))), 2
        )
        self.assertEqual(
            len({sample._doc._rand for sample in dataset.iter_samples()}), 4
        )

        source = _reference_dataset()
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
            _reference_keys(dataset).count(_key(_make_reference(3))), 2
        )

        with self.assertRaises(DuplicateKeyError):
            dataset.merge_samples(source)

        merged_by_id = fo.Dataset()
        merged_by_id.merge_samples(source, key_field="id")
        self.assertEqual(len(merged_by_id), 3)
        self.assertEqual(
            _reference_keys(merged_by_id).count(_key(_make_reference(3))), 2
        )

    @drop_datasets
    def test_failed_later_batch_preserves_completed_work(self):
        dataset = _reference_dataset()
        version = dataset._doc.version
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

        self.assertEqual(len(dataset), 2)
        self.assertEqual(dataset._doc.version, version)
        self.assertEqual(dataset.media_type, "multimodal")
        self.assertEqual(_dataset_kind(dataset), "lerobot-episode")
        restored_indexes = dataset.get_index_information()
        self.assertIn("unrelated", restored_indexes)
        self.assertIn("media_reference.key", restored_indexes)

    @drop_datasets
    def test_closing_add_generator_preserves_completed_batches(self):
        dataset = _reference_dataset()
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
            _key(dataset.first().media_reference), _key(_make_reference(0))
        )

    @drop_datasets
    def test_failed_collection_merge_preserves_completed_work(self):
        source = _reference_dataset()
        source.add_sample(fo.Sample(media_reference=_make_reference(1)))
        destination = fo.Dataset()
        merge_samples = fod._merge_samples_pipeline

        def fail_after_partial_insert(*args, **kwargs):
            merge_samples(*args, **kwargs)
            raise RuntimeError("merge failed")

        with mock.patch(
            "fiftyone.core.dataset._merge_samples_pipeline",
            side_effect=fail_after_partial_insert,
        ), self.assertRaisesRegex(RuntimeError, "merge failed"):
            destination.merge_samples(source)

        self.assertEqual(len(destination), 1)
        self.assertEqual(_dataset_kind(destination), "lerobot-episode")
        self.assertTrue(
            destination.get_index_information()["media_reference"].get(
                "unique", False
            )
        )

    @drop_datasets
    def test_reference_add_collection_preserves_normal_revision(self):
        source = _reference_dataset()
        source.add_samples(
            [
                fo.Sample(media_reference=_make_reference(1), value="source"),
                fo.Sample(media_reference=_make_reference(1), value="repeat"),
            ]
        )
        destination = _reference_dataset()
        destination.add_sample(
            fo.Sample(media_reference=_make_reference(0), value="destination")
        )

        added_ids = destination.add_collection(source)

        self.assertEqual(len(added_ids), 2)
        self.assertEqual(len(destination), 3)
        self.assertEqual(
            set(_reference_keys(destination)),
            {_key(_make_reference(0)), _key(_make_reference(1))},
        )
        self.assertEqual(
            _reference_keys(destination).count(_key(_make_reference(1))), 2
        )
        self.assertFalse(fomi.needs_migration(name=destination.name))
        fomi.migrate_dataset_if_necessary(destination.name)
        self.assertEqual(destination._doc.version, source._doc.version)

    @drop_datasets
    def test_reference_clone_preserves_saved_view_record_ids(self):
        dataset = _reference_dataset()
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
            _key(cloned_view.first().media_reference),
            _key(dataset.first().media_reference),
        )
        self.assertEqual(cloned_view.first().id, dataset.first().id)

    @drop_datasets
    def test_empty_reference_dataset_reload_clone_and_index(self):
        dataset = _reference_dataset()
        dataset.add_sample(fo.Sample(media_reference=_make_reference(0)))
        name = dataset.name
        kind = _dataset_kind(dataset)

        dataset.clear()
        fo.Dataset._instances.pop(name, None)
        reloaded = fo.load_dataset(name)
        self.assertEqual(len(reloaded), 0)
        self.assertEqual(_dataset_kind(reloaded), kind)

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
            self.assertEqual(_dataset_kind(imported), kind)
            reference_index = imported.get_index_information()[
                "media_reference.key"
            ]
            self.assertFalse(reference_index.get("unique", False))
            self.assertTrue(reference_index["sparse"])

        delete_last = _reference_dataset()
        delete_last.add_sample(fo.Sample(media_reference=_make_reference(20)))
        delete_last.delete_samples(delete_last.first().id)
        fo.Dataset._instances.pop(delete_last.name, None)
        delete_last = fo.load_dataset(delete_last.name)
        self.assertEqual(len(delete_last), 0)
        self.assertEqual(_dataset_kind(delete_last), kind)

        clone = reloaded.clone()
        fo.Dataset._instances.pop(clone.name, None)
        clone = fo.load_dataset(clone.name)
        self.assertEqual(len(clone), 0)
        self.assertEqual(_dataset_kind(clone), kind)

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
        self.assertIn("0", output.splitlines())
        self.assertFalse(fo.dataset_exists(clone.name))

    @drop_datasets
    def test_sources_read_the_same_way_are_stored_once(self):
        layout = dict(
            data_path="data/chunk-{chunk_index:03d}/f.parquet",
            video_path="videos/{video_key}/f.mp4",
            image_features=[],
        )
        source = lambda key, **fields: fmm._media_source(
            LEROBOT_EPISODE_KIND,
            key,
            "/tmp/sources/%s" % key,
            episode_shards=[{"path": "meta/e.parquet", "episodes": [0, 2]}],
            statistics=True,
            tasks=True,
            **{**layout, **fields},
        )

        dataset = fo.Dataset()
        dataset._record_media_sources([source("a"), source("b")])
        doc = dataset._doc
        self.assertEqual(len(doc._media_sources), 2)
        self.assertEqual(len(doc._media_source_layouts), 1)
        self.assertEqual(len(doc._media_roots), 1)

        # a stored source keeps only what is its own
        self.assertEqual(
            set(doc._media_sources[0]),
            {
                "id",
                "root",
                "dir",
                "layout",
                "episode_shards",
                "statistics",
                "tasks",
            },
        )

        # adding more of the same kind adds sources, not layouts
        dataset._record_media_sources([source("c"), source("d")])
        self.assertEqual(len(dataset._doc._media_sources), 4)
        self.assertEqual(len(dataset._doc._media_source_layouts), 1)

        # one read a different way is filed under its own layout
        dataset._record_media_sources(
            [source("e", video_path="videos/chunk-000/{video_key}/f.mp4")]
        )
        self.assertEqual(len(dataset._doc._media_source_layouts), 2)

        # and every caller still reads one self-contained description
        entries = fmm._media_sources_by_id(dataset)
        self.assertEqual(
            _located(entries["a"]["loc"]), _located("/tmp/sources/a")
        )
        self.assertEqual(entries["a"]["data_path"], layout["data_path"])
        self.assertEqual(entries["a"]["kind"], LEROBOT_EPISODE_KIND)
        self.assertTrue(entries["a"]["statistics"])

        # re-recording that source the way it is read repoints it, and the
        # layout nothing names any more goes
        dataset._record_media_sources([source("e", **layout)], overwrite=True)
        self.assertEqual(len(dataset._doc._media_source_layouts), 1)

    @drop_datasets
    def test_a_stored_source_entry_cannot_be_recorded_again(self):
        dataset = _reference_dataset()
        stored = dict(dataset._doc._media_sources[0])

        # it names the tables it is filed under rather than carrying them
        self.assertIn("layout", stored)
        with self.assertRaises(MalformedMediaSourceError):
            dataset._record_media_sources([stored])

    @drop_datasets
    def test_sources_are_read_only_when_something_resolves_media(self):
        dataset = _reference_dataset()
        dataset.add_sample(fo.Sample(media_reference=_make_reference(1)))
        name = dataset.name
        location = fmm._media_sources_by_id(dataset)[_SOURCE_KEY]["loc"]
        fo.Dataset._instances.pop(name, None)

        loaded = fo.load_dataset(name)

        # a dataset document is read on nearly every request and does not
        # carry what only media resolution needs
        self.assertEqual(loaded._doc._media_sources, [])
        self.assertEqual(loaded._doc._media_source_layouts, [])
        # but it still knows its samples are reference-backed, without asking
        self.assertTrue(loaded._contains_media_references())
        self.assertFalse(fo.Dataset()._contains_media_references())

        self.assertEqual(
            fmm._media_sources_by_id(loaded)[_SOURCE_KEY]["loc"], location
        )

        # what was only read back must not be written out again
        loaded.description = "touched"
        loaded.save()
        fo.Dataset._instances.pop(name, None)
        self.assertEqual(
            fmm._media_sources_by_id(fo.load_dataset(name))[_SOURCE_KEY][
                "loc"
            ],
            location,
        )

    @drop_datasets
    def test_serialized_round_trip_files_sources_under_the_copy_s_roots(self):
        dataset = _reference_dataset()
        _record_source(dataset, key="second-source")
        dataset.add_sample(fo.Sample(media_reference=_make_reference(1)))
        locations = {
            key: entry["loc"]
            for key, entry in fmm._media_sources_by_id(dataset).items()
        }

        # a serialized entry names where its source is, not the root id the
        # exporting dataset filed it under
        serialized = dataset.to_dict()
        self.assertTrue(
            all("loc" in entry for entry in serialized["_media_sources"])
        )

        copy = fo.Dataset.from_dict(serialized, name=dataset.name + "-copy")

        # the copy has to file them under its own roots, or every reference
        # it holds resolves to nothing
        self.assertEqual(
            {
                key: entry["loc"]
                for key, entry in fmm._media_sources_by_id(copy).items()
            },
            locations,
        )
        self.assertEqual(len(copy._doc._media_roots), 1)
        self.assertEqual(
            copy.first().media_reference.key,
            dataset.first().media_reference.key,
        )

    @drop_datasets
    def test_guarded_file_operations_and_record_only_deletion(self):
        with tempfile.TemporaryDirectory() as root:
            os.makedirs(os.path.join(root, "meta"))
            anchor = os.path.join(root, "meta", "info.json")
            with open(anchor, "w") as file:
                json.dump({}, file)

            dataset = _reference_dataset()
            dataset.add_sample(fo.Sample(media_reference=_make_reference(1)))
            with self.assertRaises(UnsupportedMediaReferenceOperation):
                dataset.values("filepath")
            persisted = dataset._sample_collection.find_one()

            # what matters is that the media identity cannot be overwritten
            with self.assertRaises(ValueError):
                dataset.add_stage(
                    fo.SetField("media_reference", fo.ViewField("id"))
                ).save()

            with self.assertRaises(ValueError):
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

            self.assertEqual(dataset._sample_collection.find_one(), persisted)

            with self.assertRaises(UnsupportedMediaReferenceOperation):
                dataset.set_values("filepath", ["/tmp/replacement.mcap"])
            # no operation may overwrite, rename or remove the media
            # identity; what matters is that it still resolves afterwards
            for operation in (
                lambda: dataset.set_field(
                    "filepath", fo.ViewField("episode_index")
                ),
                lambda: dataset.clear_sample_field("filepath"),
                lambda: dataset.set_values("media_reference", ["nope"]),
                lambda: dataset.clear_sample_field("media_reference"),
                lambda: dataset.rename_sample_field("media_reference", "x"),
                lambda: dataset.clone_sample_field("media_reference", "x"),
                lambda: dataset.delete_sample_field("media_reference"),
                dataset.compute_metadata,
            ):
                with self.assertRaises(ValueError):
                    operation()

            self.assertEqual(
                dataset.first().media_reference, _make_reference(1)
            )
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
            self.assertEqual(
                _key(live.media_reference), _key(_make_reference(1))
            )
            self.assertTrue(os.path.isfile(anchor))


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
