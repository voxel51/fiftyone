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
from fiftyone.multimodal.media import (
    LeRobotEpisode,
    MEDIA_REFERENCE_DATASET_REVISION,
    MediaReferenceError,
    UnsupportedMediaReferenceOperation,
    serialize_media_reference,
)


def _make_reference(episode_index, root="/tmp/lerobot"):
    return LeRobotEpisode(
        source_identity="hub:org/dataset@revision",
        dataset_root=root,
        episode_index=episode_index,
        codebase_version="v3.2",
        locator={"episode_index": episode_index},
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
        first = _make_reference(17, root="/one")
        relocated = _make_reference(17, root="/two")
        next_episode = _make_reference(18, root="/one")

        self.assertEqual(first.key, relocated.key)
        self.assertNotEqual(first.key, next_episode.key)
        self.assertEqual(first.display_name, "episode-000017")
        self.assertEqual(first.media_type, "multimodal")
        self.assertEqual(
            first.resolve_filepath(), os.path.join("/one", "meta", "info.json")
        )
        self.assertEqual(
            first.resolve_filepath(), next_episode.resolve_filepath()
        )
        self.assertEqual(pickle.loads(pickle.dumps(first)), first)

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
            "resolve_filepath",
            side_effect=AssertionError("iteration resolved physical media"),
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
                fo.Sample.from_media_reference(_make_reference(1, root=root))
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
                dataset.export(export_dir=os.path.join(root, "export"))

            live = dataset.first()
            dataset.delete_samples(live.id)
            self.assertFalse(live.in_dataset)
            self.assertEqual(
                live.media_reference.key, _make_reference(1, root=root).key
            )
            self.assertTrue(os.path.isfile(anchor))


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
