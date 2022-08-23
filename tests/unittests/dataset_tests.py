"""
FiftyOne dataset-related unit tests.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from datetime import date, datetime
import gc
import os

from bson import ObjectId
import numpy as np
import pytz
import unittest

import eta.core.utils as etau

import fiftyone as fo
from fiftyone import ViewField as F
import fiftyone.core.odm as foo

from decorators import drop_datasets, skip_windows


class DatasetTests(unittest.TestCase):
    @drop_datasets
    def test_list_datasets(self):
        self.assertIsInstance(fo.list_datasets(), list)

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
        datasets[name].delete()
        self.assertListEqual(list_datasets(), dataset_names)
        with self.assertRaises(ValueError):
            len(datasets[name])

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
    def test_dataset_tags(self):
        dataset_name = self.test_dataset_tags.__name__

        dataset = fo.Dataset(dataset_name)

        self.assertEqual(dataset.tags, [])

        dataset.tags = ["cat", "dog"]

        del dataset
        gc.collect()  # force garbage collection

        dataset2 = fo.load_dataset(dataset_name)

        self.assertEqual(dataset2.tags, ["cat", "dog"])

        # save() must be called to persist in-place edits
        dataset2.tags.append("rabbit")

        del dataset2
        gc.collect()  # force garbage collection

        dataset3 = fo.load_dataset(dataset_name)

        self.assertEqual(dataset3.tags, ["cat", "dog"])

        # This will persist the edits
        dataset3.tags.append("rabbit")
        dataset3.save()

        del dataset3
        gc.collect()  # force garbage collection

        dataset4 = fo.load_dataset(dataset_name)

        self.assertEqual(dataset4.tags, ["cat", "dog", "rabbit"])

    @drop_datasets
    def test_dataset_info(self):
        dataset_name = self.test_dataset_info.__name__

        dataset = fo.Dataset(dataset_name)

        self.assertEqual(dataset.info, {})
        self.assertIsInstance(dataset.info, dict)

        classes = ["cat", "dog"]

        dataset.info["classes"] = classes
        dataset.save()

        del dataset
        gc.collect()  # force garbage collection

        dataset2 = fo.load_dataset(dataset_name)

        self.assertTrue("classes" in dataset2.info)
        self.assertEqual(classes, dataset2.info["classes"])

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

        default_indexes = {"id", "filepath"}
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
    def test_iter_samples(self):
        dataset = fo.Dataset()
        dataset.add_samples(
            [fo.Sample(filepath="image%d.jpg" % i) for i in range(50)]
        )

        for idx, sample in enumerate(dataset):
            sample["int"] = idx + 1
            sample.save()

        self.assertTupleEqual(dataset.bounds("int"), (1, 50))

        for idx, sample in enumerate(dataset.iter_samples(progress=True)):
            sample["int"] = idx + 2
            sample.save()

        self.assertTupleEqual(dataset.bounds("int"), (2, 51))

        for idx, sample in enumerate(dataset.iter_samples(autosave=True)):
            sample["int"] = idx + 3

        self.assertTupleEqual(dataset.bounds("int"), (3, 52))

        with dataset.save_context() as context:
            for idx, sample in enumerate(dataset):
                sample["int"] = idx + 4
                context.save(sample)

        self.assertTupleEqual(dataset.bounds("int"), (4, 53))

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

        dataset1.add_sample(fo.Sample(filepath=filepath1, field=1))
        dataset1.add_sample(common1)

        dataset2.add_sample(fo.Sample(filepath=filepath2, field=2))
        dataset2.add_sample(common2)

        # Standard merge

        dataset12 = dataset1.clone()
        dataset12.merge_samples(dataset2)
        self.assertEqual(len(dataset12), 3)
        common12_view = dataset12.match(F("filepath") == common_filepath)
        self.assertEqual(len(common12_view), 1)

        common12 = common12_view.first()
        self.assertEqual(common12.field, common2.field)

        # Merge specific fields, no new samples

        dataset1c = dataset1.clone()
        dataset1c.merge_samples(dataset2, fields=["field"], insert_new=False)
        self.assertEqual(len(dataset1c), 2)
        common12_view = dataset1c.match(F("filepath") == common_filepath)
        self.assertEqual(len(common12_view), 1)

        common12 = common12_view.first()
        self.assertEqual(common12.field, common2.field)

        # Merge a view with excluded fields

        dataset21 = dataset1.clone()
        dataset21.merge_samples(dataset2.exclude_fields("field"))
        self.assertEqual(len(dataset21), 3)

        common21_view = dataset21.match(F("filepath") == common_filepath)
        self.assertEqual(len(common21_view), 1)

        common21 = common21_view.first()
        self.assertEqual(common21.field, common1.field)

        # Merge with custom key

        dataset22 = dataset1.clone()
        key_fcn = lambda sample: os.path.basename(sample.filepath)
        dataset22.merge_samples(dataset2, key_fcn=key_fcn)

        self.assertEqual(len(dataset22), 3)

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

        dataset1.merge_samples(dataset2.select_fields("field"))

        self.assertEqual(sample11.field, 2)
        self.assertEqual(sample12.field, 1)
        self.assertIsNone(sample11.gt)
        self.assertIsNotNone(sample12.gt)
        with self.assertRaises(AttributeError):
            sample11.new_field

        with self.assertRaises(AttributeError):
            sample12.new_gt

        dataset1.merge_samples(dataset2)

        self.assertEqual(sample11.field, 2)
        self.assertEqual(sample11.new_field, 3)
        self.assertEqual(sample12.field, 1)
        self.assertIsNone(sample12.new_field)
        self.assertIsNone(sample11.gt)
        self.assertIsNone(sample11.new_gt)
        self.assertIsNotNone(sample12.gt)
        self.assertIsNotNone(sample12.new_gt)

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

            fields1 = set(dataset1.get_field_schema().keys())
            fields2 = set(d1.get_field_schema().keys())
            new_fields = fields2 - fields1

            self.assertEqual(len(d1), 6)
            for s1, s2 in zip(dataset1, d1):
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
        dataset.add_collection(dataset2)

        self.assertEqual(len(dataset), 2)
        self.assertTrue("spam" in dataset.get_field_schema())
        self.assertIsNone(dataset.first()["spam"])
        self.assertEqual(dataset.last()["spam"], "eggs")

        # Merge view
        dataset = dataset1.clone()
        dataset.add_collection(dataset2.exclude_fields("spam"))

        self.assertEqual(len(dataset), 2)
        self.assertTrue("spam" not in dataset.get_field_schema())
        self.assertIsNone(dataset.last()["foo"])

    @drop_datasets
    def test_add_collection_new_ids(self):
        sample1 = fo.Sample(filepath="image.jpg", foo="bar")
        dataset1 = fo.Dataset()
        dataset1.add_sample(sample1)

        # Merge dataset
        dataset = dataset1.clone()
        dataset.add_collection(dataset, new_ids=True)

        self.assertEqual(len(dataset), 2)
        self.assertEqual(len(set(dataset.values("id"))), 2)
        self.assertEqual(dataset.first()["foo"], "bar")
        self.assertEqual(dataset.last()["foo"], "bar")

        # Merge view
        dataset = dataset1.clone()
        dataset.add_collection(dataset.exclude_fields("foo"), new_ids=True)

        self.assertEqual(len(dataset), 2)
        self.assertEqual(len(set(dataset.values("id"))), 2)
        self.assertEqual(dataset.first()["foo"], "bar")
        self.assertIsNone(dataset.last()["foo"])

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

    @skip_windows  # TODO: don't skip on Windows
    @drop_datasets
    def test_rename_fields(self):
        dataset = fo.Dataset()
        sample = fo.Sample(filepath="/path/to/image.jpg", field=1)
        dataset.add_sample(sample)

        dataset.rename_sample_field("field", "new_field")
        self.assertFalse("field" in dataset.get_field_schema())
        self.assertTrue("new_field" in dataset.get_field_schema())
        self.assertEqual(sample["new_field"], 1)
        self.assertListEqual(dataset.values("new_field"), [1])
        with self.assertRaises(KeyError):
            sample["field"]

    @skip_windows  # TODO: don't skip on Windows
    @drop_datasets
    def test_rename_embedded_fields(self):
        dataset = fo.Dataset()
        sample = fo.Sample(
            filepath="image.jpg",
            predictions=fo.Detections(detections=[fo.Detection(field=1)]),
        )
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

        dataset.clear_sample_field("predictions.detections.field")
        self.assertIsNone(sample.predictions.detections[0].field)

        dataset.delete_sample_field("predictions.detections.field")
        self.assertIsNotNone(sample.predictions.detections[0].new_field)
        with self.assertRaises(AttributeError):
            sample.predictions.detections[0].field

        dataset.rename_sample_field(
            "predictions.detections.new_field",
            "predictions.detections.field",
        )
        self.assertEqual(sample.predictions.detections[0].field, 1)
        self.assertListEqual(
            dataset.values("predictions.detections.field", unwind=True),
            [1],
        )
        with self.assertRaises(AttributeError):
            sample.predictions.detections[0].new_field

    @skip_windows  # TODO: don't skip on Windows
    @drop_datasets
    def test_clone_fields(self):
        dataset = fo.Dataset()
        sample = fo.Sample(filepath="image.jpg", field=1)
        dataset.add_sample(sample)

        dataset.clone_sample_field("field", "field_copy")
        schema = dataset.get_field_schema()
        self.assertIn("field", schema)
        self.assertIn("field_copy", schema)
        self.assertIsNotNone(sample.field)
        self.assertIsNotNone(sample.field_copy)
        self.assertEqual(sample.field, 1)
        self.assertEqual(sample.field_copy, 1)
        self.assertListEqual(dataset.values("field"), [1])
        self.assertListEqual(dataset.values("field_copy"), [1])

        dataset.clear_sample_field("field")
        schema = dataset.get_field_schema()
        self.assertIn("field", schema)
        self.assertIsNone(sample.field)
        self.assertIsNotNone(sample.field_copy)

        dataset.delete_sample_field("field")
        self.assertIsNotNone(sample.field_copy)
        with self.assertRaises(AttributeError):
            sample.field

        dataset.rename_sample_field("field_copy", "field")
        self.assertIsNotNone(sample.field)
        with self.assertRaises(AttributeError):
            sample.field_copy

    @skip_windows  # TODO: don't skip on Windows
    @drop_datasets
    def test_object_id_fields1(self):
        dataset = fo.Dataset()
        sample = fo.Sample(filepath="image.jpg")
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
        dataset = fo.Dataset()
        sample = fo.Sample(
            filepath="image.jpg",
            predictions=fo.Detections(detections=[fo.Detection(field=1)]),
        )
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
        dataset = fo.Dataset()
        sample = fo.Sample(filepath="video.mp4")
        frame = fo.Frame(field=1)
        sample.frames[1] = frame
        dataset.add_sample(sample)

        dataset.clone_frame_field("field", "field_copy")
        schema = dataset.get_frame_field_schema()
        self.assertIn("field", schema)
        self.assertIn("field_copy", schema)
        self.assertEqual(frame.field, 1)
        self.assertEqual(frame.field_copy, 1)
        self.assertListEqual(dataset.values("frames.field", unwind=True), [1])
        self.assertListEqual(
            dataset.values("frames.field_copy", unwind=True), [1]
        )

        dataset.clear_frame_field("field")
        schema = dataset.get_frame_field_schema()
        self.assertIn("field", schema)
        self.assertIsNone(frame.field)
        self.assertIsNotNone(frame.field_copy)

        dataset.delete_frame_field("field")
        self.assertIsNotNone(frame.field_copy)
        with self.assertRaises(AttributeError):
            frame.field

        dataset.rename_frame_field("field_copy", "field")
        self.assertIsNotNone(frame.field)
        with self.assertRaises(AttributeError):
            frame.field_copy

    @skip_windows  # TODO: don't skip on Windows
    @drop_datasets
    def test_clone_embedded_frame_fields(self):
        dataset = fo.Dataset()
        sample = fo.Sample(filepath="video.mp4")
        frame = fo.Frame(
            predictions=fo.Detections(detections=[fo.Detection(field=1)])
        )
        sample.frames[1] = frame
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
    def test_classes(self):
        dataset = fo.Dataset()

        default_classes = ["cat", "dog"]
        dataset.default_classes = default_classes

        dataset.reload()
        self.assertListEqual(dataset.default_classes, default_classes)

        with self.assertRaises(Exception):
            dataset.default_classes.append(1)
            dataset.save()  # error

        dataset.default_classes.pop()
        dataset.save()  # success

        classes = {"ground_truth": ["cat", "dog"]}

        dataset.classes = classes

        dataset.reload()
        self.assertDictEqual(dataset.classes, classes)

        with self.assertRaises(Exception):
            dataset.classes["other"] = {"hi": "there"}
            dataset.save()  # error

        dataset.classes.pop("other")

        with self.assertRaises(Exception):
            dataset.classes["ground_truth"].append(1)
            dataset.save()  # error

        dataset.classes["ground_truth"].pop()

        dataset.save()  # success

    @drop_datasets
    def test_mask_targets(self):
        dataset = fo.Dataset()

        default_mask_targets = {1: "cat", 2: "dog"}
        dataset.default_mask_targets = default_mask_targets

        dataset.reload()
        self.assertDictEqual(
            dataset.default_mask_targets, default_mask_targets
        )

        with self.assertRaises(Exception):
            dataset.default_mask_targets["hi"] = "there"
            dataset.save()  # error

        dataset.default_mask_targets.pop("hi")
        dataset.save()  # success

        mask_targets = {"ground_truth": {1: "cat", 2: "dog"}}
        dataset.mask_targets = mask_targets

        dataset.reload()
        self.assertDictEqual(dataset.mask_targets, mask_targets)

        with self.assertRaises(Exception):
            dataset.mask_targets["hi"] = "there"
            dataset.save()  # error

        dataset.mask_targets.pop("hi")
        dataset.save()  # success

        with self.assertRaises(Exception):
            dataset.mask_targets[1] = {1: "cat", 2: "dog"}
            dataset.save()  # error

        dataset.mask_targets.pop(1)
        dataset.save()  # success

        with self.assertRaises(Exception):
            dataset.mask_targets["ground_truth"]["hi"] = "there"
            dataset.save()  # error

        dataset.mask_targets["ground_truth"].pop("hi")
        dataset.save()  # success

        with self.assertRaises(Exception):
            dataset.mask_targets["predictions"] = {1: {"too": "many"}}
            dataset.save()  # error

        dataset.mask_targets.pop("predictions")
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

        dataset.default_skeleton.labels = ["left eye", "right eye"]
        dataset.save()  # success

        with self.assertRaises(Exception):
            dataset.default_skeleton.edges = "hello"
            dataset.save()  # error

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

        dataset.skeletons.pop("hi")
        dataset.save()  # success

        with self.assertRaises(Exception):
            dataset.skeletons[1] = fo.KeypointSkeleton(
                labels=["left eye", "right eye"], edges=[[0, 1]]
            )
            dataset.save()  # error

        dataset.skeletons.pop(1)
        dataset.save()  # success

        with self.assertRaises(Exception):
            dataset.skeletons["ground_truth"].labels = [1]
            dataset.save()  # error

        dataset.skeletons["ground_truth"].labels = ["left eye", "right eye"]
        dataset.save()  # success

        with self.assertRaises(Exception):
            dataset.skeletons["ground_truth"].edges = "hello"
            dataset.save()  # error

        dataset.skeletons["ground_truth"].edges = [[0, 1]]
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


class DatasetSerializationTests(unittest.TestCase):
    @drop_datasets
    def test_serialize_sample(self):
        sample = fo.Sample(filepath="image.jpg", foo="bar")

        d = sample.to_dict()
        self.assertNotIn("id", d)
        self.assertNotIn("_id", d)

        sample2 = fo.Sample.from_dict(d)
        self.assertEqual(sample2["foo"], "bar")

        d = sample.to_dict(include_private=True)
        self.assertIn("_id", d)
        self.assertIn("_media_type", d)
        self.assertIn("_rand", d)

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

        frame2 = fo.Frame.from_dict(d)
        self.assertEqual(frame2["foo"], "bar")

        d = frame.to_dict(include_private=True)
        self.assertIn("_id", d)
        self.assertIn("_sample_id", d)

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

        sample3 = sample1.copy()
        sample3.filepath = "image3.png"

        self.dataset.add_samples([sample1, sample2, sample3])

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

        sample2 = sample1.copy()
        sample2.filepath = "video2.mp4"

        self.dataset.add_samples([sample1, sample2])

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

        sample3 = sample1.copy()
        sample3.filepath = "image3.png"

        self.dataset.add_samples([sample1, sample2, sample3])

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

        sample2 = sample1.copy()
        sample2.filepath = "video2.mp4"

        self.dataset.add_samples([sample1, sample2])

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

        self.dataset.delete_labels(ids=ids)

        num_labels_after = self.dataset.count("ground_truth")

        self.assertEqual(num_labels_after, num_labels - num_ids)

    def test_delete_classification_tags(self):
        self._setUp_classification()

        ids = [
            self.dataset.first().ground_truth.id,
            self.dataset.last().ground_truth.id,
        ]

        self.dataset.select_labels(ids=ids).tag_labels("test")

        num_labels = self.dataset.count("ground_truth")
        num_tagged = self.dataset.count_label_tags()["test"]

        self.dataset.delete_labels(tags="test")

        num_labels_after = self.dataset.count("ground_truth")

        self.assertEqual(num_labels_after, num_labels - num_tagged)

    def test_delete_classification_view(self):
        self._setUp_classification()

        ids = [
            self.dataset.first().ground_truth.id,
            self.dataset.last().ground_truth.id,
        ]

        view = self.dataset.select_labels(ids=ids)

        num_labels = self.dataset.count("ground_truth")
        num_view = view.count("ground_truth")

        self.dataset.delete_labels(view=view)

        num_labels_after = self.dataset.count("ground_truth")

        self.assertEqual(num_labels_after, num_labels - num_view)

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

        self.dataset.delete_labels(labels=labels)

        num_labels_after = self.dataset.count("ground_truth")

        self.assertEqual(num_labels_after, num_labels - num_selected)

    def test_delete_detections_ids(self):
        self._setUp_detections()

        ids = [
            self.dataset.first().ground_truth.detections[0].id,
            self.dataset.last().ground_truth.detections[-1].id,
        ]

        num_labels = self.dataset.count("ground_truth.detections")
        num_ids = len(ids)

        self.dataset.delete_labels(ids=ids)

        num_labels_after = self.dataset.count("ground_truth.detections")

        self.assertEqual(num_labels_after, num_labels - num_ids)

    def test_delete_detections_tags(self):
        self._setUp_detections()

        ids = [
            self.dataset.first().ground_truth.detections[0].id,
            self.dataset.last().ground_truth.detections[-1].id,
        ]

        self.dataset.select_labels(ids=ids).tag_labels("test")

        num_labels = self.dataset.count("ground_truth.detections")
        num_tagged = self.dataset.count_label_tags()["test"]

        self.dataset.delete_labels(tags="test")

        num_labels_after = self.dataset.count("ground_truth.detections")

        self.assertEqual(num_labels_after, num_labels - num_tagged)

    def test_delete_detections_view(self):
        self._setUp_detections()

        ids = [
            self.dataset.first().ground_truth.detections[0].id,
            self.dataset.last().ground_truth.detections[-1].id,
        ]

        view = self.dataset.select_labels(ids=ids)

        num_labels = self.dataset.count("ground_truth.detections")
        num_view = view.count("ground_truth.detections")

        self.dataset.delete_labels(view=view)

        num_labels_after = self.dataset.count("ground_truth.detections")

        self.assertEqual(num_labels_after, num_labels - num_view)

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

        self.dataset.delete_labels(labels=labels)

        num_labels_after = self.dataset.count("ground_truth.detections")

        self.assertEqual(num_labels_after, num_labels - num_selected)

    def test_delete_video_classification_ids(self):
        self._setUp_video_classification()

        ids = [
            self.dataset.first().frames[1].ground_truth.id,
            self.dataset.last().frames[3].ground_truth.id,
        ]

        num_labels = self.dataset.count("frames.ground_truth")
        num_ids = len(ids)

        self.dataset.delete_labels(ids=ids)

        num_labels_after = self.dataset.count("frames.ground_truth")

        self.assertEqual(num_labels_after, num_labels - num_ids)

    def test_delete_video_classification_tags(self):
        self._setUp_video_classification()

        ids = [
            self.dataset.first().frames[1].ground_truth.id,
            self.dataset.last().frames[3].ground_truth.id,
        ]

        self.dataset.select_labels(ids=ids).tag_labels("test")

        num_labels = self.dataset.count("frames.ground_truth")
        num_tagged = self.dataset.count_label_tags()["test"]

        self.dataset.delete_labels(tags="test")

        num_labels_after = self.dataset.count("frames.ground_truth")

        self.assertEqual(num_labels_after, num_labels - num_tagged)

    def test_delete_video_classification_view(self):
        self._setUp_video_classification()

        ids = [
            self.dataset.first().frames[1].ground_truth.id,
            self.dataset.last().frames[3].ground_truth.id,
        ]

        view = self.dataset.select_labels(ids=ids)

        num_labels = self.dataset.count("frames.ground_truth")
        num_view = view.count("frames.ground_truth")

        self.dataset.delete_labels(view=view)

        num_labels_after = self.dataset.count("frames.ground_truth")

        self.assertEqual(num_labels_after, num_labels - num_view)

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

        self.dataset.delete_labels(labels=labels)

        num_labels_after = self.dataset.count("frames.ground_truth")

        self.assertEqual(num_labels_after, num_labels - num_selected)

    def test_delete_video_detections_ids(self):
        self._setUp_video_detections()

        ids = [
            self.dataset.first().frames[1].ground_truth.detections[0].id,
            self.dataset.last().frames[3].ground_truth.detections[-1].id,
        ]

        num_labels = self.dataset.count("frames.ground_truth.detections")
        num_ids = len(ids)

        self.dataset.delete_labels(ids=ids)

        num_labels_after = self.dataset.count("frames.ground_truth.detections")

        self.assertEqual(num_labels_after, num_labels - num_ids)

    def test_delete_video_detections_tags(self):
        self._setUp_video_detections()

        ids = [
            self.dataset.first().frames[1].ground_truth.detections[0].id,
            self.dataset.last().frames[3].ground_truth.detections[-1].id,
        ]

        self.dataset.select_labels(ids=ids).tag_labels("test")

        num_labels = self.dataset.count("frames.ground_truth.detections")
        num_tagged = self.dataset.count_label_tags()["test"]

        self.dataset.delete_labels(tags="test")

        num_labels_after = self.dataset.count("frames.ground_truth.detections")

        self.assertEqual(num_labels_after, num_labels - num_tagged)

    def test_delete_video_detections_view(self):
        self._setUp_video_detections()

        ids = [
            self.dataset.first().frames[1].ground_truth.detections[0].id,
            self.dataset.last().frames[3].ground_truth.detections[-1].id,
        ]

        view = self.dataset.select_labels(ids=ids)

        num_labels = self.dataset.count("frames.ground_truth.detections")
        num_view = view.count("frames.ground_truth.detections")

        self.dataset.delete_labels(view=view)

        num_labels_after = self.dataset.count("frames.ground_truth.detections")

        self.assertEqual(num_labels_after, num_labels - num_view)

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

        self.dataset.delete_labels(labels=labels)

        num_labels_after = self.dataset.count("frames.ground_truth.detections")

        self.assertEqual(num_labels_after, num_labels - num_selected)


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
