"""
FiftyOne dataset-related unit tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import time
from copy import deepcopy, copy
from datetime import date, datetime, timedelta
import gc
import os
import random
import string
import unittest
from unittest.mock import patch

from bson import ObjectId
from mongoengine import ValidationError
import numpy as np
import pytz

import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.fields as fof
import fiftyone.core.odm as foo
from fiftyone.operators.store import ExecutionStoreService
import fiftyone.utils.data as foud
from fiftyone import ViewField as F

from decorators import drop_datasets, skip_windows


class DatasetTests(unittest.TestCase):
    @drop_datasets
    def test_list_datasets(self):
        names = fo.list_datasets()
        self.assertIsInstance(names, list)

        root = "".join(random.choice(string.ascii_letters) for _ in range(64))

        fo.Dataset(root[:-1])
        fo.Dataset(root)
        fo.Dataset(root + "-foo")

        names = fo.list_datasets(root + "-*")
        self.assertEqual(len(names), 1)

        names = fo.list_datasets(root + "*")
        self.assertEqual(len(names), 2)

    @drop_datasets
    def test_dataset_names(self):
        dataset = fo.Dataset("test dataset names!?!")

        self.assertEqual(dataset.name, "test dataset names!?!")
        self.assertEqual(dataset.slug, "test-dataset-names")

        dataset.name = "test-dataset-names"

        self.assertEqual(dataset.name, "test-dataset-names")
        self.assertEqual(dataset.slug, "test-dataset-names")

        # name clashes
        with self.assertRaises(ValueError):
            fo.Dataset("test dataset names!?!")

        # slug clashes
        with self.assertRaises(ValueError):
            fo.Dataset("test dataset names!?!")

        dataset = fo.Dataset()
        name = dataset.name
        slug = dataset.slug

        # name clashes
        with self.assertRaises(ValueError):
            dataset.name = "test-dataset-names"

        self.assertEqual(dataset.name, name)
        self.assertEqual(dataset.slug, slug)

        # slug clashes
        with self.assertRaises(ValueError):
            dataset.name = "test dataset names!?!"

        self.assertEqual(dataset.name, name)
        self.assertEqual(dataset.slug, slug)

    @drop_datasets
    def test_load_dataset(self):
        new_dataset_name = "new-dataset-name"

        # validate that the dataset does not exist
        names = fo.list_datasets()
        assert new_dataset_name not in names

        # create the dataset by attempting to load it
        dataset = fo.load_dataset(new_dataset_name, create_if_necessary=True)
        assert dataset.name == new_dataset_name

        dataset2 = fo.load_dataset(new_dataset_name)
        self.assertIs(dataset, dataset2)

        # validate that the new dataset is in the list of datasets
        names = fo.list_datasets()
        assert new_dataset_name in names

        # validate that the dataset does not exist
        new_dataset_name_2 = "new-dataset-name-2"
        assert new_dataset_name_2 not in names

        # validate that the correct exception is raised
        with self.assertRaises(fo.DatasetNotFoundError):
            fo.load_dataset(new_dataset_name_2)

        # loading an existing dataset should work
        assert len(names) > 0
        for condition in [False, True]:
            dataset = fo.load_dataset(names[0], create_if_necessary=condition)
            assert dataset.name == names[0]

    @drop_datasets
    def test_delete_dataset(self):
        IGNORED_DATASET_NAMES = fo.list_datasets()

        def list_datasets():
            return [
                name
                for name in fo.list_datasets()
                if name not in IGNORED_DATASET_NAMES
            ]

        dataset_names = ["test_%d" % i for i in range(10)]

        datasets = {name: fo.Dataset(name) for name in dataset_names}
        self.assertListEqual(list_datasets(), dataset_names)

        name = dataset_names.pop(0)

        dataset = datasets[name]
        dataset_id = dataset._doc.id
        svc = ExecutionStoreService(dataset_id=dataset_id)
        store_name = "test_store"
        svc.set_key(store_name, "foo", "bar")
        keys = svc.list_keys(store_name)

        self.assertListEqual(keys, ["foo"])

        dataset.delete()

        self.assertListEqual(list_datasets(), dataset_names)
        keys = svc.list_keys(store_name)

        self.assertListEqual(keys, [])
        with self.assertRaises(ValueError):
            len(dataset)

        name = dataset_names.pop(0)

        fo.delete_dataset(name)

        self.assertListEqual(list_datasets(), dataset_names)
        with self.assertRaises(ValueError):
            len(datasets[name])

        new_dataset = fo.Dataset(name)

        self.assertEqual(len(new_dataset), 0)

    @drop_datasets
    def test_backing_doc_class(self):
        dataset_name = self.test_backing_doc_class.__name__
        dataset = fo.Dataset(dataset_name)
        self.assertTrue(
            issubclass(dataset._sample_doc_cls, foo.DatasetSampleDocument)
        )

    @drop_datasets
    def test_eq(self):
        dataset_name = self.test_eq.__name__

        dataset1 = fo.Dataset(dataset_name)
        dataset2 = fo.load_dataset(dataset_name)
        dataset3 = copy(dataset1)
        dataset4 = deepcopy(dataset1)

        self.assertEqual(dataset1, dataset2)
        self.assertEqual(dataset1, dataset3)
        self.assertEqual(dataset1, dataset4)

        # Datasets are singletons
        self.assertIs(dataset1, dataset2)
        self.assertIs(dataset1, dataset3)
        self.assertIs(dataset1, dataset4)

    @drop_datasets
    def test_last_loaded_at(self):
        dataset_name = self.test_dataset_info.__name__

        dataset = fo.Dataset(dataset_name)
        last_loaded_at1 = dataset.last_loaded_at

        also_dataset = fo.load_dataset(dataset_name)
        last_loaded_at2 = dataset.last_loaded_at

        self.assertIs(also_dataset, dataset)
        self.assertTrue(last_loaded_at2 > last_loaded_at1)

        dataset.reload()
        last_loaded_at3 = dataset.last_loaded_at

        self.assertTrue(last_loaded_at3 > last_loaded_at2)

    @drop_datasets
    def test_set_unknown_attribute(self):
        dataset_name = self.test_set_unknown_attribute.__name__

        dataset = fo.Dataset(dataset_name)
        self.assertRaises(AttributeError, setattr, dataset, "persistant", True)
        self.assertRaises(AttributeError, setattr, dataset, "somethingelse", 5)

    @drop_datasets
    def test_dataset_tags(self):
        dataset_name = self.test_dataset_tags.__name__

        dataset = fo.Dataset(dataset_name)

        self.assertEqual(dataset.tags, [])

        dataset.tags = ["cat", "dog"]

        dataset.reload()

        self.assertEqual(dataset.tags, ["cat", "dog"])

        # save() must be called to persist in-place edits
        dataset.tags.append("rabbit")

        dataset.reload()

        self.assertEqual(dataset.tags, ["cat", "dog"])

        # This will persist the edits
        dataset.tags.append("rabbit")
        dataset.save()

        dataset.reload()

        self.assertEqual(dataset.tags, ["cat", "dog", "rabbit"])

    @drop_datasets
    def test_dataset_description(self):
        dataset_name = self.test_dataset_description.__name__

        dataset = fo.Dataset(dataset_name)

        self.assertIsNone(dataset.description)

        dataset.description = "Hello, world!"

        dataset.reload()

        self.assertEqual(dataset.description, "Hello, world!")

    @drop_datasets
    def test_dataset_info(self):
        dataset_name = self.test_dataset_info.__name__

        dataset = fo.Dataset(dataset_name)

        self.assertEqual(dataset.info, {})
        self.assertIsInstance(dataset.info, dict)

        classes = ["cat", "dog"]

        dataset.info["classes"] = classes
        dataset.save()

        dataset.reload()

        self.assertTrue("classes" in dataset.info)
        self.assertEqual(classes, dataset.info["classes"])

    @drop_datasets
    def test_dataset_field_metadata(self):
        dataset = fo.Dataset()
        dataset.reload()

        check_time = dataset.created_at
        dataset.media_type = "video"

        dataset.add_sample_field("field1", fo.StringField)

        field = dataset.get_field("field1")
        self.assertIsNone(field.description)
        self.assertIsNone(field.info)
        self.assertGreater(field.created_at, check_time)
        check_time = field.created_at

        dataset.add_frame_field("field1", fo.StringField)

        field = dataset.get_field("frames.field1")
        self.assertIsNone(field.description)
        self.assertIsNone(field.info)
        self.assertGreater(field.created_at, check_time)
        check_time = field.created_at

        dataset.add_sample_field(
            "field2", fo.StringField, description="test", info={"foo": "bar"}
        )

        field = dataset.get_field("field2")
        self.assertEqual(field.description, "test")
        self.assertEqual(field.info, {"foo": "bar"})
        self.assertGreater(field.created_at, check_time)
        check_time = field.created_at

        dataset.add_frame_field(
            "field2",
            fo.StringField,
            description="test2",
            info={"foo2": "bar2"},
        )

        field = dataset.get_field("frames.field2")
        self.assertEqual(field.description, "test2")
        self.assertEqual(field.info, {"foo2": "bar2"})
        self.assertGreater(field.created_at, check_time)
        check_time = field.created_at

        sample = fo.Sample(
            filepath="video.mp4",
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="cat", bounding_box=[0, 0, 1, 1]),
                ]
            ),
        )
        sample.frames[1] = fo.Frame(
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="dog", bounding_box=[0, 0, 1, 1]),
                ]
            ),
        )

        dataset.add_sample(sample)

        # Implied field gets new created_at
        field = dataset.get_field("ground_truth")
        self.assertGreater(field.created_at, check_time)
        before_save_time = field.created_at

        # Save field, created_at shouldn't change
        field.description = "test"
        field.save()
        dataset.reload()
        self.assertEqual(field.created_at, before_save_time)

        field = dataset.get_field("ground_truth.detections.label")
        self.assertIsNone(field.description)
        self.assertIsNone(field.info)

        field.description = "test"
        field.info = {"foo": "bar"}
        field.save()

        dataset.reload()

        field = dataset.get_field("ground_truth.detections.label")
        self.assertEqual(field.description, "test")
        self.assertEqual(field.info, {"foo": "bar"})

        # Implied frame field gets new created_at
        field = dataset.get_field("frames.ground_truth")
        self.assertGreater(field.created_at, check_time)
        before_save_time = field.created_at

        # Save field, created_at shouldn't change
        field.description = "test"
        field.save()
        dataset.reload()
        self.assertEqual(field.created_at, before_save_time)

        field = dataset.get_field("frames.ground_truth.detections.label")
        self.assertIsNone(field.description)
        self.assertIsNone(field.info)

        field.description = "test2"
        field.info = {"foo2": "bar2"}
        field.save()

        dataset.reload()

        field = dataset.get_field("frames.ground_truth.detections.label")
        self.assertEqual(field.description, "test2")
        self.assertEqual(field.info, {"foo2": "bar2"})

        #
        # Updating fields retrieved from views is allowed
        #

        view = dataset.limit(1)

        field = dataset.get_field("field2")
        self.assertEqual(field.description, "test")
        self.assertEqual(field.info, {"foo": "bar"})

        field.description = None
        field.info = None
        field.save()

        dataset.reload()

        field = dataset.get_field("field2")
        self.assertIsNone(field.description)
        self.assertIsNone(field.info)

        # Updating fields retrieved from views is allowed
        field = dataset.get_field("frames.field2")
        self.assertEqual(field.description, "test2")
        self.assertEqual(field.info, {"foo2": "bar2"})

        field.description = None
        field.info = None
        field.save()

        dataset.reload()

        field = dataset.get_field("frames.field2")
        self.assertIsNone(field.description)
        self.assertIsNone(field.info)

        #
        # Datasets should automatically refresh upon save() errors
        #

        field = dataset.get_field("ground_truth.detections.label")

        with self.assertRaises(Exception):
            field.description = False
            field.save()

        field = dataset.get_field("ground_truth.detections.label")
        self.assertEqual(field.description, "test")

        with self.assertRaises(Exception):
            field.info = False
            field.save()

        field = dataset.get_field("ground_truth.detections.label")
        self.assertEqual(field.info, {"foo": "bar"})

        field = dataset.get_field("frames.ground_truth.detections.label")

        with self.assertRaises(Exception):
            field.description = False
            field.save()

        field = dataset.get_field("frames.ground_truth.detections.label")
        self.assertEqual(field.description, "test2")

        with self.assertRaises(Exception):
            field.info = False
            field.save()

        # Datasets should automatically refresh upon save() errors
        field = dataset.get_field("frames.ground_truth.detections.label")
        self.assertEqual(field.info, {"foo2": "bar2"})

    @drop_datasets
    def test_dataset_shared_field_metadata(self):
        """Test field metadata for default/shared fields"""
        dataset1 = fo.Dataset()
        dataset2 = fo.Dataset()

        f = dataset1.get_field("filepath")
        self.assertIsNot(f, dataset2.get_field("filepath"))

        # Save metadata on dataset1 field, should not show up in dataset2
        f.info = {"foo": "bar"}
        f.save()

        dataset2.reload()
        self.assertIsNone(dataset2.get_field("filepath").info)

        # Really fresh reload
        fo.Dataset._instances.clear()
        dataset2b = fo.load_dataset(dataset2.name)
        self.assertIsNone(dataset2b.get_field("filepath").info)

    @drop_datasets
    def test_dataset_app_config(self):
        dataset_name = self.test_dataset_app_config.__name__

        dataset = fo.Dataset(dataset_name)

        self.assertFalse(dataset.app_config.is_custom())
        self.assertListEqual(dataset.app_config.media_fields, ["filepath"])
        self.assertEqual(dataset.app_config.grid_media_field, "filepath")
        self.assertEqual(dataset.app_config.modal_media_field, "filepath")

        dataset.add_sample_field("thumbnail_path", fo.StringField)

        dataset.app_config.media_fields.append("thumbnail_path")
        dataset.app_config.grid_media_field = "thumbnail_path"
        dataset.save()

        dataset.reload()

        self.assertListEqual(
            dataset.app_config.media_fields, ["filepath", "thumbnail_path"]
        )
        self.assertEqual(dataset.app_config.grid_media_field, "thumbnail_path")

        dataset.rename_sample_field("thumbnail_path", "tp")

        self.assertListEqual(
            dataset.app_config.media_fields, ["filepath", "tp"]
        )
        self.assertEqual(dataset.app_config.grid_media_field, "tp")

        dataset.delete_sample_field("tp")

        self.assertListEqual(dataset.app_config.media_fields, ["filepath"])
        self.assertEqual(dataset.app_config.grid_media_field, "filepath")

    @drop_datasets
    def test_meta_dataset(self):
        dataset_name = self.test_meta_dataset.__name__
        dataset1 = fo.Dataset(dataset_name)

        field_name = "field1"
        ftype = fo.IntField

        dataset1.add_sample_field(field_name, ftype)
        fields = dataset1.get_field_schema()
        self.assertIsInstance(fields[field_name], ftype)

        dataset1b = fo.load_dataset(dataset_name)
        fields = dataset1b.get_field_schema()
        self.assertIsInstance(fields[field_name], ftype)

        dataset1.delete_sample_field("field1")
        with self.assertRaises(KeyError):
            fields = dataset1.get_field_schema()
            fields[field_name]

        with self.assertRaises(KeyError):
            dataset1b = fo.load_dataset(dataset_name)
            fields = dataset1b.get_field_schema()
            fields[field_name]

        dataset1c = fo.load_dataset(dataset_name)
        self.assertIs(dataset1c, dataset1)
        dataset1c = fo.load_dataset(dataset_name)
        self.assertIs(dataset1c, dataset1)

    @drop_datasets
    def test_last_modified_at(self):
        dataset = fo.Dataset()

        # datetimes like `created_at` are generated with microsecond precision
        # but only saved to mongo with millisecond precision, so reload to
        # trim off the microseconds
        dataset.reload()

        self.assertIsNotNone(dataset.created_at)
        self.assertIsNotNone(dataset.last_modified_at)
        self.assertIsNotNone(dataset.last_loaded_at)

        # dataset.save()

        created_at1 = dataset.created_at
        last_modified_at1 = dataset.last_modified_at

        dataset.info["foo"] = "bar"
        dataset.save()

        created_at2 = dataset.created_at
        last_modified_at2 = dataset.last_modified_at

        self.assertEqual(created_at2, created_at1)
        self.assertTrue(last_modified_at2 > last_modified_at1)

        # dataset.add_sample_field()

        created_at1 = dataset.created_at
        last_modified_at1 = dataset.last_modified_at

        dataset.add_sample_field("foo", fo.StringField)

        created_at2 = dataset.created_at
        last_modified_at2 = dataset.last_modified_at

        self.assertEqual(created_at2, created_at1)
        self.assertTrue(last_modified_at2 > last_modified_at1)

        # dataset.reload()

        created_at1 = dataset.created_at
        last_modified_at1 = dataset.last_modified_at
        last_loaded_at1 = dataset.last_loaded_at

        dataset.reload()

        created_at2 = dataset.created_at
        last_modified_at2 = dataset.last_modified_at
        last_loaded_at2 = dataset.last_loaded_at

        self.assertTrue(last_loaded_at2 > last_loaded_at1)
        self.assertEqual(created_at2, created_at1)
        self.assertEqual(last_modified_at2, last_modified_at1)

    @drop_datasets
    def test_indexes(self):
        dataset = fo.Dataset()

        sample = fo.Sample(
            filepath="image.png",
            field="hi",
            cls=fo.Classification(label="cat"),
        )
        dataset.add_sample(sample)

        info = dataset.get_index_information()
        indexes = dataset.list_indexes()
        default_indexes = {"id", "filepath", "created_at", "last_modified_at"}

        self.assertSetEqual(set(info.keys()), default_indexes)
        self.assertSetEqual(set(indexes), default_indexes)

        dataset.create_index("id", unique=True)  # already exists
        dataset.create_index("id")  # sufficient index exists
        with self.assertRaises(ValueError):
            dataset.drop_index("id")  # can't drop default

        dataset.create_index("filepath")  # already exists

        with self.assertRaises(ValueError):
            # can't upgrade default index to unique
            dataset.create_index("filepath", unique=True)

        with self.assertRaises(ValueError):
            dataset.drop_index("filepath")  # can't drop default index

        name = dataset.create_index("field")
        self.assertEqual(name, "field")
        self.assertIn("field", dataset.list_indexes())

        dataset.drop_index("field")
        self.assertNotIn("field", dataset.list_indexes())

        name = dataset.create_index("cls.label")
        self.assertEqual(name, "cls.label")
        self.assertIn("cls.label", dataset.list_indexes())

        dataset.drop_index("cls.label")
        self.assertNotIn("cls.label", dataset.list_indexes())

        compound_index_name = dataset.create_index([("id", 1), ("field", 1)])
        self.assertIn(compound_index_name, dataset.list_indexes())

        dataset.drop_index(compound_index_name)
        self.assertNotIn(compound_index_name, dataset.list_indexes())

        with self.assertRaises(ValueError):
            dataset.create_index("non_existent_field")

    @drop_datasets
    def test_index_stats(self):
        gt = fo.Detections(detections=[fo.Detection(label="foo")])
        sample = fo.Sample(filepath="video.mp4", gt=gt)
        sample.frames[1] = fo.Frame(gt=gt)

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        dataset.create_index("gt.detections.label")
        dataset.create_index("frames.gt.detections.label")

        info = dataset.get_index_information(include_stats=True)

        indexes = {
            "id",
            "filepath",
            "created_at",
            "last_modified_at",
            "gt.detections.label",
            "frames.id",
            "frames.created_at",
            "frames.last_modified_at",
            "frames._sample_id_1_frame_number_1",
            "frames.gt.detections.label",
        }

        self.assertSetEqual(set(dataset.list_indexes()), indexes)
        self.assertSetEqual(set(info.keys()), indexes)
        for d in info.values():
            self.assertTrue(d["size"] is not None)
            self.assertTrue("ops" in d["accesses"])
            self.assertTrue("since" in d["accesses"])

    @drop_datasets
    def test_index_in_progress(self):
        gt = fo.Detections(detections=[fo.Detection(label="foo")])
        sample = fo.Sample(filepath="video.mp4", gt=gt)
        sample.frames[1] = fo.Frame(gt=gt)

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        dataset.create_index("gt.detections.label")
        dataset.create_index("frames.gt.detections.label")

        sample_stats = dataset._sample_collstats()
        sample_stats["indexBuilds"] = ["gt.detections.label_1"]

        frame_stats = dataset._frame_collstats()
        frame_stats["indexBuilds"] = ["gt.detections.label_1"]

        with patch.object(
            fo.Dataset, "_sample_collstats", return_value=sample_stats
        ), patch.object(
            fo.Dataset, "_frame_collstats", return_value=frame_stats
        ):
            info = dataset.get_index_information(include_stats=True)
            for key in [
                "gt.detections.label",
                "frames.gt.detections.label",
            ]:
                self.assertTrue(info[key].get("in_progress"))

            stats = dataset.stats(include_indexes=True)
            self.assertTrue("indexes_in_progress" in stats)
            self.assertEqual(
                set(stats["indexes_in_progress"]),
                {"gt.detections.label", "frames.gt.detections.label"},
            )

    @drop_datasets
    def test_summary_fields(self):
        gt = fo.Detections(
            detections=[
                fo.Detection(label="foo", confidence=0.1),
                fo.Detection(label="foo", confidence=0.9),
                fo.Detection(label="bar", confidence=0.5),
            ]
        )
        sample1 = fo.Sample(filepath="video1.mp4", gt=gt)
        sample1.frames[1] = fo.Frame(gt=gt)
        sample1.frames[2] = fo.Frame()

        sample2 = fo.Sample(filepath="video2.mp4")

        dataset = fo.Dataset()
        dataset.add_samples([sample1, sample2])

        dataset.create_summary_field("gt.detections.label")
        dataset.create_summary_field("gt.detections.confidence")
        dataset.create_summary_field(
            "gt.detections.label",
            field_name="gt_label_counts",
            include_counts=True,
            read_only=False,
            create_index=False,
        )
        dataset.create_summary_field(
            "gt.detections.confidence",
            field_name="gt_confidence_by_label",
            group_by="label",
            read_only=False,
            create_index=False,
        )

        dataset.create_summary_field("frames.gt.detections.label")
        dataset.create_summary_field("frames.gt.detections.confidence")
        dataset.create_summary_field(
            "frames.gt.detections.label",
            field_name="frames_gt_label_counts",
            include_counts=True,
            read_only=False,
            create_index=False,
        )
        dataset.create_summary_field(
            "frames.gt.detections.confidence",
            field_name="frames_gt_confidence_by_label",
            group_by="label",
            read_only=False,
            create_index=False,
        )

        to_sets = lambda l: [set(x) if x is not None else x for x in l]

        self.assertListEqual(
            to_sets(dataset.values("gt_label")),
            [{"foo", "bar"}, None],
        )
        self.assertListEqual(
            dataset.values("gt_confidence"),
            [fo.DynamicEmbeddedDocument(min=0.1, max=0.9), None],
        )
        self.assertListEqual(
            to_sets(dataset.values("gt_label_counts")),
            [
                {
                    fo.DynamicEmbeddedDocument(label="foo", count=2),
                    fo.DynamicEmbeddedDocument(label="bar", count=1),
                },
                None,
            ],
        )
        self.assertListEqual(
            to_sets(dataset.values("gt_confidence_by_label")),
            [
                {
                    fo.DynamicEmbeddedDocument(label="foo", min=0.1, max=0.9),
                    fo.DynamicEmbeddedDocument(label="bar", min=0.5, max=0.5),
                },
                None,
            ],
        )

        self.assertListEqual(
            to_sets(dataset.values("frames_gt_label")),
            [{"foo", "bar"}, None],
        )
        self.assertListEqual(
            dataset.values("frames_gt_confidence"),
            [fo.DynamicEmbeddedDocument(min=0.1, max=0.9), None],
        )
        self.assertListEqual(
            to_sets(dataset.values("frames_gt_label_counts")),
            [
                {
                    fo.DynamicEmbeddedDocument(label="foo", count=2),
                    fo.DynamicEmbeddedDocument(label="bar", count=1),
                },
                None,
            ],
        )
        self.assertListEqual(
            to_sets(dataset.values("frames_gt_confidence_by_label")),
            [
                {
                    fo.DynamicEmbeddedDocument(label="foo", min=0.1, max=0.9),
                    fo.DynamicEmbeddedDocument(label="bar", min=0.5, max=0.5),
                },
                None,
            ],
        )

        summary_fields = dataset.list_summary_fields()

        self.assertTrue(dataset.get_field("gt_label").read_only)
        self.assertTrue(dataset.get_field("gt_confidence").read_only)
        self.assertFalse(dataset.get_field("gt_label_counts").read_only)
        self.assertFalse(dataset.get_field("gt_confidence_by_label").read_only)

        self.assertTrue(dataset.get_field("frames_gt_label").read_only)
        self.assertTrue(dataset.get_field("frames_gt_confidence").read_only)
        self.assertFalse(dataset.get_field("frames_gt_label_counts").read_only)
        self.assertFalse(
            dataset.get_field("frames_gt_confidence_by_label").read_only
        )

        self.assertSetEqual(
            set(summary_fields),
            {
                "gt_label",
                "gt_confidence",
                "gt_label_counts",
                "gt_confidence_by_label",
                "frames_gt_label",
                "frames_gt_confidence",
                "frames_gt_label_counts",
                "frames_gt_confidence_by_label",
            },
        )

        db_indexes = dataset.list_indexes()

        self.assertTrue("gt_label" in db_indexes)
        self.assertTrue("gt_confidence.min" in db_indexes)
        self.assertTrue("gt_confidence.max" in db_indexes)
        self.assertFalse("gt_label_counts.label" in db_indexes)
        self.assertFalse("gt_label_counts.count" in db_indexes)
        self.assertFalse("gt_confidence_by_label.label" in db_indexes)
        self.assertFalse("gt_confidence_by_label.min" in db_indexes)
        self.assertFalse("gt_confidence_by_label.max" in db_indexes)

        self.assertTrue("frames_gt_label" in db_indexes)
        self.assertTrue("frames_gt_confidence.min" in db_indexes)
        self.assertTrue("frames_gt_confidence.max" in db_indexes)
        self.assertFalse("frames_gt_label_counts.label" in db_indexes)
        self.assertFalse("frames_gt_label_counts.count" in db_indexes)
        self.assertFalse("frames_gt_confidence_by_label.label" in db_indexes)
        self.assertFalse("frames_gt_confidence_by_label.min" in db_indexes)
        self.assertFalse("frames_gt_confidence_by_label.max" in db_indexes)

        update_fields = dataset.check_summary_fields()

        self.assertListEqual(update_fields, [])

        label_upper = F("label").upper()
        dataset.set_field("gt.detections.label", label_upper).save()
        dataset.set_field("frames.gt.detections.label", label_upper).save()

        update_fields = dataset.check_summary_fields()

        self.assertSetEqual(
            set(update_fields),
            {
                "gt_label",
                "gt_confidence",
                "gt_label_counts",
                "gt_confidence_by_label",
                "frames_gt_label",
                "frames_gt_confidence",
                "frames_gt_label_counts",
                "frames_gt_confidence_by_label",
            },
        )

        for field_name in update_fields:
            dataset.update_summary_field(field_name)

        update_fields = dataset.check_summary_fields()

        self.assertListEqual(update_fields, [])

        dataset.delete_summary_field("gt_label")
        dataset.delete_summary_fields("gt_confidence")
        dataset.delete_summary_fields(
            ["gt_label_counts", "gt_confidence_by_label"]
        )

        dataset.delete_summary_field("frames_gt_label")
        dataset.delete_summary_fields("frames_gt_confidence")
        dataset.delete_summary_fields(
            ["frames_gt_label_counts", "frames_gt_confidence_by_label"]
        )

        summary_fields = dataset.list_summary_fields()

        self.assertListEqual(summary_fields, [])

        db_indexes = dataset.list_indexes()

        self.assertFalse("gt_label" in db_indexes)
        self.assertFalse("gt_confidence.min" in db_indexes)
        self.assertFalse("gt_confidence.max" in db_indexes)
        self.assertFalse("gt_label_counts.label" in db_indexes)
        self.assertFalse("gt_label_counts.count" in db_indexes)
        self.assertFalse("gt_confidence_by_label.label" in db_indexes)
        self.assertFalse("gt_confidence_by_label.min" in db_indexes)
        self.assertFalse("gt_confidence_by_label.max" in db_indexes)

        self.assertFalse("frames_gt_label" in db_indexes)
        self.assertFalse("frames_gt_confidence.min" in db_indexes)
        self.assertFalse("frames_gt_confidence.max" in db_indexes)
        self.assertFalse("frames_gt_label_counts.label" in db_indexes)
        self.assertFalse("frames_gt_label_counts.count" in db_indexes)
        self.assertFalse("frames_gt_confidence_by_label.label" in db_indexes)
        self.assertFalse("frames_gt_confidence_by_label.min" in db_indexes)
        self.assertFalse("frames_gt_confidence_by_label.max" in db_indexes)

    @drop_datasets
    def test_iter_samples(self):
        dataset = fo.Dataset()
        dataset.add_samples(
            [fo.Sample(filepath="image%d.jpg" % i) for i in range(50)]
        )

        last_modified_at1 = dataset.values("last_modified_at")

        for idx, sample in enumerate(dataset):
            sample["int"] = idx + 1
            sample.save()

        last_modified_at2 = dataset.values("last_modified_at")

        self.assertTupleEqual(dataset.bounds("int"), (1, 50))
        self.assertTrue(
            all(
                m1 < m2 for m1, m2 in zip(last_modified_at1, last_modified_at2)
            )
        )

        for idx, sample in enumerate(dataset.iter_samples(progress=True)):
            sample["int"] = idx + 2
            sample.save()

        self.assertTupleEqual(dataset.bounds("int"), (2, 51))

        for idx, sample in enumerate(dataset.iter_samples(autosave=True)):
            sample["int"] = idx + 3

        last_modified_at3 = dataset.values("last_modified_at")

        self.assertTupleEqual(dataset.bounds("int"), (3, 52))
        self.assertTrue(
            all(
                m2 < m3 for m2, m3 in zip(last_modified_at2, last_modified_at3)
            )
        )

        with dataset.save_context() as context:
            for idx, sample in enumerate(dataset):
                sample["int"] = idx + 4
                context.save(sample)

        last_modified_at4 = dataset.values("last_modified_at")

        self.assertTupleEqual(dataset.bounds("int"), (4, 53))
        self.assertTrue(
            all(
                m3 < m4 for m3, m4 in zip(last_modified_at3, last_modified_at4)
            )
        )

    @drop_datasets
    def test_date_fields(self):
        dataset = fo.Dataset()

        date1 = date(1970, 1, 1)

        sample = fo.Sample(filepath="image1.png", date=date1)

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        self.assertEqual(type(sample.date), date)
        self.assertEqual(int((sample.date - date1).total_seconds()), 0)

        # Ensure that DateFields are always `date` instances and are not
        # affected by timezone changes

        fo.config.timezone = "US/Eastern"
        dataset.reload()

        self.assertEqual(type(sample.date), date)
        self.assertEqual(int((sample.date - date1).total_seconds()), 0)

        fo.config.timezone = None
        dataset.reload()

        self.assertEqual(type(sample.date), date)
        self.assertEqual(int((sample.date - date1).total_seconds()), 0)

        # Now change system time to something GMT+
        system_timezone = os.environ.get("TZ")
        try:
            os.environ["TZ"] = "Europe/Madrid"
            time.tzset()
            dataset.reload()
        finally:
            if system_timezone is None:
                del os.environ["TZ"]
            else:
                os.environ["TZ"] = system_timezone
            time.tzset()

        self.assertEqual(type(sample.date), date)
        self.assertEqual(int((sample.date - date1).total_seconds()), 0)

    @drop_datasets
    def test_datetime_fields(self):
        dataset = fo.Dataset()

        # These are all the epoch
        date1 = datetime(1970, 1, 1, 0, 0, 0)
        utcdate1 = date1.replace(tzinfo=pytz.utc)
        date2 = utcdate1.astimezone(pytz.timezone("US/Eastern"))
        date3 = utcdate1.astimezone(pytz.timezone("US/Pacific"))

        # FiftyOne treats naive datetimes as UTC implicitly
        sample1 = fo.Sample(filepath="image1.png", date=date1)

        # FiftyOne accepts timezone-aware datetimes too
        sample2 = fo.Sample(filepath="image2.png", date=date2)
        sample3 = fo.Sample(filepath="image3.png", date=date3)

        dataset.add_samples([sample1, sample2, sample3])

        fo.config.timezone = "US/Eastern"
        dataset.reload()

        self.assertEqual(sample1.date.tzinfo.zone, "US/Eastern")
        self.assertEqual(int((sample1.date - utcdate1).total_seconds()), 0)
        self.assertEqual(int((sample1.date - sample2.date).total_seconds()), 0)
        self.assertEqual(int((sample1.date - sample3.date).total_seconds()), 0)

        fo.config.timezone = None
        dataset.reload()

        self.assertIsNone(sample1.date.tzinfo)
        self.assertEqual(int((sample1.date - date1).total_seconds()), 0)
        self.assertEqual(int((sample1.date - sample2.date).total_seconds()), 0)
        self.assertEqual(int((sample1.date - sample3.date).total_seconds()), 0)

    @drop_datasets
    def test_get_field(self):
        dataset = fo.Dataset()

        dataset.add_sample_field("list_field", fo.ListField)
        dataset.add_sample_field(
            "list_str_field", fo.ListField, subfield=fo.StringField
        )

        sample = fo.Sample(
            filepath="image.jpg",
            int_field=1,
            classification_field=fo.Classification(label="cat", foo="bar"),
            classifications_field=fo.Classifications(
                classifications=[fo.Classification(label="cat", foo="bar")]
            ),
        )
        dataset.add_sample(sample)

        id_field1 = dataset.get_field("id")
        self.assertIsInstance(id_field1, fo.ObjectIdField)
        self.assertEqual(id_field1.name, "id")
        self.assertEqual(id_field1.db_field, "_id")
        self.assertIsNone(dataset.get_field("_id"))
        self.assertIsInstance(
            dataset.get_field("_id", include_private=True),
            fo.ObjectIdField,
        )

        self.assertIsInstance(dataset.get_field("int_field"), fo.IntField)

        self.assertIsInstance(dataset.get_field("list_field"), fo.ListField)
        self.assertIsNone(dataset.get_field("list_field").field)

        self.assertIsInstance(
            dataset.get_field("list_str_field"),
            fo.ListField,
        )
        self.assertIsInstance(
            dataset.get_field("list_str_field").field,
            fo.StringField,
        )

        self.assertIsInstance(
            dataset.get_field("classification_field"),
            fo.EmbeddedDocumentField,
        )
        self.assertEqual(
            dataset.get_field("classification_field").document_type,
            fo.Classification,
        )
        id_field2 = dataset.get_field("classification_field.id")
        self.assertIsInstance(id_field2, fo.ObjectIdField)
        self.assertEqual(id_field2.name, "id")
        self.assertEqual(id_field2.db_field, "_id")
        self.assertIsNone(dataset.get_field("classification_field.foo"))

        self.assertIsInstance(
            dataset.get_field("classifications_field"),
            fo.EmbeddedDocumentField,
        )
        self.assertEqual(
            dataset.get_field("classifications_field").document_type,
            fo.Classifications,
        )
        self.assertIsInstance(
            dataset.get_field("classifications_field.classifications"),
            fo.ListField,
        )
        self.assertIsInstance(
            dataset.get_field("classifications_field.classifications").field,
            fo.EmbeddedDocumentField,
        )
        self.assertEqual(
            dataset.get_field(
                "classifications_field.classifications"
            ).field.document_type,
            fo.Classification,
        )
        self.assertIsInstance(
            dataset.get_field("classifications_field.classifications.label"),
            fo.StringField,
        )
        id_field3 = dataset.get_field(
            "classifications_field.classifications.id"
        )
        self.assertIsInstance(id_field3, fo.ObjectIdField)
        self.assertEqual(id_field3.name, "id")
        self.assertEqual(id_field3.db_field, "_id")
        self.assertIsNone(
            dataset.get_field("classifications_field.classifications._id")
        )
        self.assertIsInstance(
            dataset.get_field(
                "classifications_field.classifications._id",
                include_private=True,
            ),
            fo.ObjectIdField,
        )
        self.assertIsNone(
            dataset.get_field("classifications_field.classifications.foo")
        )

    @drop_datasets
    def test_get_field_frames(self):
        dataset = fo.Dataset()
        dataset.media_type = "video"

        dataset.add_frame_field("list_field", fo.ListField)
        dataset.add_frame_field(
            "list_str_field", fo.ListField, subfield=fo.StringField
        )

        sample = fo.Sample(filepath="video.mp4")
        sample.frames[1] = fo.Frame(
            int_field=1,
            classification_field=fo.Classification(label="cat", foo="bar"),
            classifications_field=fo.Classifications(
                classifications=[fo.Classification(label="cat", foo="bar")]
            ),
        )
        dataset.add_sample(sample)

        id_field1 = dataset.get_field("frames.id")
        self.assertIsInstance(id_field1, fo.ObjectIdField)
        self.assertEqual(id_field1.name, "id")
        self.assertEqual(id_field1.db_field, "_id")
        self.assertIsNone(dataset.get_field("frames._id"))
        self.assertIsInstance(
            dataset.get_field("frames._id", include_private=True),
            fo.ObjectIdField,
        )

        self.assertIsInstance(
            dataset.get_field("frames.int_field"),
            fo.IntField,
        )

        self.assertIsInstance(
            dataset.get_field("frames.list_field"),
            fo.ListField,
        )
        self.assertIsNone(dataset.get_field("frames.list_field").field)

        self.assertIsInstance(
            dataset.get_field("frames.list_str_field"),
            fo.ListField,
        )
        self.assertIsInstance(
            dataset.get_field("frames.list_str_field").field,
            fo.StringField,
        )

        self.assertIsInstance(
            dataset.get_field("frames.classification_field"),
            fo.EmbeddedDocumentField,
        )
        self.assertEqual(
            dataset.get_field("frames.classification_field").document_type,
            fo.Classification,
        )
        id_field2 = dataset.get_field("frames.classification_field.id")
        self.assertIsInstance(id_field2, fo.ObjectIdField)
        self.assertEqual(id_field2.name, "id")
        self.assertEqual(id_field2.db_field, "_id")
        self.assertIsNone(dataset.get_field("frames.classification_field.foo"))

        self.assertIsInstance(
            dataset.get_field("frames.classifications_field"),
            fo.EmbeddedDocumentField,
        )
        self.assertEqual(
            dataset.get_field("frames.classifications_field").document_type,
            fo.Classifications,
        )
        self.assertIsInstance(
            dataset.get_field("frames.classifications_field.classifications"),
            fo.ListField,
        )
        self.assertIsInstance(
            dataset.get_field(
                "frames.classifications_field.classifications"
            ).field,
            fo.EmbeddedDocumentField,
        )
        self.assertEqual(
            dataset.get_field(
                "frames.classifications_field.classifications"
            ).field.document_type,
            fo.Classification,
        )
        self.assertIsInstance(
            dataset.get_field(
                "frames.classifications_field.classifications.label"
            ),
            fo.StringField,
        )
        id_field3 = dataset.get_field(
            "frames.classifications_field.classifications.id"
        )
        self.assertIsInstance(id_field3, fo.ObjectIdField)
        self.assertEqual(id_field3.name, "id")
        self.assertEqual(id_field3.db_field, "_id")
        self.assertIsNone(
            dataset.get_field(
                "frames.classifications_field.classifications._id"
            )
        )
        self.assertIsInstance(
            dataset.get_field(
                "frames.classifications_field.classifications._id",
                include_private=True,
            ),
            fo.ObjectIdField,
        )
        self.assertIsNone(
            dataset.get_field(
                "frames.classifications_field.classifications.foo"
            )
        )

    @drop_datasets
    def test_field_names(self):
        dataset = fo.Dataset()
        dataset.add_sample_field("foo", fo.StringField)

        # Field names cannot be empty

        with self.assertRaises(ValueError):
            dataset.add_sample_field("", fo.StringField)

        with self.assertRaises(ValueError):
            dataset.rename_sample_field("foo", "")

        with self.assertRaises(ValueError):
            dataset.clone_sample_field("foo", "")

        # Field names cannot be private

        with self.assertRaises(ValueError):
            dataset.add_sample_field("_private", fo.StringField)

        with self.assertRaises(ValueError):
            dataset.rename_sample_field("foo", "_private")

        with self.assertRaises(ValueError):
            dataset.clone_sample_field("foo", "_private")

    @drop_datasets
    def test_frame_field_names(self):
        dataset = fo.Dataset()
        dataset.media_type = "video"
        dataset.add_frame_field("foo", fo.StringField)

        # "frames" is a reserved keyword
        with self.assertRaises(ValueError):
            dataset.add_sample_field("frames", fo.StringField)

        # Field names cannot be empty

        with self.assertRaises(ValueError):
            dataset.add_frame_field("", fo.StringField)

        with self.assertRaises(ValueError):
            dataset.rename_frame_field("foo", "")

        with self.assertRaises(ValueError):
            dataset.clone_frame_field("foo", "")

        # Field names cannot be private

        with self.assertRaises(ValueError):
            dataset.add_frame_field("_private", fo.StringField)

        with self.assertRaises(ValueError):
            dataset.rename_frame_field("foo", "_private")

        with self.assertRaises(ValueError):
            dataset.clone_frame_field("foo", "_private")

    @drop_datasets
    def test_field_schemas(self):
        dataset = fo.Dataset()

        dataset.add_sample_field("foo", fo.StringField)
        dataset.add_sample_field("bar", fo.BooleanField)
        dataset.add_sample_field(
            "spam",
            fo.EmbeddedDocumentField,
            embedded_doc_type=fo.Classification,
        )
        dataset.add_sample_field(
            "eggs", fo.EmbeddedDocumentField, embedded_doc_type=fo.Detections
        )

        schema = dataset.get_field_schema()
        self.assertSetEqual(
            set(schema.keys()),
            {
                "id",
                "filepath",
                "tags",
                "metadata",
                "created_at",
                "last_modified_at",
                "foo",
                "bar",
                "spam",
                "eggs",
            },
        )

        schema = dataset.get_field_schema(ftype=fo.StringField)
        self.assertSetEqual(set(schema.keys()), {"filepath", "foo"})

        schema = dataset.get_field_schema(
            ftype=[fo.StringField, fo.BooleanField]
        )
        self.assertSetEqual(set(schema.keys()), {"filepath", "foo", "bar"})

        schema = dataset.get_field_schema(embedded_doc_type=fo.Classification)
        self.assertSetEqual(set(schema.keys()), {"spam"})

        schema = dataset.get_field_schema(
            embedded_doc_type=[fo.Classification, fo.Detections]
        )
        self.assertSetEqual(set(schema.keys()), {"spam", "eggs"})

        view = dataset.select_fields(["foo", "spam", "eggs"]).exclude_fields(
            "eggs"
        )

        schema = view.get_field_schema()
        self.assertSetEqual(
            set(schema.keys()),
            {
                "id",
                "filepath",
                "tags",
                "metadata",
                "created_at",
                "last_modified_at",
                "foo",
                "spam",
            },
        )

        schema = view.get_field_schema(ftype=fo.StringField)
        self.assertSetEqual(set(schema.keys()), {"filepath", "foo"})

        schema = view.get_field_schema(ftype=[fo.BooleanField, fo.StringField])
        self.assertSetEqual(set(schema.keys()), {"filepath", "foo"})

        schema = view.get_field_schema(embedded_doc_type=fo.Classification)
        self.assertSetEqual(set(schema.keys()), {"spam"})

        schema = view.get_field_schema(
            embedded_doc_type=[fo.Classification, fo.Detections]
        )
        self.assertSetEqual(set(schema.keys()), {"spam"})

        # Just checks for existence
        dataset.validate_field_type("filepath")
        dataset.validate_field_type("foo")
        dataset.validate_field_type("spam.label")
        dataset.validate_field_type("eggs.detections.label")

        # Check types
        dataset.validate_field_type("filepath", ftype=fo.StringField)
        dataset.validate_field_type("bar", ftype=fo.BooleanField)
        dataset.validate_field_type("bar", ftype=[fo.Field, fo.StringField])
        dataset.validate_field_type(
            "spam", embedded_doc_type=fo.Classification
        )
        dataset.validate_field_type(
            "spam", embedded_doc_type=[fo.Label, fo.Detections]
        )
        dataset.validate_field_type("eggs", embedded_doc_type=fo.Detections)

        with self.assertRaises(ValueError):
            dataset.validate_field_type("missing")

        with self.assertRaises(ValueError):
            dataset.validate_field_type("spam.missing")

        with self.assertRaises(ValueError):
            dataset.validate_field_type("eggs.detections.missing")

        with self.assertRaises(ValueError):
            dataset.validate_field_type("foo", ftype=fo.BooleanField)

        with self.assertRaises(ValueError):
            dataset.validate_field_type(
                "spam", embedded_doc_type=fo.Detections
            )

    @drop_datasets
    def test_validate_sample_fields(self):
        dataset = fo.Dataset()
        dataset._doc.sample_fields.append(None)
        with self.assertRaises(ValidationError):
            dataset.save()

    @drop_datasets
    def test_validate_frame_fields(self):
        dataset = fo.Dataset()
        dataset.media_type = "video"
        dataset._doc.frame_fields.append(None)
        with self.assertRaises(ValidationError):
            dataset.save()

    @drop_datasets
    def test_frame_field_schemas(self):
        dataset = fo.Dataset()
        dataset.media_type = "video"

        dataset.add_frame_field("foo", fo.StringField)
        dataset.add_frame_field("bar", fo.BooleanField)
        dataset.add_frame_field(
            "spam",
            fo.EmbeddedDocumentField,
            embedded_doc_type=fo.Classification,
        )
        dataset.add_frame_field(
            "eggs", fo.EmbeddedDocumentField, embedded_doc_type=fo.Detections
        )

        schema = dataset.get_frame_field_schema()
        self.assertSetEqual(
            set(schema.keys()),
            {
                "id",
                "frame_number",
                "created_at",
                "last_modified_at",
                "foo",
                "bar",
                "spam",
                "eggs",
            },
        )

        schema = dataset.get_frame_field_schema(ftype=fo.StringField)
        self.assertSetEqual(set(schema.keys()), {"foo"})

        schema = dataset.get_frame_field_schema(
            ftype=[fo.StringField, fo.BooleanField]
        )
        self.assertSetEqual(set(schema.keys()), {"foo", "bar"})

        schema = dataset.get_frame_field_schema(
            embedded_doc_type=fo.Classification
        )
        self.assertSetEqual(set(schema.keys()), {"spam"})

        schema = dataset.get_frame_field_schema(
            embedded_doc_type=[fo.Classification, fo.Detections]
        )
        self.assertSetEqual(set(schema.keys()), {"spam", "eggs"})

        view = dataset.select_fields(
            ["frames.foo", "frames.spam", "frames.eggs"]
        ).exclude_fields("frames.eggs")

        schema = view.get_frame_field_schema()
        self.assertSetEqual(
            set(schema.keys()),
            {
                "id",
                "frame_number",
                "created_at",
                "last_modified_at",
                "foo",
                "spam",
            },
        )

        schema = view.get_frame_field_schema(ftype=fo.StringField)
        self.assertSetEqual(set(schema.keys()), {"foo"})

        schema = view.get_frame_field_schema(
            ftype=[fo.BooleanField, fo.StringField]
        )
        self.assertSetEqual(set(schema.keys()), {"foo"})

        schema = view.get_frame_field_schema(
            embedded_doc_type=fo.Classification
        )
        self.assertSetEqual(set(schema.keys()), {"spam"})

        schema = view.get_frame_field_schema(
            embedded_doc_type=[fo.Classification, fo.Detections]
        )
        self.assertSetEqual(set(schema.keys()), {"spam"})

        # Just checks for existence
        dataset.validate_field_type("frames.id")
        dataset.validate_field_type("frames.foo")
        dataset.validate_field_type("frames.spam.label")
        dataset.validate_field_type("frames.eggs.detections.label")

        # Check types
        dataset.validate_field_type("frames.id", ftype=fo.ObjectIdField)
        dataset.validate_field_type("frames.bar", ftype=fo.BooleanField)
        dataset.validate_field_type(
            "frames.bar", ftype=[fo.Field, fo.StringField]
        )
        dataset.validate_field_type(
            "frames.spam", embedded_doc_type=fo.Classification
        )
        dataset.validate_field_type(
            "frames.spam", embedded_doc_type=[fo.Label, fo.Detections]
        )
        dataset.validate_field_type(
            "frames.eggs", embedded_doc_type=fo.Detections
        )

        with self.assertRaises(ValueError):
            dataset.validate_field_type("frames.missing")

        with self.assertRaises(ValueError):
            dataset.validate_field_type("frames.spam.missing")

        with self.assertRaises(ValueError):
            dataset.validate_field_type("frames.eggs.detections.missing")

        with self.assertRaises(ValueError):
            dataset.validate_field_type("frames.foo", ftype=fo.BooleanField)

        with self.assertRaises(ValueError):
            dataset.validate_field_type(
                "frames.spam", embedded_doc_type=fo.Detections
            )

    @drop_datasets
    def test_add_list_subfield(self):
        sample = fo.Sample(
            filepath="image.jpg",
            ground_truth=fo.Classification(
                label="cat",
                info=[
                    fo.DynamicEmbeddedDocument(
                        author="Alice",
                        notes=["foo", "bar"],
                    ),
                    fo.DynamicEmbeddedDocument(author="Bob"),
                ],
            ),
        )

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        dataset.add_sample_field("ground_truth.info", fo.ListField)

        field = dataset.get_field("ground_truth.info")
        self.assertIsNone(field.field)

        # Syntax for declaring the subfield type of an existing list field
        dataset.add_sample_field(
            "ground_truth.info[]",
            fo.EmbeddedDocumentField,
            embedded_doc_type=fo.DynamicEmbeddedDocument,
        )

        field = dataset.get_field("ground_truth.info")
        self.assertIsInstance(field.field, fo.EmbeddedDocumentField)
        self.assertEqual(field.field.document_type, fo.DynamicEmbeddedDocument)

    @drop_datasets
    def test_one(self):
        samples = [
            fo.Sample(filepath="image1.jpg"),
            fo.Sample(filepath="image2.png"),
            fo.Sample(filepath="image3.jpg"),
        ]

        dataset = fo.Dataset()
        dataset.add_samples(samples)

        filepath = dataset.first().filepath

        sample = dataset.one(F("filepath") == filepath)

        self.assertEqual(sample.filepath, filepath)

        with self.assertRaises(ValueError):
            _ = dataset.one(F("filepath") == "bad")

        sample = dataset.one(F("filepath").ends_with(".jpg"))

        self.assertTrue(sample.filepath.endswith(".jpg"))

        with self.assertRaises(ValueError):
            _ = dataset.one(F("filepath").ends_with(".jpg"), exact=True)

    @drop_datasets
    def test_merge_sample(self):
        sample1 = fo.Sample(filepath="image.jpg", foo="bar", tags=["a"])
        sample2 = fo.Sample(filepath="image.jpg", spam="eggs", tags=["b"])
        sample3 = fo.Sample(filepath="image.jpg", tags=[])

        # No dataset

        s1 = sample1.copy()
        s2 = sample2.copy()
        s3 = sample3.copy()

        s1.merge(s2)
        s1.merge(s3)

        self.assertListEqual(s1["tags"], ["a", "b"])
        self.assertEqual(s1["foo"], "bar")
        self.assertEqual(s1["spam"], "eggs")

        # In dataset

        s1 = sample1.copy()
        s2 = sample2.copy()
        s3 = sample3.copy()

        dataset = fo.Dataset()
        dataset.add_sample(s1)

        created_at1 = dataset.values("created_at")[0]
        last_modified_at1 = dataset.values("last_modified_at")[0]
        s1_created = dataset.get_field("tags").created_at

        dataset.merge_sample(s2)
        dataset.merge_sample(s3)

        created_at2 = dataset.values("created_at")[0]
        last_modified_at2 = dataset.values("last_modified_at")[0]

        self.assertListEqual(s1["tags"], ["a", "b"])
        self.assertEqual(s1["foo"], "bar")
        self.assertEqual(s1["spam"], "eggs")
        self.assertEqual(created_at1, created_at2)
        self.assertTrue(last_modified_at1 < last_modified_at2)
        self.assertEqual(dataset.get_field("tags").created_at, s1_created)
        self.assertGreater(dataset.get_field("spam").created_at, s1_created)

        # List merging variations

        s1 = sample1.copy()
        s2 = sample2.copy()
        s3 = sample3.copy()

        dataset = fo.Dataset()
        dataset.add_sample(s1)

        dataset.merge_sample(s2, merge_lists=False)

        self.assertListEqual(s1["tags"], ["b"])

        # Tests an edge case when setting a typed list field to an empty list
        dataset.merge_sample(s3, merge_lists=False, dynamic=True)

        self.assertListEqual(s1["tags"], [])

    @drop_datasets
    def test_merge_sample_group(self):
        dataset = fo.Dataset()

        group = fo.Group()
        sample1 = fo.Sample("test.png", group=group.element("thumbnail"))
        sample2 = fo.Sample(
            "test.mp4", group=group.element("video"), foo="spam"
        )
        sample3 = fo.Sample(
            "test.mp4", group=group.element("video"), foo="eggs"
        )

        dataset.merge_sample(sample1)
        dataset.merge_sample(sample2)
        dataset.merge_sample(sample3)  # should be merged with `sample2`

        self.assertEqual(
            len(dataset.select_group_slices(_allow_mixed=True)), 2
        )

        dataset.group_slice = "video"
        self.assertEqual(len(dataset), 1)

        sample = dataset.first()
        self.assertEqual(sample.foo, "eggs")

    @drop_datasets
    def test_merge_samples1(self):
        # Windows compatibility
        def expand_path(path):
            return os.path.abspath(os.path.expanduser(path))

        dataset1 = fo.Dataset()
        dataset2 = fo.Dataset()

        common_filepath = expand_path("/path/to/image.png")
        filepath1 = expand_path("/path/to/image1.png")
        filepath2 = expand_path("/path/to/image2.png")

        common1 = fo.Sample(filepath=common_filepath, field=1)
        common2 = fo.Sample(filepath=common_filepath, field=2)

        sample1 = fo.Sample(filepath=filepath1, field=1)
        dataset1.add_samples([sample1, common1])

        sample2 = fo.Sample(filepath=filepath2, field=2)
        dataset2.add_samples([sample2, common2])

        # Standard merge

        dataset12 = dataset1.clone()
        created_at1 = dataset12.values("created_at")
        last_modified_at1 = dataset12.values("last_modified_at")
        dataset12.merge_samples(dataset2)
        created_at2 = dataset12.values("created_at")
        last_modified_at2 = dataset12.values("last_modified_at")

        self.assertEqual(len(dataset12), 3)
        self.assertListEqual(
            [c1 == c2 for c1, c2 in zip(created_at1, created_at2[:2])],
            [True, True],
        )
        self.assertListEqual(
            [
                m1 == m2
                for m1, m2 in zip(last_modified_at1, last_modified_at2[:2])
            ],
            [True, False],
        )
        self.assertTrue(sample2.created_at < created_at2[2])
        self.assertTrue(sample2.last_modified_at < last_modified_at2[2])

        common12_view = dataset12.match(F("filepath") == common_filepath)

        self.assertEqual(len(common12_view), 1)

        common12 = common12_view.first()

        self.assertEqual(common12.field, common2.field)

        # Merge specific fields, no new samples

        dataset1c = dataset1.clone()
        created_at1 = dataset1c.values("created_at")
        last_modified_at1 = dataset1c.values("last_modified_at")
        dataset1c.merge_samples(dataset2, fields=["field"], insert_new=False)
        created_at2 = dataset1c.values("created_at")
        last_modified_at2 = dataset1c.values("last_modified_at")

        self.assertEqual(len(dataset1c), 2)
        self.assertListEqual(
            [c1 == c2 for c1, c2 in zip(created_at1, created_at2[:2])],
            [True, True],
        )
        self.assertListEqual(
            [
                m1 == m2
                for m1, m2 in zip(last_modified_at1, last_modified_at2[:2])
            ],
            [True, False],
        )

        common12_view = dataset1c.match(F("filepath") == common_filepath)

        self.assertEqual(len(common12_view), 1)

        common12 = common12_view.first()

        self.assertEqual(common12.field, common2.field)

        # Merge a view with excluded fields

        dataset21 = dataset1.clone()
        created_at1 = dataset21.values("created_at")
        last_modified_at1 = dataset21.values("last_modified_at")
        dataset21.merge_samples(dataset2.exclude_fields("field"))
        created_at2 = dataset21.values("created_at")
        last_modified_at2 = dataset21.values("last_modified_at")

        self.assertEqual(len(dataset21), 3)
        self.assertListEqual(
            [c1 == c2 for c1, c2 in zip(created_at1, created_at2[:2])],
            [True, True],
        )
        self.assertListEqual(
            [
                m1 == m2
                for m1, m2 in zip(last_modified_at1, last_modified_at2[:2])
            ],
            [True, False],
        )
        self.assertTrue(sample2.created_at < created_at2[2])
        self.assertTrue(sample2.last_modified_at < last_modified_at2[2])

        common21_view = dataset21.match(F("filepath") == common_filepath)

        self.assertEqual(len(common21_view), 1)

        common21 = common21_view.first()

        self.assertEqual(common21.field, common1.field)

        # Merge with custom key

        dataset22 = dataset1.clone()
        created_at1 = dataset22.values("created_at")
        last_modified_at1 = dataset22.values("last_modified_at")
        key_fcn = lambda sample: os.path.basename(sample.filepath)
        dataset22.merge_samples(dataset2, key_fcn=key_fcn)
        created_at2 = dataset22.values("created_at")
        last_modified_at2 = dataset22.values("last_modified_at")

        self.assertEqual(len(dataset22), 3)
        self.assertListEqual(
            [c1 == c2 for c1, c2 in zip(created_at1, created_at2[:2])],
            [True, True],
        )
        self.assertListEqual(
            [
                m1 == m2
                for m1, m2 in zip(last_modified_at1, last_modified_at2[:2])
            ],
            [True, False],
        )
        self.assertTrue(sample2.created_at < created_at2[2])
        self.assertTrue(sample2.last_modified_at < last_modified_at2[2])

        common22_view = dataset22.match(F("filepath") == common_filepath)

        self.assertEqual(len(common22_view), 1)

        common22 = common22_view.first()

        self.assertEqual(common22.field, common2.field)

    @drop_datasets
    def test_merge_samples2(self):
        dataset1 = fo.Dataset()
        dataset2 = fo.Dataset()

        sample11 = fo.Sample(filepath="image1.jpg", field=1)
        sample12 = fo.Sample(
            filepath="image2.jpg",
            field=1,
            gt=fo.Classification(label="cat"),
        )

        sample21 = fo.Sample(filepath="image1.jpg", field=2, new_field=3)
        sample22 = fo.Sample(
            filepath="image2.jpg",
            gt=fo.Classification(label="dog"),
            new_gt=fo.Classification(label="dog"),
        )

        dataset1.add_samples([sample11, sample12])
        dataset2.add_samples([sample21, sample22])

        sample1 = dataset2.first()
        sample1.gt = None
        sample1.save()

        sample2 = dataset2.last()
        sample2.field = None
        sample2.save()

        field_created_at = dataset1.get_field("field").created_at
        created_at1 = dataset1.values("created_at")
        last_modified_at1 = dataset1.values("last_modified_at")
        dataset1.merge_samples(dataset2.select_fields("field"))
        created_at2 = dataset1.values("created_at")
        last_modified_at2 = dataset1.values("last_modified_at")

        self.assertEqual(sample11.field, 2)
        self.assertEqual(sample12.field, 1)
        self.assertIsNone(sample11.gt)
        self.assertIsNotNone(sample12.gt)
        with self.assertRaises(AttributeError):
            sample11.new_field
        with self.assertRaises(AttributeError):
            sample12.new_gt
        self.assertEqual(
            dataset1.get_field("field").created_at, field_created_at
        )
        self.assertTrue(
            all(c1 == c2 for c1, c2 in zip(created_at1, created_at2))
        )
        self.assertTrue(
            all(
                m1 < m2 for m1, m2 in zip(last_modified_at1, last_modified_at2)
            )
        )

        field_created_at = dataset2.get_field("new_gt").created_at
        dataset1.merge_samples(dataset2)

        self.assertEqual(sample11.field, 2)
        self.assertEqual(sample11.new_field, 3)
        self.assertEqual(sample12.field, 1)
        self.assertIsNone(sample12.new_field)
        self.assertIsNone(sample11.gt)
        self.assertIsNone(sample11.new_gt)
        self.assertIsNotNone(sample12.gt)
        self.assertIsNotNone(sample12.new_gt)
        self.assertGreater(
            dataset1.get_field("new_gt").created_at,
            field_created_at,
        )

    @drop_datasets
    def test_merge_samples_and_labels(self):
        sample11 = fo.Sample(filepath="image1.png")

        sample12 = fo.Sample(
            filepath="image2.png",
            tags=["hello"],
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="hello"),
                    fo.Detection(label="world"),
                ]
            ),
            predictions1=fo.Detections(
                detections=[
                    fo.Detection(label="hello", confidence=0.99),
                    fo.Detection(label="world", confidence=0.99),
                ]
            ),
            hello="world",
        )

        sample13 = fo.Sample(
            filepath="image3.png",
            tags=["world"],
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="hello"),
                    fo.Detection(label="world"),
                    fo.Detection(label="common"),
                ]
            ),
            predictions1=fo.Detections(
                detections=[
                    fo.Detection(label="hello", confidence=0.99),
                    fo.Detection(label="world", confidence=0.99),
                ]
            ),
            hello="world",
        )

        sample14 = fo.Sample(
            filepath="image4.png",
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="hi"),
                    fo.Detection(label="there"),
                ]
            ),
            hello="world",
        )

        sample15 = fo.Sample(
            filepath="image5.png",
            ground_truth=None,
            hello=None,
        )

        dataset1 = fo.Dataset()
        dataset1.add_samples(
            [sample11, sample12, sample13, sample14, sample15]
        )

        ref = sample13.ground_truth.detections[2]
        common = ref.copy()
        common.id = ref.id
        common.label = "COMMON"

        sample22 = fo.Sample(filepath="image2.png")

        sample23 = fo.Sample(
            filepath="image3.png",
            tags=["foo"],
            ground_truth=fo.Detections(
                detections=[
                    common,
                    fo.Detection(label="foo"),
                    fo.Detection(label="bar"),
                ]
            ),
            predictions2=fo.Detections(
                detections=[
                    fo.Detection(label="foo", confidence=0.99),
                    fo.Detection(label="bar", confidence=0.99),
                ]
            ),
            hello="bar",
        )

        sample24 = fo.Sample(
            filepath="image4.png",
            ground_truth=None,
            hello=None,
        )

        sample25 = fo.Sample(
            filepath="image5.png",
            tags=["bar"],
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="foo"),
                    fo.Detection(label="bar"),
                ]
            ),
            predictions2=fo.Detections(
                detections=[
                    fo.Detection(label="foo", confidence=0.99),
                    fo.Detection(label="bar", confidence=0.99),
                ]
            ),
            hello="bar",
        )

        sample26 = fo.Sample(filepath="image6.png")

        dataset2 = fo.Dataset()
        dataset2.add_samples(
            [sample22, sample23, sample24, sample25, sample26]
        )

        filepath_fcn = lambda sample: sample.filepath

        for key_fcn in (None, filepath_fcn):
            d1 = dataset1.clone()
            d1.merge_samples(dataset2, skip_existing=True, key_fcn=key_fcn)

            dt_fields = {"created_at", "last_modified_at"}
            fields1 = set(dataset1.get_field_schema().keys()) - dt_fields
            fields2 = set(d1.get_field_schema().keys()) - dt_fields
            new_fields = fields2 - fields1

            self.assertEqual(len(d1), 6)
            for s1, s2 in zip(dataset1, d1):
                for field in dt_fields:
                    self.assertTrue(s1[field] < s2[field])

                for field in fields1:
                    self.assertEqual(s1[field], s2[field])

                for field in new_fields:
                    self.assertIsNone(s2[field])

        for key_fcn in (None, filepath_fcn):
            d2 = dataset1.clone()
            d2.merge_samples(dataset2, insert_new=False, key_fcn=key_fcn)

            self.assertEqual(len(d2), len(dataset1))

        for key_fcn in (None, filepath_fcn):
            with self.assertRaises(ValueError):
                d3 = dataset1.clone()
                d3.merge_samples(
                    dataset2, expand_schema=False, key_fcn=key_fcn
                )

        for key_fcn in (None, filepath_fcn):
            d3 = dataset1.clone()
            d3.merge_samples(
                dataset2, merge_lists=False, overwrite=True, key_fcn=key_fcn
            )

            self.assertListEqual(
                [s["hello"] for s in d3],
                [None, "world", "bar", "world", "bar", None],
            )
            self.assertListEqual(
                [s["tags"] for s in d3], [[], [], ["foo"], [], ["bar"], []]
            )
            self.assertListEqual(
                d3.values("ground_truth.detections.label"),
                [
                    None,
                    ["hello", "world"],
                    ["COMMON", "foo", "bar"],
                    ["hi", "there"],
                    ["foo", "bar"],
                    None,
                ],
            )
            self.assertListEqual(
                d3.values("predictions1.detections.label"),
                [
                    None,
                    ["hello", "world"],
                    ["hello", "world"],
                    None,
                    None,
                    None,
                ],
            )
            self.assertListEqual(
                d3.values("predictions2.detections.label"),
                [None, None, ["foo", "bar"], None, ["foo", "bar"], None],
            )

        for key_fcn in (None, filepath_fcn):
            d4 = dataset1.clone()
            d4.merge_samples(
                dataset2, merge_lists=False, overwrite=False, key_fcn=key_fcn
            )

            self.assertListEqual(
                d4.values("hello"),
                [None, "world", "world", "world", "bar", None],
            )
            self.assertListEqual(
                d4.values("tags"),
                [[], ["hello"], ["world"], [], [], []],
            )
            self.assertListEqual(
                d4.values("ground_truth.detections.label"),
                [
                    None,
                    ["hello", "world"],
                    ["hello", "world", "common"],
                    ["hi", "there"],
                    ["foo", "bar"],
                    None,
                ],
            )
            self.assertListEqual(
                d4.values("predictions1.detections.label"),
                [
                    None,
                    ["hello", "world"],
                    ["hello", "world"],
                    None,
                    None,
                    None,
                ],
            )
            self.assertListEqual(
                d4.values("predictions2.detections.label"),
                [None, None, ["foo", "bar"], None, ["foo", "bar"], None],
            )

        for key_fcn in (None, filepath_fcn):
            d5 = dataset1.clone()
            d5.merge_samples(dataset2, fields="hello", key_fcn=key_fcn)

            for sample in d5:
                self.assertIsNotNone(sample.id)  # ensures documents are valid

            self.assertNotIn("predictions2", d5.get_field_schema())
            self.assertListEqual(
                d5.values("hello"),
                [None, "world", "bar", "world", "bar", None],
            )
            self.assertListEqual(
                d5.values("tags"),
                [[], ["hello"], ["world"], [], [], []],
            )
            self.assertListEqual(
                d5.values("ground_truth.detections.label"),
                [
                    None,
                    ["hello", "world"],
                    ["hello", "world", "common"],
                    ["hi", "there"],
                    None,
                    None,
                ],
            )

        for key_fcn in (None, filepath_fcn):
            d6 = dataset1.clone()
            d6.merge_samples(
                dataset2,
                omit_fields=["tags", "ground_truth", "predictions2"],
                key_fcn=key_fcn,
            )

            for sample in d6:
                self.assertIsNotNone(sample.id)  # ensures documents are valid

            self.assertNotIn("predictions2", d6.get_field_schema())
            self.assertListEqual(
                d6.values("hello"),
                [None, "world", "bar", "world", "bar", None],
            )
            self.assertListEqual(
                d6.values("tags"),
                [[], ["hello"], ["world"], [], [], []],
            )
            self.assertListEqual(
                d6.values("ground_truth.detections.label"),
                [
                    None,
                    ["hello", "world"],
                    ["hello", "world", "common"],
                    ["hi", "there"],
                    None,
                    None,
                ],
            )

        for key_fcn in (None, filepath_fcn):
            d7 = dataset1.clone()
            d7.merge_samples(
                dataset2, merge_lists=False, overwrite=True, key_fcn=key_fcn
            )

            self.assertListEqual(
                d7.values("hello"),
                [None, "world", "bar", "world", "bar", None],
            )
            self.assertListEqual(
                d7.values("ground_truth.detections.label"),
                [
                    None,
                    ["hello", "world"],
                    ["COMMON", "foo", "bar"],
                    ["hi", "there"],
                    ["foo", "bar"],
                    None,
                ],
            )

        for key_fcn in (None, filepath_fcn):
            d8 = dataset1.clone()
            d8.merge_samples(dataset2, key_fcn=key_fcn)

            self.assertListEqual(
                d8.values("hello"),
                [None, "world", "bar", "world", "bar", None],
            )
            self.assertListEqual(
                [s["tags"] for s in d8],
                [[], ["hello"], ["world", "foo"], [], ["bar"], []],
            )
            self.assertListEqual(
                d8.values("ground_truth.detections.label"),
                [
                    None,
                    ["hello", "world"],
                    ["hello", "world", "COMMON", "foo", "bar"],
                    ["hi", "there"],
                    ["foo", "bar"],
                    None,
                ],
            )
            self.assertListEqual(
                d8.values("predictions1.detections.label"),
                [
                    None,
                    ["hello", "world"],
                    ["hello", "world"],
                    None,
                    None,
                    None,
                ],
            )
            self.assertListEqual(
                d8.values("predictions2.detections.label"),
                [None, None, ["foo", "bar"], None, ["foo", "bar"], None],
            )

        for key_fcn in (None, filepath_fcn):
            d9 = dataset1.clone()
            d9.merge_samples(dataset2, overwrite=False, key_fcn=key_fcn)

            self.assertListEqual(
                d9.values("hello"),
                [None, "world", "world", "world", "bar", None],
            )
            self.assertListEqual(
                [s["tags"] for s in d9],
                [[], ["hello"], ["world", "foo"], [], ["bar"], []],
            )
            self.assertListEqual(
                d9.values("ground_truth.detections.label"),
                [
                    None,
                    ["hello", "world"],
                    ["hello", "world", "common", "foo", "bar"],
                    ["hi", "there"],
                    ["foo", "bar"],
                    None,
                ],
            )
            self.assertListEqual(
                d9.values("predictions1.detections.label"),
                [
                    None,
                    ["hello", "world"],
                    ["hello", "world"],
                    None,
                    None,
                    None,
                ],
            )
            self.assertListEqual(
                d9.values("predictions2.detections.label"),
                [None, None, ["foo", "bar"], None, ["foo", "bar"], None],
            )

        for key_fcn in (None, filepath_fcn):
            d10 = dataset1.clone()
            d10.merge_samples(
                dataset2,
                fields={"hello": "hello2", "predictions2": "predictions1"},
                key_fcn=key_fcn,
            )

            d10_schema = d10.get_field_schema()
            self.assertIn("hello", d10_schema)
            self.assertIn("hello2", d10_schema)
            self.assertIn("predictions1", d10_schema)
            self.assertNotIn("predictions2", d10_schema)

            self.assertListEqual(
                d10.values("tags"),
                [[], ["hello"], ["world"], [], [], []],
            )
            self.assertListEqual(
                d10.values("hello"),
                [None, "world", "world", "world", None, None],
            )
            self.assertListEqual(
                d10.values("hello2"),
                [None, None, "bar", None, "bar", None],
            )
            self.assertListEqual(
                d10.values("predictions1.detections.label"),
                [
                    None,
                    ["hello", "world"],
                    ["hello", "world", "foo", "bar"],
                    None,
                    ["foo", "bar"],
                    None,
                ],
            )

    @drop_datasets
    def test_add_collection(self):
        sample1 = fo.Sample(filepath="image.jpg", foo="bar")
        dataset1 = fo.Dataset()
        dataset1.add_sample(sample1)

        sample2 = fo.Sample(filepath="image.jpg", spam="eggs")
        dataset2 = fo.Dataset()
        dataset2.add_sample(sample2)

        # Merge dataset
        dataset = dataset1.clone()
        created_at1 = dataset.values("created_at")
        last_modified_at1 = dataset.values("last_modified_at")
        dataset.add_collection(dataset2)
        created_at2 = dataset.values("created_at")
        last_modified_at2 = dataset.values("last_modified_at")

        self.assertEqual(len(dataset), 2)
        self.assertTrue("spam" in dataset.get_field_schema())
        self.assertIsNone(dataset.first()["spam"])
        self.assertEqual(dataset.last()["spam"], "eggs")
        self.assertEqual(created_at1[0], created_at2[0])
        self.assertEqual(last_modified_at1[0], last_modified_at2[0])
        self.assertTrue(created_at2[1] > sample2.created_at)
        self.assertTrue(last_modified_at2[1] > sample2.last_modified_at)

        # Merge view
        dataset = dataset1.clone()
        created_at1 = dataset.values("created_at")
        last_modified_at1 = dataset.values("last_modified_at")
        dataset.add_collection(dataset2.exclude_fields("spam"))
        created_at2 = dataset.values("created_at")
        last_modified_at2 = dataset.values("last_modified_at")

        self.assertEqual(len(dataset), 2)
        self.assertTrue("spam" not in dataset.get_field_schema())
        self.assertIsNone(dataset.last()["foo"])
        self.assertEqual(created_at1[0], created_at2[0])
        self.assertEqual(last_modified_at1[0], last_modified_at2[0])
        self.assertTrue(created_at2[1] > sample2.created_at)
        self.assertTrue(last_modified_at2[1] > sample2.last_modified_at)

    @drop_datasets
    def test_add_collection_new_ids(self):
        sample1 = fo.Sample(filepath="image.jpg", foo="bar")
        dataset1 = fo.Dataset()
        dataset1.add_sample(sample1)

        # Merge dataset
        dataset = dataset1.clone()
        created_at1 = dataset.values("created_at")
        last_modified_at1 = dataset.values("last_modified_at")
        dataset.add_collection(dataset, new_ids=True)
        created_at2 = dataset.values("created_at")
        last_modified_at2 = dataset.values("last_modified_at")

        self.assertEqual(len(dataset), 2)
        self.assertEqual(len(set(dataset.values("id"))), 2)
        self.assertEqual(dataset.first()["foo"], "bar")
        self.assertEqual(dataset.last()["foo"], "bar")
        self.assertEqual(created_at1[0], created_at2[0])
        self.assertEqual(last_modified_at1[0], last_modified_at2[0])
        self.assertTrue(created_at2[1] > sample1.created_at)
        self.assertTrue(last_modified_at2[1] > sample1.last_modified_at)

        # Merge view
        dataset = dataset1.clone()
        created_at1 = dataset.values("created_at")
        last_modified_at1 = dataset.values("last_modified_at")
        dataset.add_collection(dataset.exclude_fields("foo"), new_ids=True)
        created_at2 = dataset.values("created_at")
        last_modified_at2 = dataset.values("last_modified_at")

        self.assertEqual(len(dataset), 2)
        self.assertEqual(len(set(dataset.values("id"))), 2)
        self.assertEqual(dataset.first()["foo"], "bar")
        self.assertIsNone(dataset.last()["foo"])
        self.assertEqual(created_at1[0], created_at2[0])
        self.assertEqual(last_modified_at1[0], last_modified_at2[0])
        self.assertTrue(created_at2[1] > sample1.created_at)
        self.assertTrue(last_modified_at2[1] > sample1.last_modified_at)

    @drop_datasets
    def test_expand_schema(self):
        # None-valued new fields are ignored for schema expansion

        dataset = fo.Dataset()

        sample = fo.Sample(filepath="image.jpg", ground_truth=None)
        dataset.add_sample(sample)

        self.assertNotIn("ground_truth", dataset.get_field_schema())

        # None-valued new fields are allowed when a later sample determines the
        # appropriate field type

        dataset = fo.Dataset()

        samples = [
            fo.Sample(filepath="image1.jpg", ground_truth=None),
            fo.Sample(filepath="image2.jpg", ground_truth=fo.Classification()),
        ]
        dataset.add_samples(samples)

        self.assertIn("ground_truth", dataset.get_field_schema())

        # Test implied field types

        dataset = fo.Dataset()

        sample = fo.Sample(
            filepath="image.jpg",
            bool_field=True,
            int_field=1,
            float_field=1.0,
            str_field="hi",
            date_field=date.today(),
            datetime_field=datetime.utcnow(),
            list_bool_field=[False, True],
            list_int_field=[1, 2, 3],
            list_float_field=[1.0, 2, 4.1],
            list_str_field=["one", "two", "three"],
            list_date_field=[date.today(), date.today()],
            list_datetime_field=[datetime.utcnow(), datetime.utcnow()],
            list_untyped_field=[1, {"two": "three"}, [4], "five"],
            dict_field={"hello": "world"},
            vector_field=np.arange(5),
            array_field=np.random.randn(3, 4),
        )

        d = sample.to_mongo_dict()

        self.assertIsInstance(d["bool_field"], bool)
        self.assertIsInstance(d["int_field"], int)
        self.assertIsInstance(d["float_field"], float)
        self.assertIsInstance(d["str_field"], str)
        self.assertIsInstance(d["date_field"], datetime)
        self.assertIsInstance(d["datetime_field"], datetime)
        self.assertIsInstance(d["list_bool_field"][0], bool)
        self.assertIsInstance(d["list_int_field"][0], int)
        self.assertIsInstance(d["list_float_field"][0], float)
        self.assertIsInstance(d["list_str_field"][0], str)
        self.assertIsInstance(d["list_date_field"][0], datetime)
        self.assertIsInstance(d["list_datetime_field"][0], datetime)

        dataset.add_sample(sample)
        schema = dataset.get_field_schema()

        # Scalars
        self.assertIsInstance(schema["bool_field"], fo.BooleanField)
        self.assertIsInstance(schema["int_field"], fo.IntField)
        self.assertIsInstance(schema["float_field"], fo.FloatField)
        self.assertIsInstance(schema["str_field"], fo.StringField)
        self.assertIsInstance(schema["date_field"], fo.DateField)
        self.assertIsInstance(schema["datetime_field"], fo.DateTimeField)

        # Lists
        self.assertIsInstance(schema["list_bool_field"], fo.ListField)
        self.assertIsInstance(schema["list_bool_field"].field, fo.BooleanField)

        self.assertIsInstance(schema["list_float_field"], fo.ListField)
        self.assertIsInstance(schema["list_float_field"].field, fo.FloatField)

        self.assertIsInstance(schema["list_int_field"], fo.ListField)
        self.assertIsInstance(schema["list_int_field"].field, fo.IntField)

        self.assertIsInstance(schema["list_str_field"], fo.ListField)
        self.assertIsInstance(schema["list_str_field"].field, fo.StringField)

        self.assertIsInstance(schema["list_date_field"], fo.ListField)
        self.assertIsInstance(schema["list_date_field"].field, fo.DateField)

        self.assertIsInstance(schema["list_datetime_field"], fo.ListField)
        self.assertIsInstance(
            schema["list_datetime_field"].field, fo.DateTimeField
        )

        self.assertIsInstance(schema["list_untyped_field"], fo.ListField)
        self.assertEqual(schema["list_untyped_field"].field, None)

        # Etc
        self.assertIsInstance(schema["dict_field"], fo.DictField)
        self.assertIsInstance(schema["vector_field"], fo.VectorField)
        self.assertIsInstance(schema["array_field"], fo.ArrayField)

    @drop_datasets
    def test_numeric_type_coercions(self):
        sample = fo.Sample(
            filepath="image.png",
            float1=1.0,
            float2=np.float32(1.0),
            float3=np.float64(1.0),
            int1=1,
            int2=np.uint8(1),
            int3=np.int64(1),
            list_float1=[1.0],
            list_float2=[np.float32(1.0)],
            list_float3=[np.float64(1.0)],
            list_int1=[1],
            list_int2=[np.uint8(1)],
            list_int3=[np.int64(1)],
        )

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        self.assertIsInstance(sample.float1, float)
        self.assertIsInstance(sample.float2, float)
        self.assertIsInstance(sample.float3, float)
        self.assertIsInstance(sample.int1, int)
        self.assertIsInstance(sample.int2, int)
        self.assertIsInstance(sample.int3, int)

        self.assertIsInstance(sample.list_float1[0], float)
        self.assertIsInstance(sample.list_float2[0], float)
        self.assertIsInstance(sample.list_float3[0], float)
        self.assertIsInstance(sample.list_int1[0], int)
        self.assertIsInstance(sample.list_int2[0], int)
        self.assertIsInstance(sample.list_int3[0], int)

        schema = dataset.get_field_schema()

        self.assertIsInstance(schema["float1"], fo.FloatField)
        self.assertIsInstance(schema["float2"], fo.FloatField)
        self.assertIsInstance(schema["float3"], fo.FloatField)
        self.assertIsInstance(schema["int1"], fo.IntField)
        self.assertIsInstance(schema["int2"], fo.IntField)
        self.assertIsInstance(schema["int3"], fo.IntField)

        self.assertIsInstance(schema["list_float1"], fo.ListField)
        self.assertIsInstance(schema["list_float2"], fo.ListField)
        self.assertIsInstance(schema["list_float3"], fo.ListField)
        self.assertIsInstance(schema["list_int1"], fo.ListField)
        self.assertIsInstance(schema["list_int2"], fo.ListField)
        self.assertIsInstance(schema["list_int3"], fo.ListField)

        sample["float1"] = 2.0
        sample["float2"] = np.float32(2.0)
        sample["float3"] = np.float64(2.0)
        sample["int1"] = 2
        sample["int2"] = np.uint8(2)
        sample["int3"] = np.int64(2)

        sample["list_float1"][0] = 2.0
        sample["list_float2"][0] = np.float32(2.0)
        sample["list_float3"][0] = np.float64(2.0)
        sample["list_int1"][0] = 2
        sample["list_int2"][0] = np.uint8(2)
        sample["list_int3"][0] = np.int64(2)

        sample.save()

        dataset.set_values("float1", [3.0])
        dataset.set_values("float2", [np.float32(3.0)])
        dataset.set_values("float3", [np.float64(3.0)])
        dataset.set_values("list_float1", [[3.0]])
        dataset.set_values("list_float2", [[np.float32(3.0)]])
        dataset.set_values("list_float3", [[np.float64(3.0)]])
        dataset.set_values("int1", [3])
        dataset.set_values("int2", [np.uint8(3)])
        dataset.set_values("int3", [np.int64(3)])
        dataset.set_values("list_int1", [[3]])
        dataset.set_values("list_int2", [[np.uint8(3)]])
        dataset.set_values("list_int3", [[np.int64(3)]])

        self.assertAlmostEqual(sample["float1"], 3.0)
        self.assertAlmostEqual(sample["float2"], 3.0)
        self.assertAlmostEqual(sample["float3"], 3.0)
        self.assertEqual(sample["int1"], 3)
        self.assertEqual(sample["int2"], 3)
        self.assertEqual(sample["int3"], 3)

        self.assertAlmostEqual(sample["list_float1"][0], 3.0)
        self.assertAlmostEqual(sample["list_float2"][0], 3.0)
        self.assertAlmostEqual(sample["list_float3"][0], 3.0)
        self.assertEqual(sample["list_int1"][0], 3)
        self.assertEqual(sample["list_int2"][0], 3)
        self.assertEqual(sample["list_int3"][0], 3)

        dataset.set_values("float1", [None])
        dataset.set_values("list_float1", [None])
        dataset.set_values("int1", [None])
        dataset.set_values("list_int1", [None])

        self.assertIsNone(sample["float1"])
        self.assertIsNone(sample["list_float1"])
        self.assertIsNone(sample["int1"])
        self.assertIsNone(sample["list_int1"])

    @drop_datasets
    def test_read_only_fields(self):
        sample = fo.Sample(filepath="image.jpg")

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        # Default fields

        field = dataset.get_field("created_at")
        self.assertTrue(field.read_only)

        field = dataset.get_field("last_modified_at")
        self.assertTrue(field.read_only)

        with self.assertRaises(ValueError):
            sample.created_at = datetime.utcnow()

        with self.assertRaises(ValueError):
            sample.last_modified_at = datetime.utcnow()

        # Custom fields

        sample["ground_truth"] = fo.Classification()
        sample.save()

        field = dataset.get_field("ground_truth")
        field.read_only = True
        field.save()

        with self.assertRaises(ValueError):
            sample["ground_truth"] = fo.Classification(label="cat")

        with self.assertRaises(ValueError):
            dataset.add_sample_field("ground_truth.foo", fo.StringField)

        sample.ground_truth.label = "cat"
        with self.assertRaises(ValueError):
            sample.save()

        sample.reload()

        field.read_only = False
        field.save()

        sample.ground_truth.label = "cat"
        sample.save()

        # Embedded fields

        field = dataset.get_field("ground_truth.label")
        field.read_only = True
        field.save()

        with self.assertRaises(ValueError):
            sample["ground_truth.label"] = "dog"

        sample.ground_truth.label = "dog"
        with self.assertRaises(ValueError):
            sample.save()

        sample.reload()

        field.read_only = False
        field.save()

        sample.ground_truth.label = "dog"
        sample.save()

        # Embedded list fields

        sample["predictions"] = fo.Detections(
            detections=[
                fo.Detection(label="dog", confidence=0.9),
                fo.Detection(label="dog", confidence=0.1),
            ]
        )
        sample.save()

        field = dataset.get_field("predictions.detections.label")
        field.read_only = True
        field.save()

        view = dataset.filter_labels("predictions", F("confidence") > 0.5)
        sample_view = view.first()

        sample_view.predictions.detections[0].label = "cat"
        with self.assertRaises(ValueError):
            sample_view.save()

        field.read_only = False
        field.save()

        view.reload()
        sample_view = view.first()
        sample_view.predictions.detections[0].label = "cat"
        sample_view.save()

        # Changing behavior of default fields

        field = dataset.get_field("created_at")
        field.read_only = False
        with self.assertRaises(ValueError):
            field.save()

        field = dataset.get_field("last_modified_at")
        field.read_only = False
        with self.assertRaises(ValueError):
            field.save()

        field = dataset.get_field("filepath")
        field.read_only = True
        field.save()

        with self.assertRaises(ValueError):
            sample.filepath = "no.jpg"

        sample.reload()

        field.read_only = False
        field.save()

        sample.filepath = "yes.jpg"
        sample.save()

        # Add/delete samples when there are read-only fields

        field = dataset.get_field("filepath")
        field.read_only = True
        field.save()

        field = dataset.get_field("ground_truth.label")
        field.read_only = True
        field.save()

        field = dataset.get_field("predictions.detections.label")
        field.read_only = True
        field.save()

        sample = fo.Sample(
            filepath="image2.jpg",
            ground_truth=fo.Classification(label="cat"),
            predictions=fo.Detections(
                detections=[
                    fo.Detection(label="dog", confidence=0.9),
                    fo.Detection(label="dog", confidence=0.1),
                ]
            ),
        )

        dataset.add_sample(sample)

        self.assertEqual(len(dataset), 2)

        dataset.delete_samples(sample)

        self.assertEqual(len(dataset), 1)

    @drop_datasets
    def test_read_only_frame_fields(self):
        sample = fo.Sample(filepath="video.mp4")
        frame = fo.Frame()
        sample.frames[1] = frame

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        # Default fields

        field = dataset.get_field("frames.created_at")
        self.assertTrue(field.read_only)

        field = dataset.get_field("frames.last_modified_at")
        self.assertTrue(field.read_only)

        with self.assertRaises(ValueError):
            frame.created_at = datetime.utcnow()

        with self.assertRaises(ValueError):
            frame.last_modified_at = datetime.utcnow()

        # Custom fields

        frame["ground_truth"] = fo.Classification()
        sample.save()

        field = dataset.get_field("frames.ground_truth")
        field.read_only = True
        field.save()

        with self.assertRaises(ValueError):
            frame["ground_truth"] = fo.Classification(label="cat")

        with self.assertRaises(ValueError):
            dataset.add_frame_field("ground_truth.foo", fo.StringField)

        frame.ground_truth.label = "cat"
        with self.assertRaises(ValueError):
            sample.save()
        with self.assertRaises(ValueError):
            frame.save()

        sample.reload()

        field.read_only = False
        field.save()

        frame.ground_truth.label = "cat"
        frame.save()

        # Embedded fields

        frame["ground_truth"] = fo.Classification()
        frame.save()

        field = dataset.get_field("frames.ground_truth.label")
        field.read_only = True
        field.save()

        with self.assertRaises(ValueError):
            frame["ground_truth.label"] = "cat"

        frame.ground_truth.label = "cat"
        with self.assertRaises(ValueError):
            sample.save()
        with self.assertRaises(ValueError):
            frame.save()

        frame.reload()

        field.read_only = False
        field.save()

        frame.ground_truth.label = "cat"
        frame.save()

        # Embedded list fields

        frame["predictions"] = fo.Detections(
            detections=[
                fo.Detection(label="dog", confidence=0.9),
                fo.Detection(label="dog", confidence=0.1),
            ]
        )
        frame.save()

        field = dataset.get_field("frames.predictions.detections.label")
        field.read_only = True
        field.save()

        view = dataset.filter_labels(
            "frames.predictions", F("confidence") > 0.5
        )
        sample_view = view.first()
        frame_view = sample_view.frames.first()

        frame_view.predictions.detections[0].label = "cat"
        with self.assertRaises(ValueError):
            sample_view.save()
        with self.assertRaises(ValueError):
            frame_view.save()

        field.read_only = False
        field.save()

        view.reload()
        sample_view = view.first()
        frame_view = sample_view.frames.first()
        frame_view.predictions.detections[0].label = "cat"
        sample_view.save()

        # Changing behavior of default fields

        field = dataset.get_field("frames.created_at")
        field.read_only = False
        with self.assertRaises(ValueError):
            field.save()

        field = dataset.get_field("frames.last_modified_at")
        field.read_only = False
        with self.assertRaises(ValueError):
            field.save()

        field = dataset.get_field("frames.frame_number")
        field.read_only = True
        field.save()

        with self.assertRaises(ValueError):
            frame.frame_number = 51

        frame.reload()

        field.read_only = False
        field.save()

        frame.frame_number = 51
        frame.save()

        # Add/delete frames when there are read-only fields

        field = dataset.get_field("frames.frame_number")
        field.read_only = True
        field.save()

        field = dataset.get_field("frames.ground_truth.label")
        field.read_only = True
        field.save()

        field = dataset.get_field("frames.predictions.detections.label")
        field.read_only = True
        field.save()

        frame2 = fo.Frame(
            ground_truth=fo.Classification(label="cat"),
            predictions=fo.Detections(
                detections=[
                    fo.Detection(label="dog", confidence=0.9),
                    fo.Detection(label="dog", confidence=0.1),
                ]
            ),
        )

        sample.frames[2] = frame2
        sample.frames[3] = frame2.copy()
        sample.save()

        self.assertEqual(dataset.count("frames"), 3)

        dataset.delete_frames(frame2)

        self.assertEqual(dataset.count("frames"), 2)

        del sample.frames[3]
        sample.save()

        self.assertEqual(dataset.count("frames"), 1)

    @skip_windows  # TODO: don't skip on Windows
    @drop_datasets
    def test_rename_fields(self):
        sample = fo.Sample(filepath="/path/to/image.jpg", field=1)

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        created_at = dataset.get_field("field").created_at
        dataset.rename_sample_field("field", "new_field")

        # Renaming doesn't cause created_at to update
        self.assertEqual(dataset.get_field("new_field").created_at, created_at)
        self.assertFalse("field" in dataset.get_field_schema())
        self.assertTrue("new_field" in dataset.get_field_schema())
        self.assertEqual(sample["new_field"], 1)
        self.assertListEqual(dataset.values("new_field"), [1])
        with self.assertRaises(KeyError):
            sample["field"]

    @skip_windows  # TODO: don't skip on Windows
    @drop_datasets
    def test_rename_embedded_fields(self):
        sample = fo.Sample(
            filepath="image.jpg",
            predictions=fo.Detections(detections=[fo.Detection(field=1)]),
        )

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        dataset.rename_sample_field(
            "predictions.detections.field",
            "predictions.detections.new_field",
        )
        self.assertEqual(sample.predictions.detections[0].new_field, 1)
        self.assertListEqual(
            dataset.values("predictions.detections.new_field", unwind=True),
            [1],
        )
        with self.assertRaises(AttributeError):
            sample.predictions.detections[0].field

        dataset.clear_sample_field("predictions.detections.new_field")
        self.assertIsNone(sample.predictions.detections[0].new_field)

        dataset.delete_sample_field("predictions.detections.new_field")
        with self.assertRaises(AttributeError):
            sample.predictions.detections[0].new_field

    @drop_datasets
    def test_rename_delete_indexes(self):
        sample = fo.Sample(
            filepath="video.mp4",
            field=1,
            predictions=fo.Detections(detections=[fo.Detection(field=1)]),
        )
        sample.frames[1] = fo.Frame(
            field=1,
            predictions=fo.Detections(detections=[fo.Detection(field=1)]),
        )

        dataset = fo.Dataset()
        dataset.add_sample(sample, dynamic=True)

        dataset.create_index("field")
        dataset.create_index([("id", 1), ("field", -1)])
        dataset.create_index("predictions.detections.field")

        dataset.create_index("frames.field")
        dataset.create_index([("frames.id", 1), ("frames.field", -1)])
        dataset.create_index("frames.predictions.detections.field")

        index_info = dataset.get_index_information()

        self.assertIn("field", index_info)
        self.assertIn("_id_1_field_-1", index_info)
        self.assertIn("predictions.detections.field", index_info)

        self.assertIn("frames.field", index_info)
        self.assertIn("frames._id_1_field_-1", index_info)
        self.assertIn("frames.predictions.detections.field", index_info)

        dataset.rename_sample_fields({"field": "f", "predictions": "p"})
        dataset.rename_frame_fields({"field": "f", "predictions": "p"})

        index_info = dataset.get_index_information()

        self.assertIn("f", index_info)
        self.assertIn("_id_1_f_-1", index_info)
        self.assertIn("p.detections.field", index_info)

        self.assertIn("frames.f", index_info)
        self.assertIn("frames._id_1_f_-1", index_info)
        self.assertIn("frames.p.detections.field", index_info)

        dataset.delete_sample_fields(["f", "p"])
        dataset.delete_frame_fields(["f", "p"])

        indexes = dataset.list_indexes()

        self.assertSetEqual(
            set(indexes),
            {
                "id",
                "filepath",
                "created_at",
                "last_modified_at",
                "frames.id",
                "frames.created_at",
                "frames.last_modified_at",
                "frames._sample_id_1_frame_number_1",
            },
        )

    @skip_windows  # TODO: don't skip on Windows
    @drop_datasets
    def test_clone_fields(self):
        sample = fo.Sample(filepath="image.jpg", field=1)

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        created_at = dataset.get_field("field").created_at
        lma1a = sample.last_modified_at
        lma1b = dataset.values("last_modified_at")[0]
        dataset.clone_sample_field("field", "field_copy")
        schema = dataset.get_field_schema()
        lma2a = sample.last_modified_at
        lma2b = dataset.values("last_modified_at")[0]
        self.assertIn("field", schema)
        self.assertIn("field_copy", schema)
        self.assertGreater(
            dataset.get_field("field_copy").created_at, created_at
        )
        self.assertIsNotNone(sample.field)
        self.assertIsNotNone(sample.field_copy)
        self.assertEqual(sample.field, 1)
        self.assertEqual(sample.field_copy, 1)
        self.assertListEqual(dataset.values("field"), [1])
        self.assertListEqual(dataset.values("field_copy"), [1])
        self.assertTrue(lma1a < lma2a)
        self.assertTrue(lma1b < lma2b)

        lma1a = sample.last_modified_at
        lma1b = dataset.values("last_modified_at")[0]
        dataset.clear_sample_field("field")
        schema = dataset.get_field_schema()
        lma2a = sample.last_modified_at
        lma2b = dataset.values("last_modified_at")[0]
        self.assertIn("field", schema)
        self.assertIsNone(sample.field)
        self.assertIsNotNone(sample.field_copy)
        self.assertTrue(lma1a < lma2a)
        self.assertTrue(lma1b < lma2b)

        lma1a = sample.last_modified_at
        lma1b = dataset.values("last_modified_at")[0]
        dataset.delete_sample_field("field")
        lma2a = sample.last_modified_at
        lma2b = dataset.values("last_modified_at")[0]
        self.assertIsNotNone(sample.field_copy)
        with self.assertRaises(AttributeError):
            sample.field
        self.assertTrue(lma1a < lma2a)
        self.assertTrue(lma1b < lma2b)

        lma1a = sample.last_modified_at
        lma1b = dataset.values("last_modified_at")[0]
        dataset.rename_sample_field("field_copy", "field")
        lma2a = sample.last_modified_at
        lma2b = dataset.values("last_modified_at")[0]
        self.assertIsNotNone(sample.field)
        with self.assertRaises(AttributeError):
            sample.field_copy
        self.assertTrue(lma1a < lma2a)
        self.assertTrue(lma1b < lma2b)

    @skip_windows  # TODO: don't skip on Windows
    @drop_datasets
    def test_object_id_fields1(self):
        sample = fo.Sample(filepath="image.jpg")

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        # Clone field

        dataset.clone_sample_field("id", "sample_id")

        schema = dataset.get_field_schema()
        self.assertIn("sample_id", schema)

        self.assertIsInstance(sample.sample_id, str)

        ids = dataset.values("sample_id")
        self.assertIsInstance(ids[0], str)

        oids = dataset.values("_sample_id")
        self.assertIsInstance(oids[0], ObjectId)

        view = dataset.select_fields("sample_id")
        sample_view = view.first()

        self.assertIsInstance(sample_view.sample_id, str)

        ids = view.values("sample_id")
        self.assertIsInstance(ids[0], str)

        oids = view.values("_sample_id")
        self.assertIsInstance(oids[0], ObjectId)

        # Rename field

        dataset.rename_sample_field("sample_id", "still_sample_id")

        schema = dataset.get_field_schema()
        self.assertIn("still_sample_id", schema)
        self.assertNotIn("sample_id", schema)

        self.assertIsInstance(sample.still_sample_id, str)

        with self.assertRaises(AttributeError):
            sample.sample_id

        ids = dataset.values("still_sample_id")
        self.assertIsInstance(ids[0], str)

        oids = dataset.values("_still_sample_id")
        self.assertIsInstance(oids[0], ObjectId)

        # Clear field

        dataset.clone_sample_field("still_sample_id", "also_sample_id")
        dataset.clear_sample_field("also_sample_id")

        self.assertIsNone(sample.also_sample_id)

        ids = dataset.values("also_sample_id")
        self.assertIsNone(ids[0])

        oids = dataset.values("_also_sample_id")
        self.assertIsNone(oids[0])

        # Delete field

        dataset.delete_sample_field("still_sample_id")

        schema = dataset.get_field_schema()
        self.assertNotIn("still_sample_id", schema)

        with self.assertRaises(AttributeError):
            sample.still_sample_id

        sample_view = dataset.view().first()

        with self.assertRaises(AttributeError):
            sample_view.still_sample_id

    @drop_datasets
    def test_object_id_fields2(self):
        #
        # In order to add custom ObjectId fields to a dataset, you must first
        # declare them
        #

        dataset = fo.Dataset()
        dataset.add_sample_field("other_id", fo.ObjectIdField)

        # ObjectIds are presented to user as strings
        sample = fo.Sample(filepath="image.jpg", other_id=ObjectId())
        self.assertIsInstance(sample.other_id, str)

        # But they are correctly serialized as private ObjectId values
        d = sample.to_mongo_dict()
        self.assertIsInstance(d["_other_id"], ObjectId)

        dataset.add_sample(sample)

        # Verify that serialization still works when sample is in dataset
        d = sample.to_mongo_dict()
        self.assertIsInstance(d["_other_id"], ObjectId)

        #
        # ObjectId fields can be selected and excluded as usual
        #

        view = dataset.select_fields("other_id")
        sample_view = view.first()

        self.assertIsInstance(sample_view.other_id, str)

        d = sample_view.to_mongo_dict()
        self.assertIsInstance(d["_other_id"], ObjectId)

        view = dataset.exclude_fields("other_id")
        sample_view = view.first()

        with self.assertRaises(AttributeError):
            sample_view.other_id

        d = sample_view.to_mongo_dict()
        self.assertNotIn("other_id", d)
        self.assertNotIn("_other_id", d)

        #
        # You cannot dynamically add ObjectId fields because they are presented
        # as strings and thus the wrong field type will be inferred
        #

        dataset = fo.Dataset()

        sample = fo.Sample(filepath="image.jpg", other_id=ObjectId())

        # ValidationError: StringField cannot except ObjectId values
        with self.assertRaises(Exception):
            dataset.add_sample(sample)

    @drop_datasets
    def test_embedded_document_fields1(self):
        sample = fo.Sample(
            "image.jpg",
            detection=fo.Detection(
                polylines=fo.Polylines(polylines=[fo.Polyline()])
            ),
        )

        self.assertEqual(len(sample.detection.polylines.polylines), 1)

        d = sample.to_dict()
        sample2 = fo.Sample.from_dict(d)

        self.assertEqual(len(sample2.detection.polylines.polylines), 1)

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        view = dataset.view()
        sample_view = view.first()

        self.assertEqual(len(sample_view.detection.polylines.polylines), 1)

    @drop_datasets
    def test_embedded_document_fields2(self):
        sample = fo.Sample(filepath="image.jpg")

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        sample["detection"] = fo.Detection(
            polylines=fo.Polylines(polylines=[fo.Polyline()])
        )
        sample.save()

        self.assertEqual(len(sample.detection.polylines.polylines), 1)

        d = sample.to_dict()
        sample2 = fo.Sample.from_dict(d)

        self.assertEqual(len(sample2.detection.polylines.polylines), 1)

        view = dataset.view()
        sample_view = view.first()

        self.assertEqual(len(sample_view.detection.polylines.polylines), 1)

    @skip_windows  # TODO: don't skip on Windows
    @drop_datasets
    def test_clone_embedded_fields(self):
        sample = fo.Sample(
            filepath="image.jpg",
            predictions=fo.Detections(detections=[fo.Detection(field=1)]),
        )

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        dataset.clone_sample_field(
            "predictions.detections.field",
            "predictions.detections.field_copy",
        )
        self.assertIsNotNone(sample.predictions.detections[0].field)
        self.assertIsNotNone(sample.predictions.detections[0].field_copy)
        self.assertListEqual(
            dataset.values("predictions.detections.field", unwind=True),
            [1],
        )
        self.assertListEqual(
            dataset.values("predictions.detections.field_copy", unwind=True),
            [1],
        )

        dataset.clear_sample_field("predictions.detections.field")
        self.assertIsNone(sample.predictions.detections[0].field)

        dataset.delete_sample_field("predictions.detections.field")
        self.assertIsNotNone(sample.predictions.detections[0].field_copy)
        with self.assertRaises(AttributeError):
            sample.predictions.detections[0].field

        dataset.rename_sample_field(
            "predictions.detections.field_copy",
            "predictions.detections.field",
        )
        self.assertIsNotNone(sample.predictions.detections[0].field)
        with self.assertRaises(AttributeError):
            sample.predictions.detections[0].field_copy

    @skip_windows  # TODO: don't skip on Windows
    @drop_datasets
    def test_clone_frame_fields(self):
        sample = fo.Sample(filepath="video.mp4")
        frame = fo.Frame(field=1)
        sample.frames[1] = frame

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        lma1a = frame.last_modified_at
        lma1b = dataset.values("frames.last_modified_at", unwind=True)[0]
        dataset.clone_frame_field("field", "field_copy")
        schema = dataset.get_frame_field_schema()
        lma2a = frame.last_modified_at
        lma2b = dataset.values("frames.last_modified_at", unwind=True)[0]
        self.assertIn("field", schema)
        self.assertIn("field_copy", schema)
        self.assertEqual(frame.field, 1)
        self.assertEqual(frame.field_copy, 1)
        self.assertListEqual(dataset.values("frames.field", unwind=True), [1])
        self.assertListEqual(
            dataset.values("frames.field_copy", unwind=True), [1]
        )
        self.assertTrue(lma1a < lma2a)
        self.assertTrue(lma1b < lma2b)

        lma1a = frame.last_modified_at
        lma1b = dataset.values("frames.last_modified_at", unwind=True)[0]
        dataset.clear_frame_field("field")
        schema = dataset.get_frame_field_schema()
        lma2a = frame.last_modified_at
        lma2b = dataset.values("frames.last_modified_at", unwind=True)[0]
        self.assertIn("field", schema)
        self.assertIsNone(frame.field)
        self.assertIsNotNone(frame.field_copy)
        self.assertTrue(lma1a < lma2a)
        self.assertTrue(lma1b < lma2b)

        lma1a = frame.last_modified_at
        lma1b = dataset.values("frames.last_modified_at", unwind=True)[0]
        dataset.delete_frame_field("field")
        lma2a = frame.last_modified_at
        lma2b = dataset.values("frames.last_modified_at", unwind=True)[0]
        self.assertIsNotNone(frame.field_copy)
        with self.assertRaises(AttributeError):
            frame.field
        self.assertTrue(lma1a < lma2a)
        self.assertTrue(lma1b < lma2b)

        lma1a = frame.last_modified_at
        lma1b = dataset.values("frames.last_modified_at", unwind=True)[0]
        dataset.rename_frame_field("field_copy", "field")
        lma2a = frame.last_modified_at
        lma2b = dataset.values("frames.last_modified_at", unwind=True)[0]
        self.assertIsNotNone(frame.field)
        with self.assertRaises(AttributeError):
            frame.field_copy
        self.assertTrue(lma1a < lma2a)
        self.assertTrue(lma1b < lma2b)
        self.assertTrue(lma1a < lma2a)
        self.assertTrue(lma1b < lma2b)

    @skip_windows  # TODO: don't skip on Windows
    @drop_datasets
    def test_clone_embedded_frame_fields(self):
        sample = fo.Sample(filepath="video.mp4")
        frame = fo.Frame(
            predictions=fo.Detections(detections=[fo.Detection(field=1)])
        )
        sample.frames[1] = frame

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        dataset.clone_frame_field(
            "predictions.detections.field",
            "predictions.detections.field_copy",
        )
        self.assertIsNotNone(frame.predictions.detections[0].field)
        self.assertIsNotNone(frame.predictions.detections[0].field_copy)
        self.assertListEqual(
            dataset.values("frames.predictions.detections.field", unwind=True),
            [1],
        )
        self.assertListEqual(
            dataset.values(
                "frames.predictions.detections.field_copy", unwind=True
            ),
            [1],
        )

        dataset.clear_frame_field("predictions.detections.field")
        self.assertIsNone(frame.predictions.detections[0].field)

        dataset.delete_frame_field("predictions.detections.field")
        self.assertIsNotNone(frame.predictions.detections[0].field_copy)
        with self.assertRaises(AttributeError):
            frame.predictions.detections[0].field

        dataset.rename_frame_field(
            "predictions.detections.field_copy",
            "predictions.detections.field",
        )
        self.assertIsNotNone(frame.predictions.detections[0].field)
        with self.assertRaises(AttributeError):
            frame.predictions.detections[0].field_copy

    @drop_datasets
    def test_clear_cache(self):
        samples = [fo.Sample(filepath=f"{i}.mp4") for i in range(10)]
        sample1 = samples[0]
        sample1.frames[1] = fo.Frame()
        frame1 = sample1.frames[1]

        dataset = fo.Dataset()
        dataset.add_samples(samples)

        also_sample1 = dataset.first()
        also_frame1 = also_sample1.frames[1]

        self.assertTrue(also_sample1 is sample1)
        self.assertTrue(also_frame1 is frame1)

        dataset.clear_cache()

        not_sample1 = dataset.first()
        not_frame1 = not_sample1.frames[1]

        self.assertFalse(not_sample1 is sample1)
        self.assertFalse(not_frame1 is frame1)

    @drop_datasets
    def test_classes(self):
        dataset = fo.Dataset()

        default_classes = ["cat", "dog"]
        dataset.default_classes = default_classes

        dataset.reload()
        self.assertListEqual(dataset.default_classes, default_classes)

        with self.assertRaises(Exception):
            dataset.default_classes.append(1)
            dataset.save()  # error

        dataset.save()  # success

        classes = {"ground_truth": ["cat", "dog"]}

        dataset.classes = classes

        dataset.reload()
        self.assertDictEqual(dataset.classes, classes)

        with self.assertRaises(Exception):
            dataset.classes["other"] = {"hi": "there"}
            dataset.save()  # error

        dataset.save()  # success

        with self.assertRaises(Exception):
            dataset.classes["ground_truth"].append(1)
            dataset.save()  # error

        dataset.save()  # success

    @drop_datasets
    def test_mask_targets(self):
        dataset = fo.Dataset()

        default_mask_targets = {1: "cat", 2: "dog"}
        default_mask_targets_str_keys = {"1": "cat", "2": "dog"}

        dataset.default_mask_targets = default_mask_targets
        dataset.default_mask_targets = default_mask_targets_str_keys

        default_mask_targets_invalid_str_keys = {"1hi": "cat", "2": "dog"}

        with self.assertRaises(ValidationError):
            dataset.default_mask_targets = (
                default_mask_targets_invalid_str_keys
            )

        dataset.reload()
        self.assertDictEqual(
            dataset.default_mask_targets, default_mask_targets
        )

        # test rgb mask targets
        default_mask_targets_rgb = {
            "#ff0034": "label1",
            "#00dd32": "label2",
            "#AABB23": "label3",
        }
        dataset.default_mask_targets = default_mask_targets_rgb

        default_mask_targets_rgb_invalid = {"ff0034": "label1"}

        with self.assertRaises(ValidationError):
            dataset.default_mask_targets = default_mask_targets_rgb_invalid

        with self.assertRaises(ValidationError):
            dataset.default_mask_targets["hi"] = "there"
            dataset.save()  # error

        dataset.save()  # success

        mask_targets = {"ground_truth": {1: "cat", 2: "dog"}}
        dataset.mask_targets = mask_targets

        dataset.reload()
        self.assertDictEqual(dataset.mask_targets, mask_targets)

        with self.assertRaises(ValidationError):
            dataset.mask_targets["hi"] = "there"
            dataset.save()  # error

        dataset.save()  # success

        with self.assertRaises(ValidationError):
            dataset.mask_targets[1] = {1: "cat", 2: "dog"}
            dataset.save()  # error

        dataset.save()  # success

        with self.assertRaises(ValidationError):
            dataset.mask_targets["ground_truth"]["hi"] = "there"
            dataset.save()  # error

        dataset.save()  # success

        with self.assertRaises(ValidationError):
            dataset.mask_targets["predictions"] = {1: {"too": "many"}}
            dataset.save()  # error

        dataset.save()  # success

    @drop_datasets
    def test_skeletons(self):
        dataset = fo.Dataset()

        default_skeleton = fo.KeypointSkeleton(
            labels=["left eye", "right eye"], edges=[[0, 1]]
        )
        dataset.default_skeleton = default_skeleton

        dataset.reload()
        self.assertEqual(dataset.default_skeleton, default_skeleton)

        with self.assertRaises(Exception):
            dataset.default_skeleton.labels = [1]
            dataset.save()  # error

        dataset.save()  # success

        with self.assertRaises(Exception):
            dataset.default_skeleton.edges = "hello"
            dataset.save()  # error

        dataset.save()  # success

        dataset.default_skeleton.edges = [[0, 1]]
        dataset.save()  # success

        dataset.default_skeleton.labels = None
        dataset.save()  # success

        skeletons = {
            "ground_truth": fo.KeypointSkeleton(
                labels=["left eye", "right eye"], edges=[[0, 1]]
            )
        }
        dataset.skeletons = skeletons

        dataset.reload()
        self.assertDictEqual(dataset.skeletons, skeletons)

        with self.assertRaises(Exception):
            dataset.skeletons["hi"] = "there"
            dataset.save()  # error

        dataset.save()  # success

        with self.assertRaises(Exception):
            dataset.skeletons[1] = fo.KeypointSkeleton(
                labels=["left eye", "right eye"], edges=[[0, 1]]
            )
            dataset.save()  # error

        dataset.save()  # success

        with self.assertRaises(Exception):
            dataset.skeletons["ground_truth"].labels = [1]
            dataset.save()  # error

        dataset.save()  # success

        with self.assertRaises(Exception):
            dataset.skeletons["ground_truth"].edges = "hello"
            dataset.save()  # error

        dataset.save()  # success

        dataset.skeletons["ground_truth"].labels = None
        dataset.save()  # success

    @drop_datasets
    def test_dataset_info_import_export(self):
        dataset = fo.Dataset()

        dataset.info = {"hi": "there"}

        dataset.classes = {"ground_truth": ["cat", "dog"]}
        dataset.default_classes = ["cat", "dog"]

        dataset.mask_targets = {"ground_truth": {1: "cat", 2: "dog"}}
        dataset.default_mask_targets = {1: "cat", 2: "dog"}

        dataset.skeletons = {
            "ground_truth": fo.KeypointSkeleton(
                labels=["left eye", "right eye"], edges=[[0, 1]]
            )
        }
        dataset.default_skeleton = fo.KeypointSkeleton(
            labels=["left eye", "right eye"], edges=[[0, 1]]
        )

        with etau.TempDir() as tmp_dir:
            json_path = os.path.join(tmp_dir, "dataset.json")

            dataset.write_json(json_path)
            dataset2 = fo.Dataset.from_json(json_path)

            self.assertDictEqual(dataset2.info, dataset.info)

            self.assertDictEqual(dataset2.classes, dataset.classes)
            self.assertEqual(dataset2.default_classes, dataset.default_classes)

            self.assertDictEqual(dataset2.mask_targets, dataset.mask_targets)
            self.assertEqual(
                dataset2.default_mask_targets, dataset.default_mask_targets
            )

            self.assertDictEqual(dataset2.skeletons, dataset.skeletons)
            self.assertEqual(
                dataset2.default_skeleton, dataset.default_skeleton
            )

        with etau.TempDir() as tmp_dir:
            dataset_dir = os.path.join(tmp_dir, "dataset")

            dataset.export(dataset_dir, fo.types.FiftyOneDataset)
            dataset3 = fo.Dataset.from_dir(
                dataset_dir, fo.types.FiftyOneDataset
            )

            self.assertDictEqual(dataset3.info, dataset.info)

            self.assertDictEqual(dataset3.classes, dataset.classes)
            self.assertEqual(dataset3.default_classes, dataset.default_classes)

            self.assertDictEqual(dataset3.mask_targets, dataset.mask_targets)
            self.assertEqual(
                dataset3.default_mask_targets, dataset.default_mask_targets
            )

            self.assertDictEqual(dataset3.skeletons, dataset.skeletons)
            self.assertEqual(
                dataset3.default_skeleton, dataset.default_skeleton
            )


class DatasetExtrasTests(unittest.TestCase):
    @drop_datasets
    def setUp(self):
        self.dataset = fo.Dataset()
        self.dataset.add_samples(
            [
                fo.Sample(
                    filepath="image1.png",
                    ground_truth=fo.Classification(label="cat"),
                    predictions=fo.Classification(label="dog", confidence=0.9),
                ),
                fo.Sample(
                    filepath="image2.png",
                    ground_truth=fo.Classification(label="dog"),
                    predictions=fo.Classification(label="dog", confidence=0.8),
                ),
                fo.Sample(
                    filepath="image3.png",
                    ground_truth=fo.Classification(label="dog"),
                    predictions=fo.Classification(label="pig", confidence=0.1),
                ),
            ]
        )

    def test_saved_views(self):
        dataset = self.dataset

        self.assertFalse(dataset.has_saved_views)
        self.assertListEqual(dataset.list_saved_views(), [])

        view = dataset.match(F("filepath").contains_str("image2"))

        self.assertIsNone(view.name)
        self.assertFalse(view.is_saved)
        self.assertEqual(len(view), 1)
        self.assertTrue("image2" in view.first().filepath)

        view_name = "test"
        dataset.save_view(view_name, view)

        last_loaded_at1 = dataset._doc.saved_views[0].last_loaded_at
        last_modified_at1 = dataset._doc.saved_views[0].last_modified_at
        created_at1 = dataset._doc.saved_views[0].created_at

        self.assertEqual(view.name, view_name)
        self.assertTrue(view.is_saved)
        self.assertTrue(dataset.has_saved_views)
        self.assertTrue(dataset.has_saved_view(view_name))
        self.assertListEqual(dataset.list_saved_views(), [view_name])

        self.assertIsNone(last_loaded_at1)
        self.assertIsNotNone(last_modified_at1)
        self.assertIsNotNone(created_at1)

        still_saved_view = deepcopy(view)
        self.assertEqual(still_saved_view.name, view_name)
        self.assertTrue(still_saved_view.is_saved)
        self.assertEqual(still_saved_view, view)

        not_saved_view = view.limit(1)
        self.assertIsNone(not_saved_view.name)
        self.assertFalse(not_saved_view.is_saved)

        also_view = dataset.load_saved_view(view_name)
        last_loaded_at2 = dataset._doc.saved_views[0].last_loaded_at

        self.assertEqual(view, also_view)
        self.assertEqual(also_view.name, view_name)
        self.assertIsNotNone(last_loaded_at2)

        info = dataset.get_saved_view_info(view_name)
        new_view_name = "new-name"
        info["name"] = new_view_name

        dataset.update_saved_view_info(view_name, info)

        created_at2 = dataset._doc.saved_views[0].created_at
        last_modified_at2 = dataset._doc.saved_views[0].last_modified_at

        self.assertEqual(created_at2, created_at1)
        self.assertTrue(last_modified_at2 > last_modified_at1)
        self.assertFalse(dataset.has_saved_view(view_name))
        self.assertTrue(dataset.has_saved_view(new_view_name))

        updated_view = dataset.load_saved_view(new_view_name)
        self.assertEqual(updated_view.name, new_view_name)
        dataset.update_saved_view_info(new_view_name, {"name": view_name})

        #
        # Verify that saved views are included in clones
        #

        dataset2 = dataset.clone()

        self.assertTrue(dataset2.has_saved_views)
        self.assertTrue(dataset2.has_saved_view(view_name))
        self.assertListEqual(dataset2.list_saved_views(), [view_name])

        view2 = dataset2.load_saved_view(view_name)

        self.assertEqual(len(view2), 1)
        self.assertTrue("image2" in view2.first().filepath)

        created_at3 = dataset2._doc.saved_views[0].created_at
        last_modified_at3 = dataset2._doc.saved_views[0].last_modified_at
        last_loaded_at3 = dataset2._doc.saved_views[0].last_loaded_at

        self.assertTrue(created_at3 > created_at2)
        self.assertTrue(last_modified_at3 > last_modified_at2)
        self.assertTrue(last_loaded_at3 > last_loaded_at2)

        dataset.delete_saved_view(view_name)

        self.assertFalse(dataset.has_saved_views)
        self.assertFalse(dataset.has_saved_view(view_name))
        self.assertListEqual(dataset.list_saved_views(), [])

        # Verify that cloned data is properly decoupled from source dataset
        also_view2 = dataset2.load_saved_view(view_name)
        self.assertIsNotNone(also_view2)

        #
        # Verify that saved views are deleted when a dataset is deleted
        #

        view_id = dataset2._doc.saved_views[0].id

        db = foo.get_db_conn()

        self.assertEqual(len(list(db.views.find({"_id": view_id}))), 1)

        dataset2.delete()

        self.assertEqual(len(list(db.views.find({"_id": view_id}))), 0)

    def test_saved_views_for_app(self):
        dataset = self.dataset

        names = ["my-view1", "my_view2", "My  %&#  View3!"]
        slugs = ["my-view1", "my-view2", "my-view3"]

        for idx, name in enumerate(names, 1):
            dataset.save_view(name, dataset.limit(idx))

        # Can't use duplicate name when saving a view
        with self.assertRaises(ValueError):
            dataset.save_view("my-view1", dataset.limit(1))

        # Can't use duplicate slug when saving a view
        with self.assertRaises(ValueError):
            dataset.save_view("my   view1", dataset.limit(1))

        # Can't rename a view to an existing name
        with self.assertRaises(ValueError):
            dataset.update_saved_view_info("my-view1", {"name": "my_view2"})

        # Can't rename a view to an existing slug
        with self.assertRaises(ValueError):
            dataset.update_saved_view_info("my-view1", {"name": "my_view2!"})

        view_docs = dataset._doc.saved_views

        self.assertListEqual([v.name for v in view_docs], names)
        self.assertListEqual([v.slug for v in view_docs], slugs)

        dataset.delete_saved_view("my_view2")

        self.assertSetEqual(
            {v.name for v in dataset._doc.saved_views},
            {names[0], names[2]},
        )

        dataset.delete_saved_views()

        self.assertListEqual(dataset._doc.saved_views, [])

    @drop_datasets
    def test_concurrent_saved_view_updates(self):
        dataset = fo.Dataset()
        v = dataset.limit(2)

        # Don't reuse singleton; we want to test concurrent edits here
        dataset._instances.pop(dataset.name)
        also_dataset = fo.load_dataset(dataset.name)
        v2 = also_dataset.limit(5)
        self.assertIsNot(dataset, also_dataset)

        # Test add save view safety
        dataset.save_view("view1", v)
        also_dataset.save_view("view2", v2)

        self.assertListEqual(dataset.list_saved_views(), ["view1"])

        dataset.reload()
        self.assertListEqual(dataset.list_saved_views(), ["view1", "view2"])

        # Test delete saved view safety
        also_dataset.reload()
        dataset.delete_saved_view("view1")
        also_dataset.delete_saved_view("view2")
        dataset.reload()
        self.assertListEqual(dataset.list_saved_views(), [])

        # Test delete all saved views safety
        also_dataset.reload()
        dataset.save_view("view1", v)
        also_dataset.delete_saved_views()
        also_dataset.reload()
        self.assertListEqual(also_dataset.list_saved_views(), [])

    def test_workspaces(self):
        dataset = self.dataset

        self.assertFalse(dataset.has_workspaces)
        self.assertListEqual(dataset.list_workspaces(), [])

        samples_panel = fo.Panel(type="Samples", pinned=True)

        histograms_panel = fo.Panel(
            type="Histograms",
            state=dict(plot="Labels"),
        )

        embeddings_panel = fo.Panel(
            type="Embeddings",
            state=dict(
                brainResult="img_viz", colorByField="metadata.size_bytes"
            ),
        )

        spaces = fo.Space(
            children=[
                fo.Space(
                    children=[
                        fo.Space(children=[samples_panel]),
                        fo.Space(children=[histograms_panel]),
                    ],
                    orientation="horizontal",
                ),
                fo.Space(children=[embeddings_panel]),
            ],
            orientation="vertical",
        )

        self.assertIsNone(spaces.name)

        workspace_name = "test__workspace"
        now = datetime.utcnow()
        description = "a description of the workspace, yo"
        color = "#FF6D04"

        dataset.save_workspace(
            workspace_name, spaces, description=description, color=color
        )

        last_loaded_at1 = dataset._doc.workspaces[0].last_loaded_at
        last_modified_at1 = dataset._doc.workspaces[0].last_modified_at
        created_at1 = dataset._doc.workspaces[0].created_at

        self.assertEqual(spaces.name, workspace_name)
        self.assertTrue(dataset.has_workspaces)
        self.assertTrue(dataset.has_workspace(workspace_name))
        self.assertListEqual(dataset.list_workspaces(), [workspace_name])

        self.assertIsNone(last_loaded_at1)
        self.assertAlmostEqual(
            last_modified_at1, now, delta=timedelta(milliseconds=100)
        )
        self.assertEqual(last_modified_at1, created_at1)

        still_spaces = deepcopy(spaces)
        self.assertEqual(still_spaces.name, workspace_name)
        self.assertEqual(still_spaces, spaces)

        # Reload to ensure we actually saved the doc properly, now load
        #   the workspace back.
        dataset.reload()
        also_spaces = dataset.load_workspace(workspace_name)
        last_loaded_at2 = dataset._doc.workspaces[0].last_loaded_at
        now = datetime.utcnow()

        self.assertEqual(spaces, also_spaces)
        self.assertEqual(also_spaces.name, workspace_name)
        self.assertAlmostEqual(
            last_loaded_at2, now, delta=timedelta(milliseconds=100)
        )

        workspace_info = dataset.get_workspace_info(workspace_name)
        self.assertEqual(workspace_info["name"], workspace_name)
        self.assertEqual(workspace_info["description"], description)
        self.assertEqual(workspace_info["color"], color)

        # Update workspace info

        new_workspace_name = "new-name"
        new_description = "a new description for you"
        new_info = {"name": new_workspace_name, "description": new_description}

        dataset.update_workspace_info(workspace_name, new_info)
        last_modified_at2 = dataset._doc.workspaces[0].last_modified_at
        created_at2 = dataset._doc.workspaces[0].created_at

        self.assertAlmostEqual(
            created_at2, created_at1, delta=timedelta(milliseconds=1)
        )
        self.assertTrue(last_modified_at2 > last_modified_at1)
        self.assertFalse(dataset.has_workspace(workspace_name))
        self.assertTrue(dataset.has_workspace(new_workspace_name))
        self.assertEqual(
            dataset.get_workspace_info(new_workspace_name)["description"],
            new_description,
        )

        updated_spaces = dataset.load_workspace(new_workspace_name)
        self.assertEqual(updated_spaces.name, new_workspace_name)
        dataset.update_workspace_info(
            new_workspace_name, {"name": workspace_name}
        )

        #
        # Verify that workspaces are included in clones
        #

        dataset2 = dataset.clone()

        self.assertTrue(dataset2.has_workspaces)
        self.assertTrue(dataset2.has_workspace(workspace_name))
        self.assertListEqual(dataset2.list_workspaces(), [workspace_name])

        spaces2 = dataset2.load_workspace(workspace_name)

        self.assertEqual(spaces, spaces2)

        last_loaded_at3 = dataset2._doc.workspaces[0].last_loaded_at
        last_modified_at3 = dataset2._doc.workspaces[0].last_modified_at
        created_at3 = dataset2._doc.workspaces[0].created_at

        self.assertTrue(last_loaded_at3 > last_loaded_at2)
        self.assertTrue(last_modified_at3 > last_modified_at2)
        self.assertTrue(created_at3 > created_at2)

        dataset.delete_workspace(workspace_name)

        self.assertFalse(dataset.has_workspaces)
        self.assertFalse(dataset.has_workspace(workspace_name))
        self.assertListEqual(dataset.list_workspaces(), [])

        # Verify that cloned data is properly decoupled from source dataset
        also_spaces2 = dataset2.load_workspace(workspace_name)
        self.assertIsNotNone(also_spaces2)

        #
        # Verify that workspaces are deleted when a dataset is deleted
        #

        workspace_id = dataset2._doc.workspaces[0].id

        db = foo.get_db_conn()

        self.assertEqual(
            len(list(db.workspaces.find({"_id": workspace_id}))), 1
        )

        dataset2.delete()

        self.assertEqual(
            len(list(db.workspaces.find({"_id": workspace_id}))), 0
        )

    def test_workspaces_for_app(self):
        dataset = self.dataset
        space = fo.Space()

        names = ["my-ws1", "my_ws2", "My  %&#  Ws3!"]
        slugs = ["my-ws1", "my-ws2", "my-ws3"]

        for idx, name in enumerate(names, 1):
            dataset.save_workspace(name, space)

        # Can't use duplicate name when saving a workspace
        with self.assertRaises(ValueError):
            dataset.save_workspace("my-ws1", space)

        # Can't use duplicate slug when saving a workspace
        with self.assertRaises(ValueError):
            dataset.save_workspace("my   ws1", space)

        # Can't use slug to delete workspace
        with self.assertRaises(ValueError):
            dataset.delete_workspace("my-ws3")

        # Can't rename a workspace to an existing name
        with self.assertRaises(ValueError):
            dataset.update_saved_view_info("my-ws1", {"name": "my_ws2"})

        # Can't rename a view to an existing slug
        with self.assertRaises(ValueError):
            dataset.update_saved_view_info("my-ws1", {"name": "my_ws2!"})

        workspace_docs = dataset._doc.workspaces

        self.assertListEqual([ws.name for ws in workspace_docs], names)
        self.assertListEqual([ws.slug for ws in workspace_docs], slugs)

        dataset.delete_workspace("my_ws2")

        self.assertSetEqual(
            {ws.name for ws in dataset._doc.workspaces},
            {names[0], names[2]},
        )

        dataset.delete_workspaces()

        self.assertListEqual(dataset._doc.workspaces, [])

    @drop_datasets
    def test_concurrent_workspace_updates(self):
        dataset = fo.Dataset()
        space = fo.Space()

        # Don't reuse singleton; we want to test concurrent edits here
        dataset._instances.pop(dataset.name)
        also_dataset = fo.load_dataset(dataset.name)
        self.assertIsNot(dataset, also_dataset)

        # Test add workspace safety
        dataset.save_workspace("ws1", space)
        also_dataset.save_workspace("ws2", space)

        self.assertListEqual(dataset.list_workspaces(), ["ws1"])

        dataset.reload()
        self.assertListEqual(dataset.list_workspaces(), ["ws1", "ws2"])

        # Test delete workspace safety
        also_dataset.reload()
        dataset.delete_workspace("ws1")
        also_dataset.delete_workspace("ws2")
        dataset.reload()
        self.assertListEqual(dataset.list_workspaces(), [])

        # Test delete all workspaces safety
        also_dataset.reload()
        dataset.save_workspace("ws1", space)
        also_dataset.delete_workspaces()
        also_dataset.reload()
        self.assertListEqual(also_dataset.list_workspaces(), [])

    def test_runs(self):
        dataset = self.dataset

        self.assertFalse(dataset.has_evaluations)
        self.assertListEqual(dataset.list_evaluations(), [])

        # We currently use only evaluations as a proxy for all run types
        dataset.evaluate_classifications(
            "predictions",
            gt_field="ground_truth",
            eval_key="eval",
        )

        self.assertTrue(dataset.has_evaluations)
        self.assertTrue(dataset.has_evaluation("eval"))
        self.assertListEqual(dataset.list_evaluations(), ["eval"])

        results = dataset.load_evaluation_results("eval")

        self.assertIsNotNone(results)

        #
        # Verify that runs are included in clones
        #

        dataset2 = dataset.clone()

        self.assertTrue(dataset2.has_evaluations)
        self.assertTrue(dataset2.has_evaluation("eval"))
        self.assertListEqual(dataset2.list_evaluations(), ["eval"])

        results = dataset.load_evaluation_results("eval")

        self.assertIsNotNone(results)

        dataset.delete_evaluation("eval")

        self.assertFalse(dataset.has_evaluations)
        self.assertFalse(dataset.has_evaluation("eval"))
        self.assertListEqual(dataset.list_evaluations(), [])

        # Verify that cloned data is properly decoupled from source dataset
        info = dataset2.get_evaluation_info("eval")
        results = dataset2.load_evaluation_results("eval")
        self.assertIsNotNone(info)
        self.assertIsNotNone(results)

        #
        # Verify that runs are deleted when a dataset is deleted
        #

        run_id = dataset2._doc.evaluations["eval"].id
        result_id = dataset2._doc.evaluations["eval"].results.grid_id

        db = foo.get_db_conn()

        self.assertEqual(len(list(db.runs.find({"_id": run_id}))), 1)
        self.assertEqual(len(list(db.fs.files.find({"_id": result_id}))), 1)

        dataset2.delete()

        self.assertEqual(len(list(db.runs.find({"_id": run_id}))), 0)
        self.assertEqual(len(list(db.fs.files.find({"_id": result_id}))), 0)


class DatasetSerializationTests(unittest.TestCase):
    @drop_datasets
    def test_serialize_sample(self):
        sample = fo.Sample(filepath="image.jpg", foo="bar")

        d = sample.to_dict()
        self.assertNotIn("id", d)
        self.assertNotIn("_id", d)
        self.assertNotIn("_dataset_id", d)

        sample2 = fo.Sample.from_dict(d)
        self.assertEqual(sample2["foo"], "bar")

        d = sample.to_dict(include_private=True)
        self.assertIn("_id", d)
        self.assertIn("_media_type", d)
        self.assertIn("_rand", d)
        self.assertIn("_dataset_id", d)

        sample2 = fo.Sample.from_dict(d)
        self.assertEqual(sample2["foo"], "bar")

    @drop_datasets
    def test_serialize_video_sample(self):
        sample = fo.Sample(filepath="video.mp4", foo="bar")
        frame = fo.Frame(foo="bar")
        sample.frames[1] = frame

        d = sample.to_dict()
        self.assertNotIn("frames", d)

        sample2 = fo.Sample.from_dict(d)
        self.assertEqual(sample2["foo"], "bar")
        self.assertEqual(len(sample2.frames), 0)

        d = sample.to_dict(include_frames=True)
        self.assertIn("frames", d)

        sample2 = fo.Sample.from_dict(d)
        self.assertEqual(len(sample2.frames), 1)
        self.assertEqual(sample2.frames[1]["foo"], "bar")

        d = sample.to_dict(include_frames=True, include_private=True)
        self.assertIn("frames", d)

        sample2 = fo.Sample.from_dict(d)
        self.assertEqual(len(sample2.frames), 1)
        self.assertEqual(sample2.frames[1]["foo"], "bar")

        d = frame.to_dict()
        self.assertNotIn("id", d)
        self.assertNotIn("_id", d)
        self.assertNotIn("_dataset_id", d)

        frame2 = fo.Frame.from_dict(d)
        self.assertEqual(frame2["foo"], "bar")

        d = frame.to_dict(include_private=True)
        self.assertIn("_id", d)
        self.assertIn("_sample_id", d)
        self.assertIn("_dataset_id", d)

        frame2 = fo.Frame.from_dict(d)
        self.assertEqual(frame2["foo"], "bar")

    @drop_datasets
    def test_serialize_dataset(self):
        sample = fo.Sample(filepath="image.jpg", foo="bar")

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        d = dataset.to_dict()
        dataset2 = fo.Dataset.from_dict(d)
        sample2 = dataset2.first()

        self.assertEqual(len(dataset2), 1)
        self.assertEqual(sample2["foo"], "bar")

        d = dataset.to_dict(include_private=True)
        dataset2 = fo.Dataset.from_dict(d)
        sample2 = dataset2.first()

        self.assertEqual(len(dataset2), 1)
        self.assertEqual(sample2["foo"], "bar")

    @drop_datasets
    def test_serialize_video_dataset(self):
        sample = fo.Sample(filepath="video.mp4", foo="bar")
        frame = fo.Frame(foo="bar")
        sample.frames[1] = frame

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        d = dataset.to_dict()
        dataset2 = fo.Dataset.from_dict(d)
        sample2 = dataset2.first()

        self.assertEqual(len(dataset2), 1)
        self.assertEqual(dataset2.count("frames"), 0)
        self.assertEqual(len(sample2.frames), 0)

        d = dataset.to_dict(include_frames=True)
        dataset2 = fo.Dataset.from_dict(d)
        sample2 = dataset2.first()

        self.assertEqual(len(dataset2), 1)
        self.assertEqual(dataset2.count("frames"), 1)
        self.assertEqual(len(sample2.frames), 1)

        d = dataset.to_dict(include_frames=True, include_private=True)
        dataset2 = fo.Dataset.from_dict(d)
        sample2 = dataset2.first()

        self.assertEqual(len(dataset2), 1)
        self.assertEqual(dataset2.count("frames"), 1)
        self.assertEqual(len(sample2.frames), 1)

    @drop_datasets
    def test_serialize_view(self):
        sample = fo.Sample(filepath="image.jpg", foo="bar")

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        view = dataset.select_fields()
        sample_view = view.first()

        d = sample_view.to_dict()
        self.assertNotIn("foo", d)

        sample2 = fo.Sample.from_dict(d)
        self.assertNotIn("foo", sample2)

        d = view.to_dict()
        dataset2 = fo.Dataset.from_dict(d)
        sample2 = dataset2.first()

        self.assertNotIn("foo", dataset2.get_field_schema())
        self.assertNotIn("foo", sample2)

        d = view.to_dict(include_private=True)
        dataset2 = fo.Dataset.from_dict(d)
        sample2 = dataset2.first()

        self.assertNotIn("foo", dataset2.get_field_schema())
        self.assertNotIn("foo", sample2)

    @drop_datasets
    def test_serialize_video_view(self):
        sample = fo.Sample(filepath="video.mp4", foo="bar")
        frame = fo.Frame(foo="bar")
        sample.frames[1] = frame

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        view = dataset.select_fields()
        sample_view = view.first()
        frame_view = sample_view.frames.first()

        d = frame_view.to_dict()
        self.assertNotIn("foo", d)

        frame2 = fo.Frame.from_dict(d)
        self.assertNotIn("foo", frame2)

        d = sample_view.to_dict()
        self.assertNotIn("foo", d)

        sample2 = fo.Sample.from_dict(d)
        self.assertEqual(len(sample2.frames), 0)

        d = sample_view.to_dict(include_frames=True)
        sample2 = fo.Sample.from_dict(d)
        frame2 = sample2.frames.first()
        self.assertNotIn("foo", frame2)

        d = view.to_dict()
        dataset2 = fo.Dataset.from_dict(d)
        sample2 = dataset2.first()

        self.assertNotIn("foo", dataset2.get_frame_field_schema())
        self.assertEqual(dataset2.count("frames"), 0)
        self.assertEqual(len(sample2.frames), 0)

        d = view.to_dict(include_frames=True)
        dataset2 = fo.Dataset.from_dict(d)
        sample2 = dataset2.first()
        frame2 = sample2.frames.first()

        self.assertNotIn("foo", dataset2.get_frame_field_schema())
        self.assertNotIn("foo", frame2)

        d = view.to_dict(include_frames=True, include_private=True)
        dataset2 = fo.Dataset.from_dict(d)
        sample2 = dataset2.first()
        frame2 = sample2.frames.first()

        self.assertNotIn("foo", dataset2.get_frame_field_schema())
        self.assertNotIn("foo", frame2)


class DatasetIdTests(unittest.TestCase):
    @drop_datasets
    def test_dataset_id(self):
        samples = [
            fo.Sample(filepath="image1.jpg"),
            fo.Sample(filepath="image2.jpg"),
            fo.Sample(filepath="image3.jpg"),
            fo.Sample(filepath="image4.jpg"),
        ]

        dataset = fo.Dataset()
        dataset.add_samples(samples)

        schema = dataset.get_field_schema(include_private=True)
        self.assertIn("_dataset_id", schema)

        dataset_id = str(dataset._doc.id)
        _dataset_id = dataset._doc.id

        values = dataset.values("_dataset_id")
        self.assertListEqual(values, [_dataset_id] * len(dataset))

        values = dataset.values("dataset_id")
        self.assertListEqual(values, [dataset_id] * len(dataset))

        sample = dataset.first()
        self.assertEqual(sample._dataset_id, _dataset_id)
        self.assertEqual(sample.dataset_id, dataset_id)

        view = dataset.select_fields()

        schema = view.get_field_schema(include_private=True)
        self.assertIn("_dataset_id", schema)

        values = view.values("_dataset_id")
        self.assertListEqual(values, [_dataset_id] * len(view))

        values = view.values("dataset_id")
        self.assertListEqual(values, [dataset_id] * len(view))

        sample = view.first()
        self.assertEqual(sample._dataset_id, _dataset_id)
        self.assertEqual(sample.dataset_id, dataset_id)

        # add_collection()

        dataset2 = fo.Dataset()
        dataset2.add_collection(dataset)

        dataset_id2 = str(dataset2._doc.id)
        self.assertListEqual(dataset2.distinct("dataset_id"), [dataset_id2])

        # clone()

        dataset3 = dataset.clone()

        dataset_id3 = str(dataset3._doc.id)
        self.assertListEqual(dataset3.distinct("dataset_id"), [dataset_id3])

        # add_samples()

        _dataset = dataset.clone()

        dataset4 = fo.Dataset()
        dataset4.add_samples(list(_dataset))

        dataset_id4 = str(dataset4._doc.id)
        self.assertListEqual(dataset4.distinct("dataset_id"), [dataset_id4])

        # merge_samples()

        _dataset = dataset.clone()

        dataset5 = fo.Dataset()
        dataset5.merge_samples(_dataset)

        dataset_id5 = str(dataset5._doc.id)
        self.assertListEqual(dataset5.distinct("dataset_id"), [dataset_id5])

    @drop_datasets
    def test_video_dataset_id(self):
        sample1 = fo.Sample(filepath="video1.mp4")
        sample1.frames[1] = fo.Frame()

        sample2 = fo.Sample(filepath="video2.mp4")
        sample2.frames[1] = fo.Frame()

        sample3 = fo.Sample(filepath="video3.mp4")
        sample3.frames[1] = fo.Frame()

        dataset = fo.Dataset()
        dataset.add_samples([sample1, sample2, sample3])

        schema = dataset.get_frame_field_schema(include_private=True)
        self.assertIn("_dataset_id", schema)

        dataset_id = str(dataset._doc.id)
        _dataset_id = dataset._doc.id

        values = dataset.values("frames._dataset_id", unwind=True)
        self.assertListEqual(values, [_dataset_id] * len(dataset))

        values = dataset.values("frames.dataset_id", unwind=True)
        self.assertListEqual(values, [dataset_id] * len(dataset))

        frame = dataset.first().frames.first()
        self.assertEqual(frame._dataset_id, _dataset_id)
        self.assertEqual(frame.dataset_id, dataset_id)

        view = dataset.select_fields()

        schema = view.get_frame_field_schema(include_private=True)
        self.assertIn("_dataset_id", schema)

        values = view.values("frames._dataset_id", unwind=True)
        self.assertListEqual(values, [_dataset_id] * len(view))

        values = view.values("frames.dataset_id", unwind=True)
        self.assertListEqual(values, [dataset_id] * len(view))

        frame = dataset.first().frames.first()
        self.assertEqual(frame._dataset_id, _dataset_id)
        self.assertEqual(frame.dataset_id, dataset_id)

        # add_collection()

        dataset2 = fo.Dataset()
        dataset2.add_collection(dataset)

        dataset_id2 = str(dataset2._doc.id)
        self.assertListEqual(
            dataset2.distinct("frames.dataset_id"), [dataset_id2]
        )

        # clone()

        dataset3 = dataset.clone()

        dataset_id3 = str(dataset3._doc.id)
        self.assertListEqual(
            dataset3.distinct("frames.dataset_id"), [dataset_id3]
        )

        # add_samples()

        _dataset = dataset.clone()

        dataset4 = fo.Dataset()
        dataset4.add_samples(list(_dataset))

        dataset_id4 = str(dataset4._doc.id)
        self.assertListEqual(
            dataset4.distinct("frames.dataset_id"), [dataset_id4]
        )

        # merge_samples()

        _dataset = dataset.clone()

        dataset5 = fo.Dataset()
        dataset5.merge_samples(_dataset)

        dataset_id5 = str(dataset5._doc.id)
        self.assertListEqual(
            dataset5.distinct("frames.dataset_id"), [dataset_id5]
        )

    @drop_datasets
    def test_clone_image(self):
        dataset = fo.Dataset()
        dataset.media_type = "image"
        default_indexes = dataset.list_indexes()

        # Empty dataset

        dataset2 = dataset.clone()
        self.assertGreater(
            dataset2.get_field("filepath").created_at,
            dataset.get_field("filepath").created_at,
        )

        self.assertSetEqual(
            set(dataset.list_indexes()),
            set(dataset2.list_indexes()),
        )
        self.assertTrue(dataset2.created_at > dataset.created_at)
        self.assertTrue(dataset2.last_modified_at > dataset.last_modified_at)
        self.assertTrue(dataset2.last_loaded_at > dataset.last_loaded_at)

        sample = fo.Sample(filepath="image.jpg", foo="bar")

        dataset.add_sample(sample)
        dataset.create_index("foo")

        # Custom indexes

        dataset3 = dataset.clone()
        sample3 = dataset3.first()

        self.assertIn("foo", dataset3.list_indexes())
        self.assertSetEqual(
            set(dataset.list_indexes()),
            set(dataset3.list_indexes()),
        )
        self.assertTrue(sample3.created_at > sample.created_at)
        self.assertTrue(sample3.last_modified_at > sample.last_modified_at)

        # Simple view

        dataset4 = dataset.limit(1).clone()
        sample4 = dataset4.first()

        self.assertIn("foo", dataset4.list_indexes())
        self.assertSetEqual(
            set(dataset.list_indexes()),
            set(dataset4.list_indexes()),
        )
        self.assertTrue(sample4.created_at > sample.created_at)
        self.assertTrue(sample4.last_modified_at > sample.last_modified_at)

        # Exclusion view

        dataset5 = dataset.select_fields().clone()
        sample5 = dataset5.first()

        self.assertNotIn("foo", dataset5.list_indexes())
        self.assertSetEqual(
            set(default_indexes),
            set(dataset5.list_indexes()),
        )
        self.assertTrue(sample5.created_at > sample.created_at)
        self.assertTrue(sample5.last_modified_at > sample.last_modified_at)

    @drop_datasets
    def test_clone_video(self):
        dataset = fo.Dataset()
        dataset.media_type = "video"
        default_indexes = dataset.list_indexes()

        # Empty dataset

        dataset2 = dataset.clone()

        self.assertGreater(
            dataset2.get_field("frames.frame_number").created_at,
            dataset.get_field("frames.frame_number").created_at,
        )
        self.assertSetEqual(
            set(dataset.list_indexes()),
            set(dataset2.list_indexes()),
        )
        self.assertTrue(dataset2.created_at > dataset.created_at)
        self.assertTrue(dataset2.last_modified_at > dataset.last_modified_at)
        self.assertTrue(dataset2.last_loaded_at > dataset.last_loaded_at)

        sample = fo.Sample(filepath="video.mp4", foo="bar")
        frame = fo.Frame(spam="eggs")
        sample.frames[1] = frame

        dataset.add_sample(sample)
        dataset.create_index("foo")
        dataset.create_index("frames.spam")

        # Custom indexes

        dataset3 = dataset.clone()
        sample3 = dataset3.first()
        frame3 = sample3.frames[1]

        self.assertIn("foo", dataset3.list_indexes())
        self.assertIn("frames.spam", dataset3.list_indexes())
        self.assertSetEqual(
            set(dataset.list_indexes()),
            set(dataset3.list_indexes()),
        )
        self.assertTrue(frame3.created_at > frame.created_at)
        self.assertTrue(frame3.last_modified_at > frame.last_modified_at)

        # Simple view

        dataset4 = dataset.limit(1).clone()
        sample4 = dataset4.first()
        frame4 = sample4.frames[1]

        self.assertIn("foo", dataset4.list_indexes())
        self.assertIn("frames.spam", dataset4.list_indexes())
        self.assertSetEqual(
            set(dataset.list_indexes()),
            set(dataset4.list_indexes()),
        )
        self.assertTrue(frame4.created_at > frame.created_at)
        self.assertTrue(frame4.last_modified_at > frame.last_modified_at)

        # Exclusion view

        dataset5 = dataset.select_fields().clone()
        sample5 = dataset5.first()
        frame5 = sample5.frames[1]

        self.assertNotIn("foo", dataset5.list_indexes())
        self.assertNotIn("frames.spam", dataset5.list_indexes())
        self.assertSetEqual(
            set(default_indexes),
            set(dataset5.list_indexes()),
        )
        self.assertTrue(frame5.created_at > frame.created_at)
        self.assertTrue(frame5.last_modified_at > frame.last_modified_at)

    @drop_datasets
    def test_clone_group(self):
        dataset = fo.Dataset()
        dataset.add_group_field("group")
        self.assertGreater(
            dataset.get_field("group").created_at, dataset.created_at
        )

        self.assertEqual(dataset.media_type, "group")

        default_indexes = dataset.list_indexes()

        self.assertIn("group.id", default_indexes)
        self.assertIn("group.name", default_indexes)

        # Empty dataset

        dataset2 = dataset.clone()

        self.assertSetEqual(
            set(dataset.list_indexes()),
            set(dataset2.list_indexes()),
        )

        sample = fo.Sample(
            filepath="image.jpg",
            group=fo.Group().element("slice"),
            foo="bar",
        )

        dataset.add_sample(sample)
        dataset.create_index("foo")

        # Custom indexes

        dataset3 = dataset.clone()

        self.assertIn("foo", dataset3.list_indexes())
        self.assertSetEqual(
            set(dataset.list_indexes()),
            set(dataset3.list_indexes()),
        )

        # Simple view

        dataset4 = dataset.limit(1).clone()

        self.assertIn("foo", dataset4.list_indexes())
        self.assertSetEqual(
            set(dataset.list_indexes()),
            set(dataset4.list_indexes()),
        )

        # Exclusion view

        dataset5 = dataset.select_fields().clone()

        self.assertNotIn("foo", dataset5.list_indexes())
        self.assertSetEqual(
            set(default_indexes),
            set(dataset5.list_indexes()),
        )


class DatasetDeletionTests(unittest.TestCase):
    @drop_datasets
    def setUp(self):
        self.dataset = fo.Dataset()

    def _setUp_classification(self):
        sample1 = fo.Sample(
            filepath="image1.png",
            ground_truth=fo.Classification(label="cat"),
        )

        sample2 = sample1.copy()
        sample2.filepath = "image2.png"

        # Test missing labels
        sample3 = fo.Sample(filepath="image3.png")

        sample4 = sample1.copy()
        sample4.filepath = "image4.png"

        self.dataset.add_samples([sample1, sample2, sample3, sample4])

    def _setUp_video_classification(self):
        sample1 = fo.Sample(filepath="video1.mp4")
        sample1.frames[1] = fo.Frame(
            frame_number=1, ground_truth=fo.Classification(label="cat")
        )
        sample1.frames[2] = fo.Frame(
            frame_number=2, ground_truth=fo.Classification(label="dog")
        )
        sample1.frames[3] = fo.Frame(
            frame_number=3, ground_truth=fo.Classification(label="rabbit")
        )

        # Test missing labels
        sample2 = fo.Sample(filepath="video2.mp4")
        sample2.frames[1] = fo.Frame()

        sample3 = sample1.copy()
        sample3.filepath = "video3.mp4"

        self.dataset.add_samples([sample1, sample2, sample3])

    def _setUp_detections(self):
        sample1 = fo.Sample(
            filepath="image1.png",
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(
                        label="cat",
                        bounding_box=[0, 0, 0.5, 0.5],
                    ),
                    fo.Detection(
                        label="dog",
                        bounding_box=[0.25, 0, 0.5, 0.1],
                    ),
                    fo.Detection(
                        label="rabbit",
                        confidence=0.1,
                        bounding_box=[0, 0, 0.5, 0.5],
                    ),
                ]
            ),
        )

        sample2 = sample1.copy()
        sample2.filepath = "image2.png"

        # Test missing labels
        sample3 = fo.Sample(filepath="image3.png")

        sample4 = sample1.copy()
        sample4.filepath = "image4.png"

        self.dataset.add_samples([sample1, sample2, sample3, sample4])

    def _setUp_video_detections(self):
        sample1 = fo.Sample(filepath="video1.mp4")

        frame1 = fo.Frame(
            frame_number=1,
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(
                        label="cat",
                        bounding_box=[0, 0, 0.5, 0.5],
                    ),
                    fo.Detection(
                        label="dog",
                        bounding_box=[0.25, 0, 0.5, 0.1],
                    ),
                    fo.Detection(
                        label="rabbit",
                        confidence=0.1,
                        bounding_box=[0, 0, 0.5, 0.5],
                    ),
                ]
            ),
        )
        sample1.frames[1] = frame1

        frame2 = frame1.copy()
        frame2.frame_number = 2
        sample1.frames[2] = frame2

        frame3 = frame1.copy()
        frame3.frame_number = 3
        sample1.frames[3] = frame3

        # Test missing labels
        sample2 = fo.Sample(filepath="video2.mp4")
        sample2.frames[1] = fo.Frame()

        sample3 = sample1.copy()
        sample3.filepath = "video3.mp4"

        self.dataset.add_samples([sample1, sample2, sample3])

    def test_delete_samples_ids(self):
        self._setUp_classification()

        ids = [self.dataset.first(), self.dataset.last()]

        num_samples = len(self.dataset)
        num_ids = len(ids)

        self.dataset.delete_samples(ids)

        num_samples_after = len(self.dataset)

        self.assertEqual(num_samples_after, num_samples - num_ids)

    def test_delete_samples_view(self):
        self._setUp_classification()

        ids = [self.dataset.first(), self.dataset.last()]

        view = self.dataset.select(ids)

        num_samples = len(self.dataset)
        num_view = len(view)

        self.dataset.delete_samples(view)

        num_samples_after = len(self.dataset)

        self.assertEqual(num_samples_after, num_samples - num_view)

    def test_delete_video_samples_ids(self):
        self._setUp_video_classification()

        ids = [self.dataset.first(), self.dataset.last()]

        num_samples = len(self.dataset)
        num_ids = len(ids)

        self.dataset.delete_samples(ids)

        num_samples_after = len(self.dataset)

        self.assertEqual(num_samples_after, num_samples - num_ids)

    def test_delete_video_samples_view(self):
        self._setUp_video_classification()

        ids = [self.dataset.first(), self.dataset.last()]

        view = self.dataset.select(ids)

        num_samples = len(self.dataset)
        num_view = len(view)

        self.dataset.delete_samples(view)

        num_samples_after = len(self.dataset)

        self.assertEqual(num_samples_after, num_samples - num_view)

    def test_delete_frames(self):
        self._setUp_video_classification()

        frames = [
            self.dataset.first().frames.first(),
            self.dataset.last().frames.last(),
        ]

        num_frames = self.dataset.count("frames")
        num_del = len(frames)

        self.dataset.delete_frames(frames)

        num_frames_after = self.dataset.count("frames")

        self.assertEqual(num_frames_after, num_frames - num_del)

    def test_delete_frames_ids(self):
        self._setUp_video_classification()

        frame_ids = [
            self.dataset.first().frames.first().id,
            self.dataset.last().frames.last().id,
        ]

        num_frames = self.dataset.count("frames")
        num_del = len(frame_ids)

        self.dataset.delete_frames(frame_ids)

        num_frames_after = self.dataset.count("frames")

        self.assertEqual(num_frames_after, num_frames - num_del)

    def test_delete_frames_samples(self):
        self._setUp_video_classification()

        samples = list(self.dataset)
        self.dataset.delete_frames(samples)

        num_frames_after = self.dataset.count("frames")

        self.assertEqual(num_frames_after, 0)

    def test_delete_frames_view(self):
        self._setUp_video_classification()

        view = self.dataset.match_frames(F("frame_number") == 1)

        num_frames = self.dataset.count("frames")
        num_del = view.count("frames")

        self.dataset.delete_frames(view)

        num_frames_after = self.dataset.count("frames")

        self.assertEqual(num_frames_after, num_frames - num_del)

    def test_delete_classification_ids(self):
        self._setUp_classification()

        ids = [
            self.dataset.first().ground_truth.id,
            self.dataset.last().ground_truth.id,
        ]

        num_labels = self.dataset.count("ground_truth")
        num_ids = len(ids)
        lma1 = self.dataset.values("last_modified_at")

        self.dataset.delete_labels(ids=ids)

        num_labels_after = self.dataset.count("ground_truth")
        lma2 = self.dataset.values("last_modified_at")

        self.assertEqual(num_labels_after, num_labels - num_ids)
        self.assertListEqual(
            [i < j for i, j in zip(lma1, lma2)],
            [True, False, False, True],
        )

    def test_delete_classification_tags(self):
        self._setUp_classification()

        ids = [
            self.dataset.first().ground_truth.id,
            self.dataset.last().ground_truth.id,
        ]

        self.dataset.select_labels(ids=ids).tag_labels("test")

        num_labels = self.dataset.count("ground_truth")
        num_tagged = self.dataset.count_label_tags()["test"]
        lma1 = self.dataset.values("last_modified_at")

        self.dataset.delete_labels(tags="test")

        num_labels_after = self.dataset.count("ground_truth")
        lma2 = self.dataset.values("last_modified_at")

        self.assertEqual(num_labels_after, num_labels - num_tagged)
        self.assertListEqual(
            [i < j for i, j in zip(lma1, lma2)],
            [True, False, False, True],
        )

    def test_delete_classification_view(self):
        self._setUp_classification()

        ids = [
            self.dataset.first().ground_truth.id,
            self.dataset.last().ground_truth.id,
        ]

        view = self.dataset.select_labels(ids=ids)

        num_labels = self.dataset.count("ground_truth")
        num_view = view.count("ground_truth")
        lma1 = self.dataset.values("last_modified_at")

        self.dataset.delete_labels(view=view)

        num_labels_after = self.dataset.count("ground_truth")
        lma2 = self.dataset.values("last_modified_at")

        self.assertEqual(num_labels_after, num_labels - num_view)
        self.assertListEqual(
            [i < j for i, j in zip(lma1, lma2)],
            [True, False, False, True],
        )

    def test_delete_classification_labels(self):
        self._setUp_classification()

        labels = [
            {
                "sample_id": self.dataset.first().id,
                "field": "ground_truth",
                "label_id": self.dataset.first().ground_truth.id,
            },
            {
                "sample_id": self.dataset.last().id,
                "field": "ground_truth",
                "label_id": self.dataset.last().ground_truth.id,
            },
        ]

        num_labels = self.dataset.count("ground_truth")
        num_selected = len(labels)
        lma1 = self.dataset.values("last_modified_at")

        self.dataset.delete_labels(labels=labels)

        num_labels_after = self.dataset.count("ground_truth")
        lma2 = self.dataset.values("last_modified_at")

        self.assertEqual(num_labels_after, num_labels - num_selected)
        self.assertListEqual(
            [i < j for i, j in zip(lma1, lma2)],
            [True, False, False, True],
        )

    def test_delete_detections_ids(self):
        self._setUp_detections()

        ids = [
            self.dataset.first().ground_truth.detections[0].id,
            self.dataset.last().ground_truth.detections[-1].id,
        ]

        num_labels = self.dataset.count("ground_truth.detections")
        num_ids = len(ids)
        lma1 = self.dataset.values("last_modified_at")

        self.dataset.delete_labels(ids=ids)

        num_labels_after = self.dataset.count("ground_truth.detections")
        lma2 = self.dataset.values("last_modified_at")

        self.assertEqual(num_labels_after, num_labels - num_ids)
        self.assertListEqual(
            [i < j for i, j in zip(lma1, lma2)],
            [True, False, False, True],
        )

    def test_delete_detections_tags(self):
        self._setUp_detections()

        ids = [
            self.dataset.first().ground_truth.detections[0].id,
            self.dataset.last().ground_truth.detections[-1].id,
        ]

        self.dataset.select_labels(ids=ids).tag_labels("test")

        num_labels = self.dataset.count("ground_truth.detections")
        num_tagged = self.dataset.count_label_tags()["test"]
        lma1 = self.dataset.values("last_modified_at")

        self.dataset.delete_labels(tags="test")

        num_labels_after = self.dataset.count("ground_truth.detections")
        lma2 = self.dataset.values("last_modified_at")

        self.assertEqual(num_labels_after, num_labels - num_tagged)
        self.assertListEqual(
            [i < j for i, j in zip(lma1, lma2)],
            [True, False, False, True],
        )

    def test_delete_detections_view(self):
        self._setUp_detections()

        ids = [
            self.dataset.first().ground_truth.detections[0].id,
            self.dataset.last().ground_truth.detections[-1].id,
        ]

        view = self.dataset.select_labels(ids=ids)

        num_labels = self.dataset.count("ground_truth.detections")
        num_view = view.count("ground_truth.detections")
        lma1 = self.dataset.values("last_modified_at")

        self.dataset.delete_labels(view=view)

        num_labels_after = self.dataset.count("ground_truth.detections")
        lma2 = self.dataset.values("last_modified_at")

        self.assertEqual(num_labels_after, num_labels - num_view)
        self.assertListEqual(
            [i < j for i, j in zip(lma1, lma2)],
            [True, False, False, True],
        )

    def test_delete_detections_labels(self):
        self._setUp_detections()

        labels = [
            {
                "sample_id": self.dataset.first().id,
                "field": "ground_truth",
                "label_id": self.dataset.first().ground_truth.detections[0].id,
            },
            {
                "sample_id": self.dataset.last().id,
                "field": "ground_truth",
                "label_id": self.dataset.last().ground_truth.detections[-1].id,
            },
        ]

        num_labels = self.dataset.count("ground_truth.detections")
        num_selected = len(labels)
        lma1 = self.dataset.values("last_modified_at")

        self.dataset.delete_labels(labels=labels)

        num_labels_after = self.dataset.count("ground_truth.detections")
        lma2 = self.dataset.values("last_modified_at")

        self.assertEqual(num_labels_after, num_labels - num_selected)
        self.assertListEqual(
            [i < j for i, j in zip(lma1, lma2)],
            [True, False, False, True],
        )

    def test_delete_video_classification_ids(self):
        self._setUp_video_classification()

        ids = [
            self.dataset.first().frames[1].ground_truth.id,
            self.dataset.last().frames[3].ground_truth.id,
        ]

        num_labels = self.dataset.count("frames.ground_truth")
        num_ids = len(ids)
        lma1 = self.dataset.values("frames.last_modified_at", unwind=True)

        self.dataset.delete_labels(ids=ids)

        num_labels_after = self.dataset.count("frames.ground_truth")
        lma2 = self.dataset.values("frames.last_modified_at", unwind=True)

        self.assertEqual(num_labels_after, num_labels - num_ids)
        self.assertListEqual(
            [i < j for i, j in zip(lma1, lma2)],
            [True, False, False, False, False, False, True],
        )

    def test_delete_video_classification_tags(self):
        self._setUp_video_classification()

        ids = [
            self.dataset.first().frames[1].ground_truth.id,
            self.dataset.last().frames[3].ground_truth.id,
        ]

        self.dataset.select_labels(ids=ids).tag_labels("test")

        num_labels = self.dataset.count("frames.ground_truth")
        num_tagged = self.dataset.count_label_tags()["test"]
        lma1 = self.dataset.values("frames.last_modified_at", unwind=True)

        self.dataset.delete_labels(tags="test")

        num_labels_after = self.dataset.count("frames.ground_truth")
        lma2 = self.dataset.values("frames.last_modified_at", unwind=True)

        self.assertEqual(num_labels_after, num_labels - num_tagged)
        self.assertListEqual(
            [i < j for i, j in zip(lma1, lma2)],
            [True, False, False, False, False, False, True],
        )

    def test_delete_video_classification_view(self):
        self._setUp_video_classification()

        ids = [
            self.dataset.first().frames[1].ground_truth.id,
            self.dataset.last().frames[3].ground_truth.id,
        ]

        view = self.dataset.select_labels(ids=ids)

        num_labels = self.dataset.count("frames.ground_truth")
        num_view = view.count("frames.ground_truth")
        lma1 = self.dataset.values("frames.last_modified_at", unwind=True)

        self.dataset.delete_labels(view=view)

        num_labels_after = self.dataset.count("frames.ground_truth")
        lma2 = self.dataset.values("frames.last_modified_at", unwind=True)

        self.assertEqual(num_labels_after, num_labels - num_view)
        self.assertListEqual(
            [i < j for i, j in zip(lma1, lma2)],
            [True, False, False, False, False, False, True],
        )

    def test_delete_video_classification_labels(self):
        self._setUp_video_classification()

        labels = [
            {
                "sample_id": self.dataset.first().id,
                "field": "frames.ground_truth",
                "frame_number": 1,
                "label_id": self.dataset.first().frames[1].ground_truth.id,
            },
            {
                "sample_id": self.dataset.last().id,
                "field": "frames.ground_truth",
                "frame_number": 3,
                "label_id": self.dataset.last().frames[3].ground_truth.id,
            },
        ]

        num_labels = self.dataset.count("frames.ground_truth")
        num_selected = len(labels)
        lma1 = self.dataset.values("frames.last_modified_at", unwind=True)

        self.dataset.delete_labels(labels=labels)

        num_labels_after = self.dataset.count("frames.ground_truth")
        lma2 = self.dataset.values("frames.last_modified_at", unwind=True)

        self.assertEqual(num_labels_after, num_labels - num_selected)
        self.assertListEqual(
            [i < j for i, j in zip(lma1, lma2)],
            [True, False, False, False, False, False, True],
        )

    def test_delete_video_detections_ids(self):
        self._setUp_video_detections()

        ids = [
            self.dataset.first().frames[1].ground_truth.detections[0].id,
            self.dataset.last().frames[3].ground_truth.detections[-1].id,
        ]

        num_labels = self.dataset.count("frames.ground_truth.detections")
        num_ids = len(ids)
        lma1 = self.dataset.values("frames.last_modified_at", unwind=True)

        self.dataset.delete_labels(ids=ids)

        num_labels_after = self.dataset.count("frames.ground_truth.detections")
        lma2 = self.dataset.values("frames.last_modified_at", unwind=True)

        self.assertEqual(num_labels_after, num_labels - num_ids)
        self.assertListEqual(
            [i < j for i, j in zip(lma1, lma2)],
            [True, False, False, False, False, False, True],
        )

    def test_delete_video_detections_tags(self):
        self._setUp_video_detections()

        ids = [
            self.dataset.first().frames[1].ground_truth.detections[0].id,
            self.dataset.last().frames[3].ground_truth.detections[-1].id,
        ]

        self.dataset.select_labels(ids=ids).tag_labels("test")

        num_labels = self.dataset.count("frames.ground_truth.detections")
        num_tagged = self.dataset.count_label_tags()["test"]
        lma1 = self.dataset.values("frames.last_modified_at", unwind=True)

        self.dataset.delete_labels(tags="test")

        num_labels_after = self.dataset.count("frames.ground_truth.detections")
        lma2 = self.dataset.values("frames.last_modified_at", unwind=True)

        self.assertEqual(num_labels_after, num_labels - num_tagged)
        self.assertListEqual(
            [i < j for i, j in zip(lma1, lma2)],
            [True, False, False, False, False, False, True],
        )

    def test_delete_video_detections_view(self):
        self._setUp_video_detections()

        ids = [
            self.dataset.first().frames[1].ground_truth.detections[0].id,
            self.dataset.last().frames[3].ground_truth.detections[-1].id,
        ]

        view = self.dataset.select_labels(ids=ids)

        num_labels = self.dataset.count("frames.ground_truth.detections")
        num_view = view.count("frames.ground_truth.detections")
        lma1 = self.dataset.values("frames.last_modified_at", unwind=True)

        self.dataset.delete_labels(view=view)

        num_labels_after = self.dataset.count("frames.ground_truth.detections")
        lma2 = self.dataset.values("frames.last_modified_at", unwind=True)

        self.assertEqual(num_labels_after, num_labels - num_view)
        self.assertListEqual(
            [i < j for i, j in zip(lma1, lma2)],
            [True, False, False, False, False, False, True],
        )

    def test_delete_video_detections_labels(self):
        self._setUp_video_detections()

        labels = [
            {
                "sample_id": self.dataset.first().id,
                "field": "frames.ground_truth",
                "frame_number": 1,
                "label_id": (
                    self.dataset.first()
                    .frames[1]
                    .ground_truth.detections[0]
                    .id
                ),
            },
            {
                "sample_id": self.dataset.last().id,
                "field": "frames.ground_truth",
                "frame_number": 3,
                "label_id": (
                    self.dataset.last()
                    .frames[3]
                    .ground_truth.detections[-1]
                    .id
                ),
            },
        ]

        num_labels = self.dataset.count("frames.ground_truth.detections")
        num_selected = len(labels)
        lma1 = self.dataset.values("frames.last_modified_at", unwind=True)

        self.dataset.delete_labels(labels=labels)

        num_labels_after = self.dataset.count("frames.ground_truth.detections")
        lma2 = self.dataset.values("frames.last_modified_at", unwind=True)

        self.assertEqual(num_labels_after, num_labels - num_selected)
        self.assertListEqual(
            [i < j for i, j in zip(lma1, lma2)],
            [True, False, False, False, False, False, True],
        )

    def test_sync_last_modified_at(self):
        sample1 = fo.Sample(filepath="video1.mp4", foo="bar")
        sample1.frames[1] = fo.Frame(foo="bar")

        sample2 = fo.Sample(filepath="video2.mp4")
        sample2.frames[2] = fo.Frame()

        sample3 = fo.Sample(filepath="video3.mp4")

        dataset = fo.Dataset()
        dataset.add_samples([sample1, sample2, sample3])

        last_modified_at1a = dataset.last_modified_at
        last_modified_at1b = dataset.bounds("last_modified_at")[1]
        last_modified_at1c = dataset.bounds("frames.last_modified_at")[1]

        dataset.set_field("foo", "baz").save("foo")

        last_modified_at2a = dataset.last_modified_at
        last_modified_at2b = dataset.bounds("last_modified_at")[1]
        last_modified_at2c = dataset.bounds("frames.last_modified_at")[1]

        self.assertEqual(last_modified_at1a, last_modified_at2a)
        self.assertTrue(last_modified_at1b < last_modified_at2b)
        self.assertEqual(last_modified_at1c, last_modified_at2c)

        dataset.sync_last_modified_at()

        last_modified_at3a = dataset.last_modified_at
        last_modified_at3b = dataset.bounds("last_modified_at")[1]
        last_modified_at3c = dataset.bounds("frames.last_modified_at")[1]

        self.assertTrue(last_modified_at2a < last_modified_at3a)
        self.assertEqual(last_modified_at2b, last_modified_at3b)
        self.assertEqual(last_modified_at2c, last_modified_at3c)

        dataset.set_field("frames.foo", "baz").save("frames.foo")

        last_modified_at4a = dataset.last_modified_at
        last_modified_at4b = dataset.bounds("last_modified_at")[1]
        last_modified_at4c = dataset.bounds("frames.last_modified_at")[1]

        self.assertEqual(last_modified_at3a, last_modified_at4a)
        self.assertEqual(last_modified_at3b, last_modified_at4b)
        self.assertTrue(last_modified_at3c < last_modified_at4c)

        dataset.sync_last_modified_at()

        last_modified_at5a = dataset.last_modified_at
        last_modified_at5b = dataset.bounds("last_modified_at")[1]
        last_modified_at5c = dataset.bounds("frames.last_modified_at")[1]

        self.assertTrue(last_modified_at4a < last_modified_at5a)
        self.assertTrue(last_modified_at4b < last_modified_at5b)
        self.assertEqual(last_modified_at4c, last_modified_at5c)

        last_modified_at6b = dataset._max("last_modified_at")
        last_modified_at6c = dataset._max("frames.last_modified_at")

        self.assertEqual(last_modified_at6b, last_modified_at5b)
        self.assertEqual(last_modified_at6c, last_modified_at5c)

        last_modified_at7b = dataset.view()._max("last_modified_at")
        last_modified_at7c = dataset.view()._max("frames.last_modified_at")

        self.assertEqual(last_modified_at7b, last_modified_at5b)
        self.assertEqual(last_modified_at7c, last_modified_at5c)


class DynamicFieldTests(unittest.TestCase):
    @drop_datasets
    def test_dynamic_fields_dataset(self):
        detections1 = fo.Detections(
            detections=[
                fo.Detection(
                    label="cat",
                    bounding_box=[0, 0, 1, 1],
                    area=1,
                )
            ]
        )
        detections2 = detections1.copy()

        sample = fo.Sample(filepath="video.mp4", ground_truth=detections1)
        sample.frames[1] = fo.Frame(ground_truth=detections2)

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        # By default dynamic fields aren't declared

        schema = dataset.get_field_schema(flat=True)
        self.assertNotIn("ground_truth.detections.area", schema)

        schema = dataset.get_frame_field_schema(flat=True)
        self.assertNotIn("ground_truth.detections.area", schema)

        dynamic_schema = dataset.get_dynamic_field_schema()
        self.assertIn("ground_truth.detections.area", dynamic_schema)

        dynamic_schema = dataset.get_dynamic_frame_field_schema()
        self.assertIn("ground_truth.detections.area", dynamic_schema)

        # Declare all dynamic fields

        dataset.add_dynamic_sample_fields()
        dataset.add_dynamic_frame_fields()

        schema = dataset.get_field_schema(flat=True)
        self.assertIn("ground_truth.detections.area", schema)

        schema = dataset.get_frame_field_schema(flat=True)
        self.assertIn("ground_truth.detections.area", schema)

        dynamic_schema = dataset.get_dynamic_field_schema()
        self.assertEqual(dynamic_schema, {})

        dynamic_schema = dataset.get_dynamic_frame_field_schema()
        self.assertEqual(dynamic_schema, {})

        # Manually declare embedded attributes

        dataset.add_sample_field(
            "ground_truth.detections.iscrowd",
            fo.BooleanField,
        )

        schema = dataset.get_field_schema(flat=True)
        self.assertIn("ground_truth.detections.iscrowd", schema)

        dataset.add_frame_field(
            "ground_truth.detections.iscrowd",
            fo.BooleanField,
        )

        schema = dataset.get_frame_field_schema(flat=True)
        self.assertIn("ground_truth.detections.iscrowd", schema)

        # Okay to redeclare embedded attributes

        dataset.add_sample_field(
            "ground_truth.detections.iscrowd",
            fo.BooleanField,
        )

        dataset.add_frame_field(
            "ground_truth.detections.iscrowd",
            fo.BooleanField,
        )

        # But their type can't change type

        with self.assertRaises(Exception):
            dataset.add_sample_field(
                "ground_truth.detections.iscrowd",
                fo.IntField,
            )

        with self.assertRaises(Exception):
            dataset.add_frame_field(
                "ground_truth.detections.iscrowd",
                fo.IntField,
            )

        # Add sample with valid dynamic attributes

        detections1 = fo.Detections(
            detections=[
                fo.Detection(
                    label="cat",
                    bounding_box=[0, 0, 1, 1],
                    area=2,
                    iscrowd=True,
                )
            ]
        )
        detections2 = detections1.copy()

        sample = fo.Sample(filepath="video.mp4", ground_truth=detections1)
        sample.frames[1] = fo.Frame(ground_truth=detections2)

        dataset.add_sample(sample)

        # Try adding sample with invalid dynamic attributes

        detections1 = fo.Detections(
            detections=[
                fo.Detection(
                    label="cat",
                    bounding_box=[0, 0, 1, 1],
                    area="bad-value",
                )
            ]
        )
        detections2 = detections1.copy()

        sample = fo.Sample(filepath="video.mp4", ground_truth=detections1)
        sample.frames[1] = fo.Frame(ground_truth=detections2)

        with self.assertRaises(Exception):
            dataset.add_sample(sample)

        # Automatically declare dynamic attributes

        detections1 = fo.Detections(
            detections=[
                fo.Detection(
                    label="cat",
                    bounding_box=[0, 0, 1, 1],
                    foo="bar",
                )
            ]
        )
        detections2 = detections1.copy()

        sample = fo.Sample(filepath="video.mp4", ground_truth=detections1)
        sample.frames[1] = fo.Frame(ground_truth=detections2)

        dataset.add_sample(sample, dynamic=True)

        schema = dataset.get_field_schema(flat=True)
        self.assertIn("ground_truth.detections.foo", schema)

        schema = dataset.get_frame_field_schema(flat=True)
        self.assertIn("ground_truth.detections.foo", schema)

    @drop_datasets
    def test_set_new_fields(self):
        dataset = fo.Dataset()

        sample = fo.Sample(
            filepath="image.png",
            ground_truth=fo.Classification(label="cat"),
        )

        dataset.add_sample(sample)

        sample["foo"] = "bar"
        sample["ground_truth.foo"] = "bar"
        sample.save()

        view = dataset.select_fields("ground_truth")
        sample_view = view.first()

        sample_view["spam"] = "eggs"
        sample_view["ground_truth.spam"] = "eggs"
        sample_view.save()

        schema = dataset.get_field_schema(flat=True)

        self.assertIn("foo", schema)
        self.assertIn("spam", schema)

        # Dynamic nested fields are not automatically added to schema
        self.assertNotIn("ground_truth.foo", schema)
        self.assertNotIn("ground_truth.spam", schema)

        self.assertEqual(sample.foo, "bar")
        self.assertEqual(sample.spam, "eggs")

        self.assertEqual(sample.ground_truth.foo, "bar")
        self.assertEqual(sample.ground_truth.spam, "eggs")

    @drop_datasets
    def test_dynamic_fields_sample(self):
        sample = fo.Sample(filepath="video.mp4")
        sample.frames[1] = fo.Frame()

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        detections1 = fo.Detections(
            detections=[
                fo.Detection(
                    label="cat",
                    bounding_box=[0, 0, 1, 1],
                    mood="surly",
                )
            ]
        )
        detections2 = detections1.copy()

        # By default dynamic attributes aren't declared

        sample["ground_truth"] = detections1
        sample.frames[1]["ground_truth"] = detections2
        sample.save()

        schema = dataset.get_field_schema(flat=True)
        self.assertNotIn("ground_truth.detections.mood", schema)

        schema = dataset.get_frame_field_schema(flat=True)
        self.assertNotIn("ground_truth.detections.mood", schema)

        # But this will declare the dynamic attributes

        sample.set_field("ground_truth", detections1, dynamic=True)
        sample.frames[1].set_field("ground_truth", detections2, dynamic=True)
        sample.save()

        schema = dataset.get_field_schema(flat=True)
        self.assertIn("ground_truth.detections.mood", schema)

        schema = dataset.get_frame_field_schema(flat=True)
        self.assertIn("ground_truth.detections.mood", schema)

        # Try invalid dynamic attributes

        with self.assertRaises(Exception):
            sample["ground_truth"].detections[0].mood = False
            sample.save()

        with self.assertRaises(Exception):
            frame = sample.frames[1]
            frame["ground_truth"].detections[0].mood = False
            frame.save()

        with self.assertRaises(Exception):
            sample.frames[1]["ground_truth"].detections[0].mood = False
            sample.save()

    @drop_datasets
    def test_dynamic_has_field(self):
        sample = fo.Sample(
            filepath="image.jpg",
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(
                        label="cat",
                        bounding_box=[0.1, 0.1, 0.8, 0.8],
                        foo="bar",
                    ),
                ]
            ),
        )

        dataset = fo.Dataset()
        dataset.add_sample(sample, dynamic=True)

        detection = sample.ground_truth.detections[0]

        self.assertTrue(dataset.has_field("ground_truth.detections.label"))
        self.assertTrue(sample.has_field("ground_truth.detections.label"))
        self.assertTrue(detection.has_field("label"))

        self.assertTrue(dataset.has_field("ground_truth.detections.foo"))
        self.assertTrue(sample.has_field("ground_truth.detections.foo"))
        self.assertTrue(detection.has_field("foo"))

        self.assertFalse(dataset.has_field("ground_truth.detections.spam"))
        self.assertFalse(sample.has_field("ground_truth.detections.spam"))
        self.assertFalse(detection.has_field("spam"))

    @drop_datasets
    def test_dynamic_list_fields(self):
        sample1 = fo.Sample(
            filepath="image1.jpg",
            test1=[fo.DynamicEmbeddedDocument(int_field=1, float_field=0.1)],
        )

        dataset1 = fo.Dataset()
        dataset1.add_sample(sample1, dynamic=True)

        schema = dataset1.get_field_schema(flat=True)
        self.assertIn("test1", schema)
        self.assertIn("test1.int_field", schema)
        self.assertIn("test1.float_field", schema)

        dataset2 = fo.Dataset()
        dataset2.add_sample_field(
            "test2",
            fo.ListField,
            subfield=fo.EmbeddedDocumentField,
            embedded_doc_type=fo.DynamicEmbeddedDocument,
        )

        sample2 = fo.Sample(
            filepath="image2.jpg",
            test2=[fo.DynamicEmbeddedDocument(int_field=1, float_field=0.1)],
        )
        dataset2.add_sample(sample2, dynamic=True)

        schema = dataset2.get_field_schema(flat=True)
        self.assertIn("test2", schema)
        self.assertIn("test2.int_field", schema)
        self.assertIn("test2.float_field", schema)

        dataset1.merge_samples(dataset2)

        schema = dataset1.get_field_schema(flat=True)
        self.assertIn("test2", schema)
        self.assertIn("test2.int_field", schema)
        self.assertIn("test2.float_field", schema)

        dataset3 = fo.Dataset()
        dataset3.add_sample(fo.Sample(filepath="image3.jpg"))

        dataset3.set_values(
            "test3",
            [[fo.DynamicEmbeddedDocument(int_field=1, float_field=0.1)]],
            dynamic=True,
        )

        schema = dataset3.get_field_schema(flat=True)
        self.assertIn("test3", schema)
        self.assertIn("test3.int_field", schema)
        self.assertIn("test3.float_field", schema)

        sample4 = fo.Sample(
            filepath="image.jpg",
            tasks=[
                fo.DynamicEmbeddedDocument(
                    annotator="alice",
                    labels=fo.Classifications(
                        classifications=[
                            fo.Classification(label="cat"),
                            fo.Classification(label="dog"),
                        ]
                    ),
                ),
                fo.DynamicEmbeddedDocument(
                    annotator="bob",
                    labels=fo.Classifications(
                        classifications=[
                            fo.Classification(label="rabbit"),
                            fo.Classification(label="squirrel"),
                        ]
                    ),
                ),
            ],
        )

        dataset4 = fo.Dataset()
        dataset4.add_sample(sample4, dynamic=True)

        schema = dataset4.get_field_schema(flat=True)
        self.assertIn("tasks.annotator", schema)
        self.assertIn("tasks.labels", schema)
        self.assertIn("tasks.labels.classifications.label", schema)

    @drop_datasets
    def test_dynamic_fields_clone_and_merge(self):
        dataset1 = fo.Dataset()
        dataset1.media_type = "video"

        dataset1.add_sample_field(
            "ground_truth",
            fo.EmbeddedDocumentField,
            embedded_doc_type=fo.Detections,
        )
        dataset1.add_sample_field(
            "ground_truth.detections.mood",
            fo.StringField,
        )

        dataset1.add_frame_field(
            "ground_truth",
            fo.EmbeddedDocumentField,
            embedded_doc_type=fo.Detections,
        )
        dataset1.add_frame_field(
            "ground_truth.detections.mood",
            fo.StringField,
        )

        schema = dataset1.get_field_schema(flat=True)
        self.assertIn("ground_truth.detections.mood", schema)

        schema = dataset1.get_frame_field_schema(flat=True)
        self.assertIn("ground_truth.detections.mood", schema)

        detections1 = fo.Detections(
            detections=[
                fo.Detection(
                    label="cat",
                    bounding_box=[0, 0, 1, 1],
                    area=1,
                )
            ]
        )
        detections2 = detections1.copy()

        sample = fo.Sample(filepath="video.mp4", ground_truth=detections1)
        sample.frames[1] = fo.Frame(ground_truth=detections2)

        dataset2 = fo.Dataset()
        dataset2.add_sample(sample, dynamic=True)

        schema = dataset2.get_field_schema(flat=True)
        self.assertIn("ground_truth.detections.area", schema)

        schema = dataset2.get_frame_field_schema(flat=True)
        self.assertIn("ground_truth.detections.area", schema)

        dataset3 = dataset2.clone()

        schema = dataset3.get_field_schema(flat=True)
        self.assertIn("ground_truth.detections.area", schema)

        schema = dataset3.get_frame_field_schema(flat=True)
        self.assertIn("ground_truth.detections.area", schema)

        dataset3.merge_samples(dataset1)

        schema = dataset3.get_field_schema(flat=True)
        self.assertIn("ground_truth.detections.mood", schema)
        self.assertIn("ground_truth.detections.area", schema)

        schema = dataset3.get_frame_field_schema(flat=True)
        self.assertIn("ground_truth.detections.mood", schema)
        self.assertIn("ground_truth.detections.area", schema)

    @drop_datasets
    def test_dynamic_fields_mixed(self):
        sample1 = fo.Sample(
            filepath="image1.jpg",
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(
                        label="cat",
                        bounding_box=[0.1, 0.1, 0.4, 0.4],
                        float=1,
                        mixed=True,
                    ),
                    fo.Detection(
                        label="dog",
                        bounding_box=[0.5, 0.5, 0.4, 0.4],
                        float=None,
                        mixed=None,
                    ),
                ]
            ),
        )

        sample2 = fo.Sample(
            filepath="image2.jpg",
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(
                        label="rabbit",
                        bounding_box=[0.1, 0.1, 0.4, 0.4],
                    ),
                    fo.Detection(
                        label="squirrel",
                        bounding_box=[0.5, 0.5, 0.4, 0.4],
                        float=1.5,
                        mixed="foo",
                    ),
                ]
            ),
        )

        dataset = fo.Dataset()
        dataset.add_samples([sample1, sample2])

        dataset.add_dynamic_sample_fields()

        # int + float is resolved as FloatField
        schema = dataset.get_field_schema(flat=True)
        self.assertIn("ground_truth.detections.float", schema)
        self.assertIsInstance(
            schema["ground_truth.detections.float"],
            fo.FloatField,
        )

        dynamic_schema = dataset.get_dynamic_field_schema()
        self.assertIn("ground_truth.detections.mixed", dynamic_schema)

        dataset.add_dynamic_sample_fields(add_mixed=True)

        # Mixed type declared as generic Field
        schema = dataset.get_field_schema(flat=True)
        self.assertIn("ground_truth.detections.mixed", schema)
        self.assertEqual(
            type(schema["ground_truth.detections.mixed"]),
            fo.Field,
        )

        dynamic_schema = dataset.get_dynamic_field_schema()
        self.assertEqual(dynamic_schema, {})

        # Ensure validation logic works

        sample3 = fo.Sample(
            filepath="image3.jpg",
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(
                        label="squirrel",
                        bounding_box=[0.5, 0.5, 0.4, 0.4],
                        float=2,
                        mixed=[1, 2, 3],
                    ),
                ]
            ),
        )

        dataset.add_sample(sample3)

        sample = dataset.view().last()
        detection = sample.ground_truth.detections[0]

        self.assertEqual(detection.float, 2)
        self.assertEqual(detection.mixed, [1, 2, 3])

    @drop_datasets
    def test_dynamic_fields_nested(self):
        sample = fo.Sample(
            filepath="image.jpg",
            tasks=[
                fo.DynamicEmbeddedDocument(
                    annotator="alice",
                    labels=fo.Classifications(
                        classifications=[
                            fo.Classification(label="cat", mood="surly"),
                            fo.Classification(label="dog"),
                        ]
                    ),
                ),
                fo.DynamicEmbeddedDocument(
                    annotator="bob",
                    labels=fo.Classifications(
                        classifications=[
                            fo.Classification(label="rabbit"),
                            fo.Classification(label="squirrel", age=51),
                        ]
                    ),
                ),
            ],
        )

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        dynamic_schema = dataset.get_dynamic_field_schema()
        self.assertSetEqual(
            set(dynamic_schema.keys()),
            {
                "tasks.annotator",
                "tasks.labels",
                "tasks.labels.classifications.age",
                "tasks.labels.classifications.mood",
            },
        )

        dataset.add_dynamic_sample_fields()

        new_paths = [
            "tasks",
            "tasks.labels",
            "tasks.labels.classifications",
            "tasks.labels.classifications.id",
            "tasks.labels.classifications.tags",
            "tasks.labels.classifications.label",
            "tasks.labels.classifications.logits",
            "tasks.labels.classifications.confidence",
            "tasks.labels.classifications.age",
            "tasks.labels.classifications.mood",
            "tasks.labels.logits",
            "tasks.annotator",
        ]
        schema = dataset.get_field_schema(flat=True)
        for path in new_paths:
            self.assertIn(path, schema)

        dynamic_schema = dataset.get_dynamic_field_schema()

        self.assertDictEqual(dynamic_schema, {})

        dataset.add_dynamic_sample_fields()

    @drop_datasets
    def test_add_dynamic_fields_nested(self):
        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="image1.png",
                    ground_truth=fo.Classification(
                        label="cat",
                        info=[
                            fo.DynamicEmbeddedDocument(
                                task="initial_annotation",
                                author="Alice",
                                timestamp=datetime(1970, 1, 1),
                                notes=["foo", "bar"],
                                ints=[1],
                                floats=[1.0],
                                mixed=[1, "foo"],
                            ),
                            fo.DynamicEmbeddedDocument(
                                task="editing_pass",
                                author="Bob",
                                timestamp=datetime.utcnow(),
                            ),
                        ],
                    ),
                ),
                fo.Sample(
                    filepath="image2.png",
                    ground_truth=fo.Classification(
                        label="dog",
                        info=[
                            fo.DynamicEmbeddedDocument(
                                task="initial_annotation",
                                author="Bob",
                                timestamp=datetime(2018, 10, 18),
                                notes=["spam", "eggs"],
                                ints=[2],
                                floats=[2],
                                mixed=[2.0],
                            ),
                        ],
                    ),
                ),
            ]
        )

        schema = dataset.get_dynamic_field_schema()
        self.assertSetEqual(
            set(schema.keys()),
            {
                "ground_truth.info",
                "ground_truth.info.task",
                "ground_truth.info.author",
                "ground_truth.info.timestamp",
                "ground_truth.info.notes",
                "ground_truth.info.ints",
                "ground_truth.info.floats",
                "ground_truth.info.mixed",
            },
        )

        field = schema["ground_truth.info"]
        self.assertIsInstance(field, fo.ListField)
        self.assertIsInstance(field.field, fo.EmbeddedDocumentField)
        self.assertEqual(field.field.document_type, fo.DynamicEmbeddedDocument)

        field = schema["ground_truth.info.author"]
        self.assertIsInstance(field, fo.StringField)

        field = schema["ground_truth.info.timestamp"]
        self.assertIsInstance(field, fo.DateTimeField)

        field = schema["ground_truth.info.notes"]
        self.assertIsInstance(field, fo.ListField)
        self.assertIsInstance(field.field, fo.StringField)

        field = schema["ground_truth.info.ints"]
        self.assertIsInstance(field, fo.ListField)
        self.assertIsInstance(field.field, fo.IntField)

        field = schema["ground_truth.info.floats"]
        self.assertIsInstance(field, fo.ListField)
        self.assertIsInstance(field.field, fo.FloatField)

        field = schema["ground_truth.info.mixed"]
        self.assertIsInstance(field, fo.ListField)
        self.assertIsInstance(field.field, list)
        self.assertEqual(len(field.field), 3)

        dataset.add_dynamic_sample_fields()

        schema = dataset.get_field_schema(flat=True)

        field = schema["ground_truth.info"]
        self.assertIsInstance(field, fo.ListField)
        self.assertIsInstance(field.field, fo.EmbeddedDocumentField)
        self.assertEqual(field.field.document_type, fo.DynamicEmbeddedDocument)

        field = schema["ground_truth.info.author"]
        self.assertIsInstance(field, fo.StringField)

        field = schema["ground_truth.info.timestamp"]
        self.assertIsInstance(field, fo.DateTimeField)

        field = schema["ground_truth.info.notes"]
        self.assertIsInstance(field, fo.ListField)
        self.assertIsInstance(field.field, fo.StringField)

        field = schema["ground_truth.info.ints"]
        self.assertIsInstance(field, fo.ListField)
        self.assertIsInstance(field.field, fo.IntField)

        field = schema["ground_truth.info.floats"]
        self.assertIsInstance(field, fo.ListField)
        self.assertIsInstance(field.field, fo.FloatField)

        self.assertNotIn("ground_truth.info.mixed", schema)

        schema = dataset.get_dynamic_field_schema()
        self.assertSetEqual(set(schema.keys()), {"ground_truth.info.mixed"})

        dataset.add_dynamic_sample_fields(add_mixed=True)

        schema = dataset.get_field_schema(flat=True)

        field = schema["ground_truth.info.mixed"]
        self.assertIsInstance(field, fo.ListField)
        self.assertIsInstance(field.field, fo.Field)

    @drop_datasets
    def test_dynamic_fields_nested_lists(self):
        dataset = fo.Dataset()

        detection = fo.Detection(list_attr=["one", "two", "three"])
        detections = fo.Detections(detections=[detection])

        sample = fo.Sample(
            filepath="image.jpg",
            ground_truth=detections,
            embedded_field=fo.DynamicEmbeddedDocument(detections=detections),
        )

        dataset.add_sample(sample)

        dynamic_schema = dataset.get_dynamic_field_schema()
        self.assertSetEqual(
            set(dynamic_schema.keys()),
            {
                "ground_truth.detections.list_attr",
                "embedded_field.detections",
                "embedded_field.detections.detections.list_attr",
            },
        )

        list_field1 = dynamic_schema["ground_truth.detections.list_attr"]
        self.assertIsInstance(list_field1, fo.ListField)
        self.assertIsInstance(list_field1.field, fo.StringField)

        list_field2 = dynamic_schema[
            "embedded_field.detections.detections.list_attr"
        ]
        self.assertIsInstance(list_field2, fo.ListField)
        self.assertIsInstance(list_field2.field, fo.StringField)

        dataset.add_dynamic_sample_fields()

        new_paths = [
            "ground_truth.detections.list_attr",
            "embedded_field.detections",
            "embedded_field.detections.detections.list_attr",
        ]
        schema = dataset.get_field_schema(flat=True)
        for path in new_paths:
            self.assertIn(path, schema)

        list_field1 = dataset.get_field("ground_truth.detections.list_attr")
        self.assertIsInstance(list_field1, fo.ListField)
        self.assertIsInstance(list_field1.field, fo.StringField)

        list_field2 = dataset.get_field(
            "embedded_field.detections.detections.list_attr"
        )
        self.assertIsInstance(list_field2, fo.ListField)
        self.assertIsInstance(list_field2.field, fo.StringField)

        dynamic_schema = dataset.get_dynamic_field_schema()

        self.assertDictEqual(dynamic_schema, {})

    @drop_datasets
    def test_dynamic_frame_fields_nested(self):
        sample = fo.Sample(filepath="video.mp4")
        sample.frames[1] = fo.Frame(
            tasks=[
                fo.DynamicEmbeddedDocument(
                    annotator="alice",
                    labels=fo.Classifications(
                        classifications=[
                            fo.Classification(label="cat", mood="surly"),
                            fo.Classification(label="dog"),
                        ]
                    ),
                ),
                fo.DynamicEmbeddedDocument(
                    annotator="bob",
                    labels=fo.Classifications(
                        classifications=[
                            fo.Classification(label="rabbit"),
                            fo.Classification(label="squirrel", age=51),
                        ]
                    ),
                ),
            ],
        )

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        dynamic_schema = dataset.get_dynamic_frame_field_schema()
        self.assertSetEqual(
            set(dynamic_schema.keys()),
            {
                "tasks.annotator",
                "tasks.labels",
                "tasks.labels.classifications.age",
                "tasks.labels.classifications.mood",
            },
        )

        dataset.add_dynamic_frame_fields()

        new_paths = [
            "tasks",
            "tasks.labels",
            "tasks.labels.classifications",
            "tasks.labels.classifications.id",
            "tasks.labels.classifications.tags",
            "tasks.labels.classifications.label",
            "tasks.labels.classifications.logits",
            "tasks.labels.classifications.confidence",
            "tasks.labels.classifications.age",
            "tasks.labels.classifications.mood",
            "tasks.labels.logits",
            "tasks.annotator",
        ]
        schema = dataset.get_frame_field_schema(flat=True)
        for path in new_paths:
            self.assertIn(path, schema)

        dynamic_schema = dataset.get_dynamic_frame_field_schema()

        self.assertDictEqual(dynamic_schema, {})

        dataset.add_dynamic_frame_fields()

    @drop_datasets
    def test_dynamic_fields_defaults(self):
        sample = fo.Sample(
            filepath="video.mp4",
            shapes=fo.Polylines(
                polylines=[
                    fo.Polyline(
                        tags=["tag1", "tag2"],
                        label="square",
                        points=[[(0, 0), (0, 1), (1, 1), (1, 0), (0, 0)]],
                    ),
                ]
            ),
        )
        sample.frames[1] = fo.Frame(
            shapes=fo.Polylines(
                polylines=[
                    fo.Polyline(
                        tags=["tag1", "tag2"],
                        label="square",
                        points=[[(0, 0), (0, 1), (1, 1), (1, 0), (0, 0)]],
                    ),
                ]
            )
        )

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        dynamic_schema = dataset.get_dynamic_field_schema()
        self.assertDictEqual(dynamic_schema, {})

        dynamic_schema = dataset.get_dynamic_frame_field_schema()
        self.assertDictEqual(dynamic_schema, {})

        dataset.add_dynamic_sample_fields()
        dataset.add_dynamic_frame_fields()

        field = dataset.get_field("shapes.polylines.points")
        self.assertIsInstance(field, fof.PolylinePointsField)

        field = dataset.get_field("frames.shapes.polylines.points")
        self.assertIsInstance(field, fof.PolylinePointsField)

    @drop_datasets
    def test_rename_dynamic_embedded_fields(self):
        sample = fo.Sample(
            filepath="image.jpg",
            predictions=fo.Detections(detections=[fo.Detection(field=1)]),
        )

        dataset = fo.Dataset()
        dataset.add_sample(sample, dynamic=True)

        schema = dataset.get_field_schema(flat=True)
        self.assertIn("predictions.detections.field", schema)

        with self.assertRaises(Exception):
            dataset.rename_sample_field(
                "predictions.detections.id",
                "predictions.detections.id_oops",
            )

        with self.assertRaises(Exception):
            dataset.rename_sample_field(
                "predictions.detections.bounding_box",
                "predictions.detections.bounding_box_oops",
            )

        with self.assertRaises(Exception):
            dataset.rename_sample_field(
                "predictions.detections.confidence",
                "predictions.detections.confidence_oops",
            )

        dataset.rename_sample_field(
            "predictions.detections.field",
            "predictions.detections.new_field",
        )
        self.assertEqual(sample.predictions.detections[0].new_field, 1)
        self.assertListEqual(
            dataset.values("predictions.detections.new_field", unwind=True),
            [1],
        )
        with self.assertRaises(AttributeError):
            sample.predictions.detections[0].field

        schema = dataset.get_field_schema(flat=True)
        self.assertNotIn("predictions.detections.field", schema)
        self.assertIn("predictions.detections.new_field", schema)

        dataset.clear_sample_field("predictions.detections.new_field")
        self.assertIsNone(sample.predictions.detections[0].new_field)

        schema = dataset.get_field_schema(flat=True)
        self.assertIn("predictions.detections.new_field", schema)

        dataset.delete_sample_field("predictions.detections.new_field")
        with self.assertRaises(AttributeError):
            sample.predictions.detections[0].new_field

        schema = dataset.get_field_schema(flat=True)
        self.assertNotIn("predictions.detections.new_field", schema)

    @drop_datasets
    def test_clone_dynamic_embedded_fields(self):
        sample = fo.Sample(
            filepath="image.jpg",
            predictions=fo.Detections(detections=[fo.Detection(field=1)]),
        )

        dataset = fo.Dataset()
        dataset.add_sample(sample, dynamic=True)

        schema = dataset.get_field_schema(flat=True)
        self.assertIn("predictions.detections.field", schema)

        dataset.clone_sample_field(
            "predictions.detections.field",
            "predictions.detections.field_copy",
        )

        schema = dataset.get_field_schema(flat=True)
        self.assertIn("predictions.detections.field", schema)
        self.assertIn("predictions.detections.field_copy", schema)

        self.assertIsNotNone(sample.predictions.detections[0].field)
        self.assertIsNotNone(sample.predictions.detections[0].field_copy)
        self.assertListEqual(
            dataset.values("predictions.detections.field", unwind=True),
            [1],
        )
        self.assertListEqual(
            dataset.values("predictions.detections.field_copy", unwind=True),
            [1],
        )

        dataset.clear_sample_field("predictions.detections.field")
        self.assertIsNone(sample.predictions.detections[0].field)

        schema = dataset.get_field_schema(flat=True)
        self.assertIn("predictions.detections.field", schema)
        self.assertIn("predictions.detections.field_copy", schema)

        dataset.delete_sample_field("predictions.detections.field")
        self.assertIsNotNone(sample.predictions.detections[0].field_copy)
        with self.assertRaises(AttributeError):
            sample.predictions.detections[0].field

        schema = dataset.get_field_schema(flat=True)
        self.assertNotIn("predictions.detections.field", schema)
        self.assertIn("predictions.detections.field_copy", schema)

        dataset.rename_sample_field(
            "predictions.detections.field_copy",
            "predictions.detections.field",
        )
        self.assertIsNotNone(sample.predictions.detections[0].field)
        with self.assertRaises(AttributeError):
            sample.predictions.detections[0].field_copy

        schema = dataset.get_field_schema(flat=True)
        self.assertIn("predictions.detections.field", schema)
        self.assertNotIn("predictions.detections.field_copy", schema)

    @drop_datasets
    def test_clone_dynamic_embedded_id_fields(self):
        _id = ObjectId()

        sample = fo.Sample(
            filepath="image.jpg",
            predictions=fo.Detections(detections=[fo.Detection(id_field=_id)]),
        )

        dataset = fo.Dataset()
        dataset.add_sample(sample, dynamic=True)

        schema = dataset.get_field_schema(flat=True)
        self.assertIn("predictions.detections.id_field", schema)

        id_field = schema["predictions.detections.id_field"]
        self.assertEqual(id_field.name, "id_field")
        self.assertEqual(id_field.db_field, "_id_field")

        ids = dataset.values("predictions.detections.id_field", unwind=True)
        _ids = dataset.values("predictions.detections._id_field", unwind=True)

        self.assertListEqual(ids, [str(_id)])
        self.assertListEqual(_ids, [_id])

        dataset.clone_sample_field(
            "predictions.detections.id_field",
            "predictions.detections.id_field_copy",
        )

        schema = dataset.get_field_schema(flat=True)
        self.assertIn("predictions.detections.id_field", schema)
        self.assertIn("predictions.detections.id_field_copy", schema)

        id_field_copy = schema["predictions.detections.id_field_copy"]
        self.assertEqual(id_field_copy.name, "id_field_copy")
        self.assertEqual(id_field_copy.db_field, "_id_field_copy")

        id_copys = dataset.values(
            "predictions.detections.id_field_copy", unwind=True
        )
        _id_copys = dataset.values(
            "predictions.detections._id_field_copy", unwind=True
        )

        self.assertListEqual(id_copys, [str(_id)])
        self.assertListEqual(_id_copys, [_id])

        self.assertIsNotNone(sample.predictions.detections[0].id_field)
        self.assertIsNotNone(sample.predictions.detections[0].id_field_copy)

        dataset.clear_sample_field("predictions.detections.id_field")

        # @todo why does this raise an AttributeError?
        # self.assertIsNone(sample.predictions.detections[0].id_field)

        ids = dataset.values("predictions.detections.id_field", unwind=True)
        self.assertListEqual(ids, [None])

        schema = dataset.get_field_schema(flat=True)
        self.assertIn("predictions.detections.id_field", schema)
        self.assertIn("predictions.detections.id_field_copy", schema)

        dataset.delete_sample_field("predictions.detections.id_field")
        self.assertIsNotNone(sample.predictions.detections[0].id_field_copy)
        with self.assertRaises(AttributeError):
            sample.predictions.detections[0].id_field

        schema = dataset.get_field_schema(flat=True)
        self.assertNotIn("predictions.detections.id_field", schema)
        self.assertIn("predictions.detections.id_field_copy", schema)

        ids = dataset.values("predictions.detections.id_field", unwind=True)
        self.assertListEqual(ids, [None])

        dataset.rename_sample_field(
            "predictions.detections.id_field_copy",
            "predictions.detections.id_field",
        )
        self.assertIsNotNone(sample.predictions.detections[0].id_field)
        with self.assertRaises(AttributeError):
            sample.predictions.detections[0].id_field_copy

        schema = dataset.get_field_schema(flat=True)
        self.assertIn("predictions.detections.id_field", schema)
        self.assertNotIn("predictions.detections.id_field_copy", schema)

        ids = dataset.values("predictions.detections.id_field", unwind=True)
        _ids = dataset.values("predictions.detections._id_field", unwind=True)

        self.assertListEqual(ids, [str(_id)])
        self.assertListEqual(_ids, [_id])

    @drop_datasets
    def test_clone_dynamic_embedded_frame_fields(self):
        dataset = fo.Dataset()
        sample = fo.Sample(filepath="video.mp4")
        frame = fo.Frame(
            predictions=fo.Detections(detections=[fo.Detection(field=1)])
        )
        sample.frames[1] = frame
        dataset.add_sample(sample, dynamic=True)

        schema = dataset.get_frame_field_schema(flat=True)
        self.assertIn("predictions.detections.field", schema)

        with self.assertRaises(Exception):
            dataset.rename_frame_field(
                "predictions.detections.id",
                "predictions.detections.id_oops",
            )

        with self.assertRaises(Exception):
            dataset.rename_frame_field(
                "predictions.detections.bounding_box",
                "predictions.detections.bounding_box_oops",
            )

        with self.assertRaises(Exception):
            dataset.rename_frame_field(
                "predictions.detections.confidence",
                "predictions.detections.confidence_oops",
            )

        dataset.clone_frame_field(
            "predictions.detections.field",
            "predictions.detections.field_copy",
        )

        schema = dataset.get_frame_field_schema(flat=True)
        self.assertIn("predictions.detections.field", schema)
        self.assertIn("predictions.detections.field_copy", schema)

        self.assertIsNotNone(frame.predictions.detections[0].field)
        self.assertIsNotNone(frame.predictions.detections[0].field_copy)
        self.assertListEqual(
            dataset.values("frames.predictions.detections.field", unwind=True),
            [1],
        )
        self.assertListEqual(
            dataset.values(
                "frames.predictions.detections.field_copy", unwind=True
            ),
            [1],
        )

        dataset.clear_frame_field("predictions.detections.field")
        self.assertIsNone(frame.predictions.detections[0].field)

        schema = dataset.get_frame_field_schema(flat=True)
        self.assertIn("predictions.detections.field", schema)
        self.assertIn("predictions.detections.field_copy", schema)

        dataset.delete_frame_field("predictions.detections.field")
        self.assertIsNotNone(frame.predictions.detections[0].field_copy)
        with self.assertRaises(AttributeError):
            frame.predictions.detections[0].field

        schema = dataset.get_frame_field_schema(flat=True)
        self.assertNotIn("predictions.detections.field", schema)
        self.assertIn("predictions.detections.field_copy", schema)

        dataset.rename_frame_field(
            "predictions.detections.field_copy",
            "predictions.detections.field",
        )
        self.assertIsNotNone(frame.predictions.detections[0].field)
        with self.assertRaises(AttributeError):
            frame.predictions.detections[0].field_copy

        schema = dataset.get_frame_field_schema(flat=True)
        self.assertIn("predictions.detections.field", schema)
        self.assertNotIn("predictions.detections.field_copy", schema)

    @drop_datasets
    def test_select_exclude_dynamic_fields(self):
        sample = fo.Sample(
            filepath="video.mp4",
            field=1,
            predictions=fo.Detections(detections=[fo.Detection(field=1)]),
        )
        frame = fo.Frame(
            field=1,
            predictions=fo.Detections(detections=[fo.Detection(field=1)]),
        )
        sample.frames[1] = frame

        dataset = fo.Dataset()
        dataset.add_sample(sample, dynamic=True)

        # Sample fields

        schema = dataset.get_field_schema(flat=True)

        self.assertIn("field", schema)
        self.assertIn("predictions.detections.field", schema)

        view = dataset.select_fields("predictions.detections.label")
        schema = view.get_field_schema(flat=True)
        sample = view.first()

        self.assertNotIn("field", schema)
        self.assertNotIn("predictions.detections.field", schema)
        self.assertFalse(sample.has_field("field"))
        self.assertFalse(sample.predictions.detections[0].has_field("field"))

        view = dataset.exclude_fields("predictions.detections.field")
        schema = view.get_field_schema(flat=True)
        sample = view.first()

        self.assertIn("field", schema)
        self.assertNotIn("predictions.detections.field", schema)
        self.assertTrue(sample.has_field("field"))
        self.assertFalse(sample.predictions.detections[0].has_field("field"))

        view = dataset.select_fields("predictions").exclude_fields(
            "predictions.detections.field"
        )
        schema = view.get_field_schema(flat=True)
        sample = view.first()

        self.assertNotIn("field", schema)
        self.assertNotIn("predictions.detections.field", schema)
        self.assertFalse(sample.has_field("field"))
        self.assertFalse(sample.predictions.detections[0].has_field("field"))

        # Frame fields

        schema = dataset.get_frame_field_schema(flat=True)

        self.assertIn("field", schema)
        self.assertIn("predictions.detections.field", schema)

        view = dataset.select_fields("frames.predictions.detections.label")
        schema = view.get_frame_field_schema(flat=True)
        frame = view.first().frames.first()

        self.assertNotIn("field", schema)
        self.assertNotIn("predictions.detections.field", schema)
        self.assertFalse(frame.has_field("field"))
        self.assertFalse(frame.predictions.detections[0].has_field("field"))

        view = dataset.exclude_fields("frames.predictions.detections.field")
        schema = view.get_frame_field_schema(flat=True)
        frame = view.first().frames.first()

        self.assertIn("field", schema)
        self.assertNotIn("predictions.detections.field", schema)
        self.assertTrue(frame.has_field("field"))
        self.assertFalse(frame.predictions.detections[0].has_field("field"))

        view = dataset.select_fields("frames.predictions").exclude_fields(
            "frames.predictions.detections.field"
        )
        schema = view.get_frame_field_schema(flat=True)
        frame = view.first().frames.first()

        self.assertNotIn("field", schema)
        self.assertNotIn("predictions.detections.field", schema)
        self.assertFalse(frame.has_field("field"))
        self.assertFalse(frame.predictions.detections[0].has_field("field"))


class CustomEmbeddedDocumentTests(unittest.TestCase):
    @drop_datasets
    def test_custom_embedded_documents_on_the_fly(self):
        dataset = fo.Dataset()

        dataset.add_sample_field(
            "camera_info",
            fo.EmbeddedDocumentField,
            embedded_doc_type=fo.DynamicEmbeddedDocument,
        )

        # This tests that we've handled a mongoengine reference error that used
        # to occur before we explicitly accounted for it
        gc.collect()

        dataset.add_sample_field("camera_info.camera_id", fo.StringField)

        self.assertIn(
            "camera_info.camera_id", dataset.get_field_schema(flat=True)
        )

        sample1 = fo.Sample(
            filepath="/path/to/image1.jpg",
            camera_info=fo.DynamicEmbeddedDocument(
                camera_id="123456789",
                quality=51.0,
            ),
        )

        sample2 = fo.Sample(
            filepath="/path/to/image2.jpg",
            camera_info=fo.DynamicEmbeddedDocument(camera_id="123456789"),
        )

        dataset.add_samples([sample1, sample2], dynamic=True)

        self.assertIn(
            "camera_info.quality", dataset.get_field_schema(flat=True)
        )

        dataset.set_values(
            "camera_info.description", ["foo", "bar"], dynamic=True
        )

        self.assertIn(
            "camera_info.description", dataset.get_field_schema(flat=True)
        )

    @drop_datasets
    def test_custom_embedded_document_classes(self):
        sample = fo.Sample(
            filepath="/path/to/image.png",
            camera_info=_CameraInfo(
                camera_id="123456789",
                quality=99.0,
            ),
            weather=fo.Classification(
                label="sunny",
                confidence=0.95,
                metadata=_LabelMetadata(
                    model_name="resnet50",
                    description="A dynamic field",
                ),
            ),
        )

        dataset = fo.Dataset()
        created_at = dataset.created_at
        dataset.add_sample(sample)

        self.assertIsInstance(sample.camera_info, _CameraInfo)
        self.assertIsInstance(sample.weather.metadata, _LabelMetadata)
        self.assertTrue("camera_info" in dataset.get_field_schema())
        self.assertGreater(
            dataset.get_field("camera_info").created_at, created_at
        )
        self.assertTrue("weather" in dataset.get_field_schema())
        self.assertGreater(dataset.get_field("weather").created_at, created_at)

        view = dataset.limit(1)
        sample_view = view.first()

        self.assertIsInstance(sample_view.camera_info, _CameraInfo)
        self.assertIsInstance(sample_view.weather.metadata, _LabelMetadata)


class _CameraInfo(fo.EmbeddedDocument):
    camera_id = fof.StringField(required=True)
    quality = fof.FloatField()
    description = fof.StringField()


class _LabelMetadata(fo.DynamicEmbeddedDocument):
    created_at = fof.DateTimeField(default=datetime.utcnow)

    model_name = fof.StringField()


class DatasetFactoryTests(unittest.TestCase):
    @drop_datasets
    def test_from_images(self):
        filepaths = ["image.jpg"]
        dataset = fo.Dataset.from_images(filepaths)

        self.assertEqual(len(dataset), 1)

        with self.assertRaises(ValueError):
            fo.Dataset.from_images(filepaths, name=dataset.name)

        dataset2 = fo.Dataset.from_images(
            filepaths, name=dataset.name, overwrite=True
        )

        self.assertEqual(len(dataset2), 1)

        samples = [{"filepath": "image.jpg"}]
        sample_parser = _ImageSampleParser()
        dataset = fo.Dataset.from_images(samples, sample_parser=sample_parser)

        self.assertEqual(len(dataset), 1)

        with self.assertRaises(ValueError):
            fo.Dataset.from_images(
                samples,
                sample_parser=sample_parser,
                name=dataset.name,
            )

        dataset2 = fo.Dataset.from_images(
            samples,
            sample_parser=sample_parser,
            name=dataset.name,
            overwrite=True,
        )

        self.assertEqual(len(dataset2), 1)

    @drop_datasets
    def test_from_videos(self):
        filepaths = ["image.jpg"]
        dataset = fo.Dataset.from_videos(filepaths)

        self.assertEqual(len(dataset), 1)

        with self.assertRaises(ValueError):
            fo.Dataset.from_videos(filepaths, name=dataset.name)

        dataset2 = fo.Dataset.from_videos(
            filepaths, name=dataset.name, overwrite=True
        )

        self.assertEqual(len(dataset2), 1)

        samples = [{"filepath": "video.mp4"}]
        sample_parser = _VideoSampleParser()
        dataset = fo.Dataset.from_videos(samples, sample_parser=sample_parser)

        self.assertEqual(len(dataset), 1)

        with self.assertRaises(ValueError):
            fo.Dataset.from_videos(
                samples,
                sample_parser=sample_parser,
                name=dataset.name,
            )

        dataset2 = fo.Dataset.from_videos(
            samples,
            sample_parser=sample_parser,
            name=dataset.name,
            overwrite=True,
        )

        self.assertEqual(len(dataset2), 1)

    @drop_datasets
    def test_from_labeled_images(self):
        samples = [{"filepath": "image.jpg", "label": "label"}]
        sample_parser = _LabeledImageSampleParser()
        dataset = fo.Dataset.from_labeled_images(
            samples, sample_parser, label_field="ground_truth"
        )

        self.assertEqual(dataset.values("ground_truth.label"), ["label"])

        with self.assertRaises(ValueError):
            fo.Dataset.from_labeled_images(
                samples,
                sample_parser,
                label_field="ground_truth",
                name=dataset.name,
            )

        dataset2 = fo.Dataset.from_labeled_images(
            samples,
            sample_parser,
            label_field="ground_truth",
            name=dataset.name,
            overwrite=True,
        )

        self.assertEqual(dataset2.values("ground_truth.label"), ["label"])

    @drop_datasets
    def test_from_labeled_videos(self):
        samples = [{"filepath": "video.mp4", "label": "label"}]
        sample_parser = _LabeledVideoSampleParser()
        dataset = fo.Dataset.from_labeled_videos(
            samples, sample_parser, label_field="ground_truth"
        )

        self.assertEqual(dataset.values("ground_truth.label"), ["label"])

        with self.assertRaises(ValueError):
            fo.Dataset.from_labeled_videos(
                samples,
                sample_parser,
                label_field="ground_truth",
                name=dataset.name,
            )

        dataset2 = fo.Dataset.from_labeled_videos(
            samples,
            sample_parser,
            label_field="ground_truth",
            name=dataset.name,
            overwrite=True,
        )

        self.assertEqual(dataset2.values("ground_truth.label"), ["label"])


class _ImageSampleParser(foud.ImageSampleParser):
    @property
    def has_image_path(self):
        return True

    @property
    def has_image_metadata(self):
        return False

    def get_image_path(self):
        return self.current_sample["filepath"]


class _VideoSampleParser(foud.VideoSampleParser):
    @property
    def has_video_metadata(self):
        return False

    def get_video_path(self):
        return self.current_sample["filepath"]


class _LabeledImageSampleParser(foud.LabeledImageSampleParser):
    @property
    def has_image_path(self):
        return True

    @property
    def has_image_metadata(self):
        return False

    def get_image_path(self):
        return self.current_sample["filepath"]

    @property
    def label_cls(self):
        return fo.Classification

    def get_label(self):
        label = self.current_sample["label"]
        return fo.Classification(label=label)


class _LabeledVideoSampleParser(foud.LabeledVideoSampleParser):
    @property
    def has_video_metadata(self):
        return False

    def get_video_path(self):
        return self.current_sample["filepath"]

    @property
    def label_cls(self):
        return fo.Classification

    @property
    def frame_label_cls(self):
        return None

    def get_label(self):
        label = self.current_sample["label"]
        return fo.Classification(label=label)

    def get_frame_labels(self):
        return None


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
