"""
FiftyOne view-related unit tests.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from copy import deepcopy
from datetime import date, datetime, timedelta
import math

from bson import ObjectId
import unittest
import numpy as np

import fiftyone as fo
from fiftyone import ViewField as F, VALUE
import fiftyone.core.sample as fos
import fiftyone.core.stages as fosg

from decorators import drop_datasets, skip_windows


class DatasetViewTests(unittest.TestCase):
    @drop_datasets
    def test_iter_samples(self):
        dataset = fo.Dataset()
        dataset.add_samples(
            [fo.Sample(filepath="image%d.jpg" % i) for i in range(51)]
        )

        first_sample = dataset.first()
        view = dataset.limit(50)

        for idx, sample in enumerate(view):
            sample["int"] = idx + 1
            sample.save()

        self.assertTupleEqual(dataset.bounds("int"), (1, 50))
        self.assertEqual(first_sample.int, 1)

        for idx, sample in enumerate(view.iter_samples(progress=True)):
            sample["int"] = idx + 2
            sample.save()

        self.assertTupleEqual(dataset.bounds("int"), (2, 51))
        self.assertEqual(first_sample.int, 2)

        for idx, sample in enumerate(view.iter_samples(autosave=True)):
            sample["int"] = idx + 3

        self.assertTupleEqual(dataset.bounds("int"), (3, 52))
        self.assertEqual(first_sample.int, 3)

        with view.save_context() as context:
            for idx, sample in enumerate(view):
                sample["int"] = idx + 4
                context.save(sample)

        self.assertTupleEqual(dataset.bounds("int"), (4, 53))
        self.assertEqual(first_sample.int, 4)

    @drop_datasets
    def test_view(self):
        dataset = fo.Dataset()
        dataset.add_sample_field(
            "labels",
            fo.EmbeddedDocumentField,
            embedded_doc_type=fo.Classification,
        )

        sample = fo.Sample(
            "1.jpg", tags=["train"], labels=fo.Classification(label="label1")
        )
        dataset.add_sample(sample)

        sample = fo.Sample(
            "2.jpg", tags=["test"], labels=fo.Classification(label="label2")
        )
        dataset.add_sample(sample)

        view = dataset.view()

        self.assertEqual(len(view), len(dataset))
        self.assertIsInstance(view.first(), fos.SampleView)

        # tags
        for sample in view.match({"tags": "train"}):
            self.assertIn("train", sample.tags)

        for sample in view.match({"tags": "test"}):
            self.assertIn("test", sample.tags)

        # labels
        for sample in view.match({"labels.label": "label1"}):
            self.assertEqual(sample.labels.label, "label1")

    @drop_datasets
    def test_sample_view_with_filtered_fields(self):
        dataset = fo.Dataset()

        dataset.add_sample(
            fo.Sample(
                filepath="filepath1.jpg",
                tags=["test"],
                test_dets=fo.Detections(
                    detections=[
                        fo.Detection(
                            label="friend",
                            confidence=0.9,
                            bounding_box=[0, 0, 0.5, 0.5],
                        ),
                        fo.Detection(
                            label="friend",
                            confidence=0.3,
                            bounding_box=[0.25, 0, 0.5, 0.1],
                        ),
                        fo.Detection(
                            label="stopper",
                            confidence=0.1,
                            bounding_box=[0, 0, 0.5, 0.5],
                        ),
                        fo.Detection(
                            label="big bro",
                            confidence=0.6,
                            bounding_box=[0, 0, 0.1, 0.5],
                        ),
                    ]
                ),
                another_field=51,
            )
        )

        view = (
            dataset.view()
            .exclude_fields(["another_field"])
            .filter_labels("test_dets", F("confidence") > 0.5)
        )

        # modify element
        sample_view = view.first()
        sample_view.test_dets.detections[1].label = "MODIFIED"
        sample_view.save()
        # check that correct element is modified
        detections = dataset[sample_view.id].test_dets.detections
        self.assertEqual(detections[1].label, "friend")
        self.assertEqual(detections[-1].label, "MODIFIED")

        # complex modify
        sample_view = view.first()
        sample_view.test_dets.detections[0].label = "COMPLEX"
        sample_view.test_dets.detections[1].confidence = 0.51
        sample_view.save()

        # check that correct elements are modified
        detections = dataset[sample_view.id].test_dets.detections
        self.assertEqual(detections[0].label, "COMPLEX")
        self.assertEqual(detections[-1].confidence, 0.51)

        # add element
        with self.assertRaises(ValueError):
            sample_view = view.first()
            sample_view.test_dets.detections.append(
                fo.Detection(label="NEW DET")
            )
            sample_view.save()

        # remove element
        with self.assertRaises(ValueError):
            sample_view = view.first()
            sample_view.test_dets.detections.pop()
            sample_view.save()

        # remove all elements
        with self.assertRaises(ValueError):
            sample_view = view.first()
            sample_view.test_dets.detections.pop()
            sample_view.test_dets.detections.pop()
            sample_view.save()

        # replace element
        with self.assertRaises(ValueError):
            sample_view = view.first()
            sample_view.test_dets.detections[1] = fo.Detection()
            sample_view.save()

        # overwrite Detections.detections
        with self.assertRaises(ValueError):
            sample_view = view.first()
            sample_view.test_dets.detections = []
            sample_view.save()

        # overwrite Detections
        sample_view = view.first()
        sample_view.test_dets = fo.Detections()
        sample_view.save()
        detections = dataset[sample_view.id].test_dets.detections
        self.assertListEqual(detections, [])

    @drop_datasets
    def test_view_ids(self):
        sample = fo.Sample(filepath="image.jpg")

        self.assertIsNone(sample.id, str)
        self.assertIsNone(sample._id, ObjectId)

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        self.assertIsInstance(sample.id, str)
        self.assertIsInstance(sample._id, ObjectId)

        view = dataset.select_fields()
        sample_view = view.first()

        self.assertIsInstance(sample_view.id, str)
        self.assertIsInstance(sample_view._id, ObjectId)

    @drop_datasets
    def test_view_ids_video(self):
        sample = fo.Sample(filepath="video.mp4")
        frame = fo.Frame()
        sample.frames[1] = frame

        self.assertIsNone(sample.id, str)
        self.assertIsNone(sample._id, ObjectId)
        self.assertIsNone(frame.id, str)
        self.assertIsNone(frame._id, ObjectId)
        self.assertIsNone(frame.sample_id, str)
        self.assertIsNone(frame._sample_id, ObjectId)

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        self.assertIsInstance(sample.id, str)
        self.assertIsInstance(sample._id, ObjectId)
        self.assertIsInstance(frame.id, str)
        self.assertIsInstance(frame._id, ObjectId)
        self.assertIsInstance(frame.sample_id, str)
        self.assertIsInstance(frame._sample_id, ObjectId)

        view = dataset.select_fields()
        sample_view = view.first()
        frame_view = sample_view.frames.first()

        self.assertIsInstance(sample_view.id, str)
        self.assertIsInstance(sample_view._id, ObjectId)
        self.assertIsInstance(frame_view.id, str)
        self.assertIsInstance(frame_view._id, ObjectId)
        self.assertIsInstance(frame_view.sample_id, str)
        self.assertIsInstance(frame_view._sample_id, ObjectId)


class ViewFieldTests(unittest.TestCase):
    @skip_windows  # TODO: don't skip on Windows
    @drop_datasets
    def test_clone_fields(self):
        dataset = fo.Dataset()
        sample1 = fo.Sample(
            filepath="image1.jpg",
            predictions=fo.Classification(label="friend", field=1),
        )
        sample2 = fo.Sample(
            filepath="image2.jpg",
            predictions=fo.Classification(label="enemy", field=2),
        )
        dataset.add_samples([sample1, sample2])

        dataset[1:].clone_sample_field(
            "predictions.field", "predictions.new_field"
        )
        self.assertIsNotNone(sample2.predictions.new_field)
        with self.assertRaises(AttributeError):
            sample1.predictions.new_field

        dataset[:1].clear_sample_field("predictions.field")
        self.assertIsNone(sample1.predictions.field)
        self.assertIsNotNone(sample2.predictions.field)

    @skip_windows  # TODO: don't skip on Windows
    @drop_datasets
    def test_clone_fields_array(self):
        dataset = fo.Dataset()
        sample1 = fo.Sample(
            filepath="image1.jpg",
            predictions=fo.Detections(
                detections=[
                    fo.Detection(label="high", confidence=0.9, field=1),
                    fo.Detection(label="high", confidence=0.6, field=2),
                    fo.Detection(label="low", confidence=0.3, field=3),
                    fo.Detection(label="low", confidence=0.1, field=4),
                ]
            ),
        )
        sample2 = fo.Sample(
            filepath="image2.jpg",
            predictions=fo.Detections(
                detections=[
                    fo.Detection(label="high", confidence=1.0, field=1),
                    fo.Detection(label="high", confidence=0.8, field=2),
                    fo.Detection(label="low", confidence=0.2, field=3),
                ]
            ),
        )
        dataset.add_samples([sample1, sample2])

        dataset[:1].clear_sample_field("predictions.detections.field")
        self.assertIsNone(sample1.predictions.detections[0].field)
        self.assertIsNotNone(sample2.predictions.detections[0].field)

        dataset[1:].clone_sample_field(
            "predictions.detections.field", "predictions.detections.new_field"
        )
        self.assertIsNotNone(sample2.predictions.detections[0].new_field)
        with self.assertRaises(AttributeError):
            sample1.predictions.detections[0].new_field

        dataset.delete_sample_field("predictions.detections.field")
        dataset.delete_sample_field("predictions.detections.new_field")
        with self.assertRaises(AttributeError):
            sample1.predictions.detections[0].field

        low_conf_view = dataset.filter_labels(
            "predictions", F("confidence") < 0.5
        )
        low_conf_view.clone_sample_field("predictions", "low_conf")
        high_conf_view = dataset.filter_labels(
            "predictions", F("confidence") > 0.5
        )
        high_conf_view.clone_sample_field("predictions", "high_conf")
        schema = dataset.get_field_schema()
        self.assertIn("low_conf", schema)
        self.assertIn("high_conf", schema)
        self.assertTrue(sample1.has_field("low_conf"))
        self.assertTrue(sample1.has_field("high_conf"))
        self.assertEqual(len(sample1["low_conf"].detections), 2)
        self.assertEqual(len(sample1["high_conf"].detections), 2)

        dataset2 = (
            high_conf_view.exclude_fields(["low_conf", "high_conf"])
            .limit(1)
            .clone()
        )
        sample21 = dataset2.first()
        schema2 = dataset2.get_field_schema()
        self.assertTrue(len(dataset2), 1)
        self.assertNotIn("low_conf", schema2)
        self.assertNotIn("high_conf", schema2)
        self.assertFalse(sample21.has_field("low_conf"))
        self.assertFalse(sample21.has_field("high_conf"))
        self.assertEqual(len(sample21["predictions"].detections), 2)

        dataset[1:].clear_sample_field("low_conf")
        dataset[1:].clear_sample_field("high_conf")
        self.assertIsNotNone(sample1["low_conf"])
        self.assertIsNotNone(sample1["high_conf"])
        self.assertIsNone(sample2["low_conf"])
        self.assertIsNone(sample2["high_conf"])


class ViewExpressionTests(unittest.TestCase):
    @drop_datasets
    def test_comparison(self):
        dataset = fo.Dataset()

        dataset.add_samples(
            [
                fo.Sample(filepath="filepath1.jpg", my_int=5),
                fo.Sample(filepath="filepath2.jpg", my_int=7),
                fo.Sample(filepath="filepath3.jpg", my_int=1),
                fo.Sample(filepath="filepath4.jpg", my_int=9),
            ]
        )

        field = "my_int"
        value = 5
        values = [1, 5]

        dataset_values = [s[field] for s in dataset]

        # test `==`
        filtered_values = [v for v in dataset_values if v == value]
        view = dataset.match(F(field) == value)
        view_values = [s[field] for s in view]
        self.assertListEqual(view_values, filtered_values)

        # test `!=`
        filtered_values = [v for v in dataset_values if v != value]
        view = dataset.match(F(field) != value)
        view_values = [s[field] for s in view]
        self.assertListEqual(view_values, filtered_values)

        # test `>`
        filtered_values = [v for v in dataset_values if v > value]
        view = dataset.match(F(field) > value)
        view_values = [s[field] for s in view]
        self.assertListEqual(view_values, filtered_values)

        # test `>=`
        filtered_values = [v for v in dataset_values if v >= value]
        view = dataset.match(F(field) >= value)
        view_values = [s[field] for s in view]
        self.assertListEqual(view_values, filtered_values)

        # test `<`
        filtered_values = [v for v in dataset_values if v < value]
        view = dataset.match(F(field) < value)
        view_values = [s[field] for s in view]
        self.assertListEqual(view_values, filtered_values)

        # test `<=`
        filtered_values = [v for v in dataset_values if v <= value]
        view = dataset.match(F(field) <= value)
        view_values = [s[field] for s in view]
        self.assertListEqual(view_values, filtered_values)

        # test `is_in`
        view = dataset.match(F(field).is_in(values))
        for sample in view:
            self.assertIn(sample[field], values)

        # test `NOT is_in`
        view = dataset.match(~(F(field).is_in(values)))
        for sample in view:
            self.assertNotIn(sample[field], values)

    @drop_datasets
    def test_logic(self):
        dataset = fo.Dataset()

        dataset.add_samples(
            [
                fo.Sample(filepath="filepath1.jpg", my_int=5),
                fo.Sample(filepath="filepath2.jpg", my_int=7),
                fo.Sample(filepath="filepath3.jpg", my_int=1),
                fo.Sample(filepath="filepath4.jpg", my_int=9),
            ]
        )

        field = "my_int"
        value = 5

        # test logical not
        view = dataset.match(~(F(field) == value))
        for sample in view:
            self.assertNotEqual(sample[field], value)

        # test logical and
        bounds = [3, 6]
        view = dataset.match((F(field) > bounds[0]) & (F(field) < bounds[1]))
        for sample in view:
            self.assertGreater(sample[field], bounds[0])
            self.assertLess(sample[field], bounds[1])

        # test logical or
        view = dataset.match((F(field) < bounds[0]) | (F(field) > bounds[1]))
        for sample in view:
            my_int = sample[field]
            self.assertTrue(my_int < bounds[0] or my_int > bounds[1])

    @drop_datasets
    def test_arithmetic(self):
        dataset = fo.Dataset()

        dataset.add_samples(
            [
                fo.Sample(filepath="filepath1.jpg", my_int=5, my_float=0.51),
                fo.Sample(
                    filepath="filepath2.jpg", my_int=-6, my_float=-0.965
                ),
            ]
        )

        # test __abs__
        manual_ids = [
            sample.id for sample in dataset if abs(sample.my_int) == 6
        ]
        view = dataset.match(abs(F("my_int")) == 6)
        self.assertListEqual([sample.id for sample in view], manual_ids)

        # test __add__
        manual_ids = [
            sample.id for sample in dataset if sample.my_int + 0.5 == -5.5
        ]
        view = dataset.match(F("my_int") + 0.5 == -5.5)
        self.assertListEqual([sample.id for sample in view], manual_ids)

        # test __ceil__
        manual_ids = [
            sample.id for sample in dataset if math.ceil(sample.my_float) == 1
        ]
        view = dataset.match(math.ceil(F("my_float")) == 1)
        self.assertListEqual([sample.id for sample in view], manual_ids)

        # test __floor__
        manual_ids = [
            sample.id
            for sample in dataset
            if math.floor(sample.my_float) == -1
        ]
        view = dataset.match(math.floor(F("my_float")) == -1)
        self.assertListEqual([sample.id for sample in view], manual_ids)

        # test __round__
        manual_ids = [
            sample.id for sample in dataset if round(sample.my_float) == -1
        ]
        view = dataset.match(round(F("my_float")) == -1)
        self.assertListEqual([sample.id for sample in view], manual_ids)

    @drop_datasets
    def test_array(self):
        dataset = fo.Dataset()

        dataset.add_samples(
            [
                fo.Sample(
                    filepath="filepath1.jpg",
                    tags=["train"],
                    my_int=5,
                    my_list=["a", "b"],
                    my_int_list=list(range(8)),
                ),
                fo.Sample(
                    filepath="filepath2.jpg",
                    tags=["train"],
                    my_int=6,
                    my_list=["b", "c"],
                    my_int_list=list(range(10)),
                ),
                fo.Sample(
                    filepath="filepath3.jpg",
                    tags=["test"],
                    my_int=7,
                    my_list=["c", "d"],
                    my_int_list=list(range(10)),
                ),
            ]
        )

        # test contains
        tag = "train"
        manual_ids = [sample.id for sample in dataset if tag in sample.tags]
        view = dataset.match(F("tags").contains(tag))
        self.assertListEqual([sample.id for sample in view], manual_ids)

        # test is_in
        my_ints = [6, 7, 8]
        manual_ids = [
            sample.id for sample in dataset if sample.my_int in my_ints
        ]
        view = dataset.match(F("my_int").is_in(my_ints))
        self.assertListEqual([sample.id for sample in view], manual_ids)

        # test __getitem__ integer index
        idx = 1
        value = "c"
        manual_ids = [
            sample.id for sample in dataset if sample.my_list[idx] == value
        ]
        view = dataset.match(F("my_list")[idx] == value)
        self.assertListEqual([sample.id for sample in view], manual_ids)

        # test __getitem__ expression index
        manual_index = [
            sample.my_int_list[sample.my_int] for sample in dataset
        ]
        index = dataset.values(F("my_int_list")[F("my_int")])
        self.assertListEqual(index, manual_index)

        # test __getitem__ slice to stop
        manual_slices = [
            sample.my_int_list[: sample.my_int] for sample in dataset
        ]
        slices = dataset.values(F("my_int_list")[: F("my_int")])
        self.assertListEqual(slices, manual_slices)

        # test __getitem__ slice from start
        manual_slices = [
            sample.my_int_list[sample.my_int :] for sample in dataset
        ]
        slices = dataset.values(F("my_int_list")[F("my_int") :])
        self.assertListEqual(slices, manual_slices)

        # test __getitem__ slice start to stop
        manual_slices = [
            sample.my_int_list[sample.my_int - 1 : sample.my_int]
            for sample in dataset
        ]
        slices = dataset.values(
            F("my_int_list")[F("my_int") - 1 : F("my_int")]
        )
        self.assertListEqual(slices, manual_slices)

    @drop_datasets
    def test_str(self):
        special_chars = r"[]{}()*+-?.,\\^$|#"

        self.dataset = fo.Dataset()

        self.dataset.add_samples(
            [
                fo.Sample(filepath="test1.jpg", test="test1.jpg"),
                fo.Sample(filepath="test2.jpg", test="test2.jpg"),
                fo.Sample(
                    filepath="test3.jpg",
                    test="test3.jpg",
                    special_chars=special_chars,
                ),
            ]
        )

        # test starts_with
        self.assertEqual(
            len(self.dataset.match(F("test").starts_with("test"))), 3
        )
        self.assertEqual(
            len(self.dataset.match(F("test").starts_with("TEST"))), 0
        )
        self.assertEqual(
            len(
                self.dataset.match(
                    F("test").starts_with("TEST", case_sensitive=False)
                )
            ),
            3,
        )

        # test ends_with
        self.assertEqual(
            len(self.dataset.match(F("test").ends_with("1.jpg"))), 1
        )
        self.assertEqual(
            len(self.dataset.match(F("test").ends_with("1.JPG"))), 0
        )
        self.assertEqual(
            len(
                self.dataset.match(
                    F("test").ends_with("1.JPG", case_sensitive=False)
                )
            ),
            1,
        )

        # test contains_str
        self.assertEqual(
            len(self.dataset.match(F("test").contains_str("1.j"))), 1
        )
        self.assertEqual(
            len(self.dataset.match(F("test").contains_str("1.J"))), 0
        )
        self.assertEqual(
            len(
                self.dataset.match(
                    F("test").contains_str("1.J", case_sensitive=False)
                )
            ),
            1,
        )

        # test matches_str
        self.assertEqual(
            len(self.dataset.match(F("test").matches_str("test1.jpg"))), 1
        )
        self.assertEqual(
            len(self.dataset.match(F("test").matches_str("TEST1.JPG"))), 0
        )
        self.assertEqual(
            len(
                self.dataset.match(
                    F("test").matches_str("TEST1.JPG", case_sensitive=False)
                )
            ),
            1,
        )

        # test escaping
        self.assertEqual(
            len(
                self.dataset.match(
                    F("special_chars").matches_str(special_chars)
                )
            ),
            1,
        )

    @drop_datasets
    def test_dates(self):
        dataset = fo.Dataset()

        date1 = date(1970, 1, 2)
        date2 = date(1970, 1, 3)
        date3 = date(1970, 1, 4)

        query_date = datetime(1970, 1, 3, 1, 0, 0)
        query_delta = timedelta(hours=2)

        dataset.add_samples(
            [
                fo.Sample(filepath="image1.png", date=date1),
                fo.Sample(filepath="image2.png", date=date2),
                fo.Sample(filepath="image3.png", date=date3),
            ]
        )

        fo.config.timezone = None
        dataset.reload()

        dates = dataset.values("date")
        self.assertListEqual(dates, [date1, date2, date3])

        min_date, max_date = dataset.bounds("date")
        self.assertEqual(min_date, date1)
        self.assertEqual(max_date, date3)

        view = dataset.match(F("date") > query_date)
        self.assertEqual(len(view), 1)
        self.assertEqual(view.first().date, date3)

        view = dataset.match(abs(F("date") - query_date) < query_delta)
        self.assertEqual(len(view), 1)
        self.assertEqual(view.first().date, date2)

    @drop_datasets
    def test_datetimes(self):
        dataset = fo.Dataset()

        date1 = datetime(1970, 1, 1, 2, 0, 0)
        date2 = datetime(1970, 1, 1, 3, 0, 0)
        date3 = datetime(1970, 1, 1, 4, 0, 0)

        query_date = datetime(1970, 1, 1, 3, 1, 0)
        query_delta = timedelta(minutes=30)

        dataset.add_samples(
            [
                fo.Sample(filepath="image1.png", date=date1),
                fo.Sample(filepath="image2.png", date=date2),
                fo.Sample(filepath="image3.png", date=date3),
            ]
        )

        fo.config.timezone = None
        dataset.reload()

        dates = dataset.values("date")
        self.assertListEqual(dates, [date1, date2, date3])

        min_date, max_date = dataset.bounds("date")
        self.assertEqual(min_date, date1)
        self.assertEqual(max_date, date3)

        view = dataset.match(F("date") > query_date)
        self.assertEqual(len(view), 1)
        self.assertEqual(view.first().date, date3)

        view = dataset.match(abs(F("date") - query_date) < query_delta)
        self.assertEqual(len(view), 1)
        self.assertEqual(view.first().date, date2)


class SliceTests(unittest.TestCase):
    @drop_datasets
    def test_slice(self):
        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample("1.jpg", tags=["tag1"]),
                fo.Sample("2.jpg", tags=["tag1", "tag2"]),
                fo.Sample("3.jpg", tags=["tag2", "tag3"]),
            ]
        )

        view = dataset[0:2]
        self.assertEqual(len(view), 2)

        view = dataset[1:3]
        self.assertEqual(len(view), 2)

        view = dataset[0:0]
        self.assertEqual(len(view), 0)

        view = dataset[3:3]
        self.assertEqual(len(view), 0)


class SetValuesTests(unittest.TestCase):
    @drop_datasets
    def setUp(self):
        self.dataset = fo.Dataset()
        self.dataset.add_samples(
            [
                fo.Sample(filepath="test1.png", int_field=1),
                fo.Sample(filepath="test2.png", int_field=2),
                fo.Sample(filepath="test3.png", int_field=3),
                fo.Sample(filepath="test4.png", int_field=4),
            ]
        )

    def test_set_values_dict(self):
        values = {1: "1", 3: "3"}
        self.dataset.set_values("str_field", values, key_field="int_field")
        view = self.dataset.exists("str_field")
        values2 = {
            k: v for k, v in zip(*view.values(["int_field", "str_field"]))
        }
        self.assertDictEqual(values, values2)

        # Non-existent keys should raise an error
        values[0] = "0"
        with self.assertRaises(ValueError):
            self.dataset.set_values("str_field", values, key_field="int_field")

    def test_set_values_frames_dicts(self):
        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(filepath="video1.mp4"),
                fo.Sample(filepath="video2.mp4"),
                fo.Sample(filepath="video3.mp4"),
            ]
        )

        filepaths = dataset.values("filepath")

        values = {
            filepaths[0]: {2: 3, 4: 5},
            filepaths[1]: {3: 4, 5: 6, 7: 8},
            filepaths[2]: {4: 5},
        }

        dataset.set_values("frames.int_field", values, key_field="filepath")

        frame_numbers = dataset.values("frames.frame_number", unwind=True)
        self.assertListEqual(frame_numbers, [2, 4, 3, 5, 7, 4])

        int_fields = dataset.values("frames.int_field", unwind=True)
        self.assertListEqual(int_fields, [3, 5, 4, 6, 8, 5])

        values = {
            filepaths[0]: {2: -1, 3: 4, 4: -1},
            filepaths[2]: {1: 2, 4: -1, 5: 6},
        }

        dataset.set_values("frames.int_field", values, key_field="filepath")

        frame_numbers = dataset.values("frames.frame_number", unwind=True)
        self.assertListEqual(frame_numbers, [2, 3, 4, 3, 5, 7, 1, 4, 5])

        int_fields = dataset.values("frames.int_field", unwind=True)
        self.assertListEqual(int_fields, [-1, 4, -1, 4, 6, 8, 2, -1, 6])

        values = {
            filepaths[0]: {1: fo.Classification(label="cat")},
            filepaths[1]: {
                1: fo.Classification(label="cat"),
                2: fo.Classification(label="dog"),
            },
            filepaths[2]: {
                1: fo.Classification(label="cat"),
                2: fo.Classification(label="dog"),
                3: fo.Classification(label="rabbit"),
            },
        }

        dataset.set_values(
            "frames.classification_field",
            values,
            key_field="filepath",
        )

        labels = dataset.values("frames.classification_field.label")
        self.assertListEqual(labels[0][:1], ["cat"])
        self.assertListEqual(labels[1][:2], ["cat", "dog"])
        self.assertListEqual(labels[2][:3], ["cat", "dog", "rabbit"])

    def test_set_values_dataset(self):
        n = len(self.dataset)

        int_values = [int(i) for i in range(n)]
        float_values = [float(i) for i in range(n)]
        str_values = [str(i) for i in range(n)]
        classification_values = [
            fo.Classification(label=str(i), custom=float(i)) for i in range(n)
        ]
        classifications_values = [
            fo.Classifications(
                classifications=[
                    fo.Classification(
                        label=str(j),
                        logits=np.random.randn(5),
                        custom=float(j),
                    )
                    for j in range(i)
                ]
            )
            for i in range(n)
        ]
        detections_values = [
            fo.Detections(
                detections=[
                    fo.Detection(
                        label=str(j),
                        bounding_box=list(np.random.rand(4)),
                        custom=float(j),
                    )
                    for j in range(i)
                ]
            )
            for i in range(n)
        ]

        # Set existing field
        self.dataset.set_values("int_field", int_values)
        _int_values = self.dataset.values("int_field")
        self.assertListEqual(_int_values, int_values)

        # Test no schema expanding
        with self.assertRaises(ValueError):
            self.dataset.set_values(
                "float_field", float_values, expand_schema=False
            )

        # Set new primitive field
        self.dataset.set_values("str_field", str_values)
        schema = self.dataset.get_field_schema()
        self.assertIn("str_field", schema)
        _str_values = self.dataset.values("str_field")
        self.assertListEqual(_str_values, str_values)

        # Set new Classification field

        self.dataset.set_values("classification_field", classification_values)

        schema = self.dataset.get_field_schema()
        self.assertIn("classification_field", schema)

        _classification_values = self.dataset.values("classification_field")
        self.assertListEqual(_classification_values, classification_values)

        _label_values = self.dataset.values("classification_field.label")
        self.assertEqual(type(_label_values), list)
        self.assertEqual(type(_label_values[-1]), str)

        _custom_values = self.dataset.values("classification_field.custom")
        self.assertEqual(type(_custom_values), list)
        self.assertEqual(type(_custom_values[-1]), float)

        # Set new Classifications field

        self.dataset.set_values(
            "classifications_field", classifications_values
        )

        schema = self.dataset.get_field_schema()
        self.assertIn("classifications_field", schema)

        _classifications_values = self.dataset.values("classifications_field")
        self.assertListEqual(_classifications_values, classifications_values)

        _label_list_values = self.dataset.values(
            "classifications_field.classifications"
        )
        self.assertEqual(type(_label_list_values), list)
        self.assertEqual(type(_label_list_values[-1]), list)
        self.assertEqual(type(_label_list_values[-1][0]), fo.Classification)

        _label_values = self.dataset.values(
            "classifications_field.classifications.label"
        )
        self.assertEqual(type(_label_values), list)
        self.assertEqual(type(_label_values[-1]), list)
        self.assertEqual(type(_label_values[-1][0]), str)

        _logits_values = self.dataset.values(
            "classifications_field.classifications.logits"
        )
        self.assertEqual(type(_logits_values), list)
        self.assertEqual(type(_logits_values[-1]), list)
        self.assertEqual(type(_logits_values[-1][0]), np.ndarray)

        _custom_values = self.dataset.values(
            "classifications_field.classifications.custom"
        )
        self.assertEqual(type(_custom_values), list)
        self.assertEqual(type(_custom_values[-1]), list)
        self.assertEqual(type(_custom_values[-1][0]), float)

        # Set new Detections field

        self.dataset.set_values("detections_field", detections_values)

        schema = self.dataset.get_field_schema()
        self.assertIn("detections_field", schema)

        _detections_values = self.dataset.values("detections_field")
        self.assertListEqual(_detections_values, detections_values)

        _label_list_values = self.dataset.values("detections_field.detections")
        self.assertEqual(type(_label_list_values), list)
        self.assertEqual(type(_label_list_values[-1]), list)
        self.assertEqual(type(_label_list_values[-1][0]), fo.Detection)

        _label_values = self.dataset.values(
            "detections_field.detections.label"
        )
        self.assertEqual(type(_label_values), list)
        self.assertEqual(type(_label_values[-1]), list)
        self.assertEqual(type(_label_values[-1][0]), str)

        _bbox_values = self.dataset.values(
            "detections_field.detections.bounding_box"
        )
        self.assertEqual(type(_bbox_values), list)
        self.assertEqual(type(_bbox_values[-1]), list)
        self.assertEqual(type(_bbox_values[-1][0]), list)

        _custom_values = self.dataset.values(
            "detections_field.detections.custom"
        )
        self.assertEqual(type(_custom_values), list)
        self.assertEqual(type(_custom_values[-1]), list)
        self.assertEqual(type(_custom_values[-1][0]), float)

    def test_set_values_view(self):
        n = len(self.dataset)

        classification_values = [
            fo.Classification(label=str(i)) for i in range(n)
        ]
        detections_values = [
            fo.Detections(
                detections=[
                    fo.Detection(
                        label=str(j), bounding_box=list(np.random.rand(4))
                    )
                    for j in range(i)
                ]
            )
            for i in range(n)
        ]

        self.dataset.set_values("classification", classification_values)
        self.dataset.set_values("detections", detections_values)

        # Set existing field
        view = self.dataset.skip(1).limit(2)
        view.set_values("int_field", [0, 0])
        _int_values = self.dataset.values("int_field")
        self.assertListEqual(_int_values, [1, 0, 0, 4])

        # Set new field
        view = self.dataset.skip(1).limit(2)
        view.set_values("str_field", ["hello", "world"])
        _str_values = self.dataset.values("str_field")
        self.assertListEqual(_str_values, [None, "hello", "world", None])

        #
        # Set filtered label field
        #

        view = self.dataset.filter_labels("classification", F("label") == "1")

        # Primitive field
        view.set_values("classification.custom", ["hello"])
        _custom_values = self.dataset.values("classification.custom")
        self.assertListEqual(_custom_values, [None, "hello", None, None])

        # Label field

        labels = view.values("classification")
        for label in labels:
            label.label = "ONE"

        view.set_values("classification", labels)

        _dataset_labels = self.dataset.values("classification.label")
        self.assertListEqual(_dataset_labels, ["0", "ONE", "2", "3"])

        #
        # Set filtered label list fields
        #

        view = self.dataset.filter_labels("detections", F("label") == "1")

        # Primitive field
        view.set_values("detections.detections.custom", [["hello"], ["hello"]])
        _custom_values = self.dataset.values("detections.detections.custom")
        self.assertListEqual(
            _custom_values,
            [[], [None], [None, "hello"], [None, "hello", None]],
        )

        # Label list field

        dets = view.values("detections.detections")
        for _dets in dets:
            for det in _dets:
                det.label = "ONE"

        view.set_values("detections.detections", dets)

        _dataset_labels = self.dataset.values("detections.detections.label")
        self.assertListEqual(
            _dataset_labels,
            [[], ["0"], ["0", "ONE"], ["0", "ONE", "2"]],
        )


class ViewSaveTest(unittest.TestCase):
    @drop_datasets
    def setUp(self):
        self.dataset = fo.Dataset()
        self.dataset.add_samples(
            [
                fo.Sample(
                    filepath="test1.png",
                    int_field=1,
                    classifications=fo.Classifications(
                        classifications=[fo.Classification(label="cat")]
                    ),
                ),
                fo.Sample(
                    filepath="test2.png",
                    int_field=2,
                    classifications=fo.Classifications(
                        classifications=[
                            fo.Classification(label="cat"),
                            fo.Classification(label="dog"),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="test3.png",
                    int_field=3,
                    classifications=fo.Classifications(
                        classifications=[
                            fo.Classification(label="rabbit"),
                            fo.Classification(label="squirrel"),
                            fo.Classification(label="frog"),
                        ]
                    ),
                ),
                fo.Sample(filepath="test4.png"),
            ]
        )

    def test_view_save(self):
        view = self.dataset.limit(2).set_field("int_field", F("int_field") + 1)
        view.save()

        self.assertListEqual(self.dataset.values("int_field"), [2, 3, 3, None])

        view = self.dataset.filter_labels(
            "classifications", F("label") == "cat", only_matches=False
        ).set_field("int_field", None)
        view.save(fields="classifications")

        self.assertEqual(len(self.dataset), 4)
        self.assertListEqual(
            self.dataset.distinct("classifications.classifications.label"),
            ["cat"],
        )
        self.assertEqual(len(self.dataset.exists("int_field")), 3)

        view.save()
        self.assertEqual(len(self.dataset), 4)
        self.assertEqual(len(self.dataset.exists("int_field")), 0)

    def test_view_keep(self):
        view = self.dataset.limit(3)
        view.keep()

        self.assertEqual(len(self.dataset), 3)
        self.assertEqual(len(self.dataset.exists("int_field")), 3)

        view = self.dataset.filter_labels(
            "classifications", F("label") == "cat"
        )
        view.keep()

        self.assertListEqual(
            self.dataset.values("classifications.classifications.label"),
            [["cat"], ["cat", "dog"]],
        )

    def test_view_keep_frames(self):
        sample1 = fo.Sample(filepath="video1.mp4")
        frame11 = fo.Frame()
        frame12 = fo.Frame()

        sample1.frames[1] = frame11
        sample1.frames[2] = frame12

        sample2 = fo.Sample(filepath="video2.mp4")
        frame21 = fo.Frame()
        frame22 = fo.Frame()

        sample2.frames[1] = frame21
        sample2.frames[2] = frame22

        dataset = fo.Dataset()
        dataset.add_samples([sample1, sample2])

        view = dataset.limit(1).match_frames(F("frame_number") == 1)

        self.assertEqual(dataset.count("frames"), 4)
        self.assertEqual(view.count("frames"), 1)

        view.keep_frames()

        self.assertEqual(dataset.count("frames"), 3)
        self.assertEqual(view.count("frames"), 1)
        self.assertListEqual(
            dataset.values("frames.frame_number", unwind=True), [1, 1, 2]
        )
        self.assertIsNone(frame12.id)
        self.assertIsNotNone(frame22.id)

    def test_view_keep_fields(self):
        dataset = self.dataset

        view = dataset.exclude_fields("classifications")
        view.keep_fields()

        self.assertNotIn("classifications", view.get_field_schema())
        self.assertNotIn("classifications", dataset.get_field_schema())

        sample_view = view.first()
        with self.assertRaises(KeyError):
            sample_view["classifications"]

        sample = dataset.first()
        with self.assertRaises(KeyError):
            sample["classifications"]

        view = dataset.select_fields()
        view.keep_fields()

        self.assertNotIn("int_field", view.get_field_schema())
        self.assertNotIn("int_field", dataset.get_field_schema())

        sample_view = view.first()
        with self.assertRaises(KeyError):
            sample_view["int_field"]

        sample = dataset.first()
        with self.assertRaises(KeyError):
            sample["int_field"]


class ViewStageTests(unittest.TestCase):
    @drop_datasets
    def setUp(self):
        self.dataset = fo.Dataset()
        self.sample1 = fo.Sample(filepath="test_one.png")
        self.sample2 = fo.Sample(filepath="test_two.png")
        self.dataset.add_sample(self.sample1)
        self.dataset.add_sample(self.sample2)

    def _setUp_classification(self):
        self.sample1["test_clf"] = fo.Classification(
            label="friend", confidence=0.9
        )
        self.sample1.save()
        self.sample2["test_clf"] = fo.Classification(
            label="enemy", confidence=0.99
        )
        self.sample2.save()

    def _setUp_classifications(self):
        self.sample1["test_clfs"] = fo.Classifications(
            classifications=[
                fo.Classification(label="friend", confidence=0.9),
                fo.Classification(label="friend", confidence=0.3),
                fo.Classification(label="stopper", confidence=0.1),
                fo.Classification(label="big bro", confidence=0.6),
            ]
        )
        self.sample1.save()
        self.sample2["test_clfs"] = fo.Classifications(
            classifications=[
                fo.Classification(label="friend", confidence=0.99),
                fo.Classification(label="tricam", confidence=0.2),
                fo.Classification(label="hex", confidence=0.8),
            ]
        )
        self.sample2.save()

    def _setUp_detection(self):
        self.sample1["test_det"] = fo.Detection(
            label="friend",
            confidence=0.9,
            bounding_box=[0, 0, 0.5, 0.5],
        )
        self.sample1.save()
        self.sample2["test_det"] = fo.Detection(
            label="hex",
            confidence=0.8,
            bounding_box=[0.35, 0, 0.2, 0.25],
        )
        self.sample2.save()

    def _setUp_detections(self):
        self.sample1["test_dets"] = fo.Detections(
            detections=[
                fo.Detection(
                    label="friend",
                    confidence=0.9,
                    bounding_box=[0, 0, 0.5, 0.5],
                ),
                fo.Detection(
                    label="friend",
                    confidence=0.3,
                    bounding_box=[0.25, 0, 0.5, 0.1],
                ),
                fo.Detection(
                    label="stopper",
                    confidence=0.1,
                    bounding_box=[0, 0, 0.5, 0.5],
                ),
                fo.Detection(
                    label="big bro",
                    confidence=0.6,
                    bounding_box=[0, 0, 0.1, 0.5],
                ),
            ]
        )
        self.sample1.save()
        self.sample2["test_dets"] = fo.Detections(
            detections=[
                fo.Detection(
                    label="friend",
                    confidence=0.99,
                    bounding_box=[0.01, 0.01, 0.99, 0.99],
                ),
                fo.Detection(
                    label="tricam",
                    confidence=0.2,
                    bounding_box=[0, 0, 0.5, 0.5],
                ),
                fo.Detection(
                    label="hex",
                    confidence=0.8,
                    bounding_box=[0.35, 0, 0.2, 0.25],
                ),
            ]
        )
        self.sample2.save()

    def _setUp_numeric(self):
        self.sample1["numeric_field"] = 1.0
        self.sample1["numeric_list_field"] = [-1, 0, 1]
        self.sample1.save()
        self.sample2["numeric_field"] = -1.0
        self.sample2["numeric_list_field"] = [-2, -1, 0, 1]
        self.sample2.save()

    def test_exclude(self):
        result = list(self.dataset.exclude([self.sample1.id]))
        self.assertIs(len(result), 1)
        self.assertEqual(result[0].id, self.sample2.id)

    def test_exclude_fields(self):
        self.dataset.add_sample_field("exclude_fields_field1", fo.IntField)
        self.dataset.add_sample_field("exclude_fields_field2", fo.IntField)

        for default_field in ("id", "filepath", "tags", "metadata"):
            with self.assertRaises(ValueError):
                self.dataset.exclude_fields(default_field)

        for sample in self.dataset.exclude_fields(["exclude_fields_field1"]):
            self.assertIsNone(sample.selected_field_names)
            self.assertSetEqual(
                sample.excluded_field_names, {"exclude_fields_field1"}
            )
            with self.assertRaises(AttributeError):
                sample.exclude_fields_field1

            self.assertIsNone(sample.exclude_fields_field2)

    def test_exclude_frame_fields(self):
        sample = fo.Sample(filepath="video.mp4")
        sample.frames[1] = fo.Frame(int_field=1)

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        for default_field in ("frames.id", "frames.frame_number"):
            with self.assertRaises(ValueError):
                dataset.exclude_fields(default_field)

        for sample in dataset.exclude_fields("frames.int_field"):
            for frame in sample.frames.values():
                with self.assertRaises(AttributeError):
                    frame.int_field

    def test_exists(self):
        self.sample1["exists"] = True
        self.sample1.save()
        result = list(self.dataset.exists("exists"))
        self.assertIs(len(result), 1)
        self.assertEqual(result[0].id, self.sample1.id)

    def test_filter_field(self):
        self.sample1["test_class"] = fo.Classification(label="friend")
        self.sample1.save()

        self.sample2["test_class"] = fo.Classification(label="enemy")
        self.sample2.save()

        view = self.dataset.filter_field("test_class", F("label") == "friend")

        self.assertEqual(len(view.exists("test_class")), 1)
        for sample in view:
            if sample.test_class is not None:
                self.assertEqual(sample.test_class.label, "friend")

    def test_filter_labels(self):
        # Classifications
        self._setUp_classifications()

        view = self.dataset.filter_labels(
            "test_clfs", (F("confidence") > 0.5) & (F("label") == "friend")
        )

        for sample in view:
            for clf in sample.test_clfs.classifications:
                self.assertGreater(clf.confidence, 0.5)
                self.assertEqual(clf.label, "friend")

        # Detections
        self._setUp_detections()

        view = self.dataset.filter_labels(
            "test_dets", (F("confidence") > 0.5) & (F("label") == "friend")
        )

        for sample in view:
            for det in sample.test_dets.detections:
                self.assertGreater(det.confidence, 0.5)
                self.assertEqual(det.label, "friend")

    def test_filter_label_trajectories(self):
        sample1 = fo.Sample(filepath="video1.mp4")
        sample1.frames[1] = fo.Frame(
            detection=fo.Detection(
                label="vehicle",
                bounding_box=[0.2, 0.2, 0.2, 0.2],
                type="sedan",
                index=1,
            )
        )
        sample1.frames[2] = fo.Frame(
            detection=fo.Detection(
                label="vehicle",
                bounding_box=[0.2, 0.2, 0.2, 0.2],
                type="truck",
                index=2,
            )
        )
        sample1.frames[3] = fo.Frame(
            detection=fo.Detection(
                label="vehicle",
                bounding_box=[0.2, 0.2, 0.2, 0.2],
                type="sedan",
            )
        )
        sample1.frames[4] = fo.Frame()
        sample1.frames[5] = fo.Frame(
            detection=fo.Detection(
                label="vehicle",
                bounding_box=[0.2, 0.2, 0.2, 0.2],
                type="truck",
                index=1,
            )
        )

        sample2 = fo.Sample(filepath="video2.mp4")
        sample2.frames[1] = fo.Frame()

        sample3 = fo.Sample(filepath="video3.mp4")

        dataset = fo.Dataset()
        dataset.add_samples([sample1, sample2, sample3])

        view = dataset.filter_labels(
            "frames.detection", F("type") == "sedan", trajectories=True
        )

        self.assertEqual(len(view), 1)

        num_detections = 0
        for sample in view:
            for frame in sample.frames.values():
                num_detections += int(frame.detection is not None)

        self.assertEqual(num_detections, 2)
        self.assertListEqual(view.distinct("frames.detection.index"), [1])
        self.assertDictEqual(
            view.count_values("frames.detection.type"),
            {"sedan": 1, None: 3, "truck": 1},
        )

    def test_filter_label_list_trajectories(self):
        sample1 = fo.Sample(filepath="video1.mp4")
        sample1.frames[1] = fo.Frame(
            detections=fo.Detections(
                detections=[
                    fo.Detection(
                        label="vehicle",
                        bounding_box=[0.2, 0.2, 0.2, 0.2],
                        type="sedan",
                        index=1,
                    ),
                    fo.Detection(
                        label="vehicle",
                        bounding_box=[0.4, 0.4, 0.2, 0.2],
                        type="sedan",
                        index=2,
                    ),
                    fo.Detection(
                        label="vehicle",
                        bounding_box=[0.6, 0.6, 0.2, 0.2],
                        type="sedan",
                    ),
                ]
            )
        )
        sample1.frames[2] = fo.Frame()
        sample1.frames[3] = fo.Frame(
            detections=fo.Detections(
                detections=[
                    fo.Detection(
                        label="vehicle",
                        bounding_box=[0.2, 0.2, 0.2, 0.2],
                        type="sedan",
                        index=1,
                    ),
                    fo.Detection(
                        label="vehicle",
                        bounding_box=[0.4, 0.4, 0.2, 0.2],
                        type="coupe",
                        index=2,
                    ),
                ]
            )
        )

        sample2 = fo.Sample(filepath="video2.mp4")
        sample2.frames[1] = fo.Frame()

        sample3 = fo.Sample(filepath="video3.mp4")

        dataset = fo.Dataset()
        dataset.add_samples([sample1, sample2, sample3])

        view = dataset.filter_labels(
            "frames.detections", F("type") == "sedan", trajectories=True
        )

        self.assertEqual(len(view), 1)

        num_detections = 0
        for sample in view:
            for frame in sample.frames.values():
                num_detections += len(frame.detections.detections)

        self.assertEqual(num_detections, 4)
        self.assertListEqual(
            view.distinct("frames.detections.detections.index"),
            [1, 2],
        )
        self.assertDictEqual(
            view.count_values("frames.detections.detections.type"),
            {"coupe": 1, "sedan": 3},
        )

    def test_filter_keypoints(self):
        sample1 = fo.Sample(
            filepath="image1.jpg",
            kp=fo.Keypoint(
                label="person",
                points=[(0, 0), (0, 0), (0, 0), (0, 0), (0, 0)],
                confidence=[0.5, 0.6, 0.7, 0.8, 0.9],
            ),
            kps=fo.Keypoints(
                keypoints=[
                    fo.Keypoint(
                        label="person",
                        points=[(0, 0), (0, 0), (0, 0), (0, 0), (0, 0)],
                        confidence=[0.5, 0.6, 0.7, 0.8, 0.9],
                    ),
                    fo.Keypoint(),
                ]
            ),
        )

        sample2 = fo.Sample(filepath="image2.jpg")

        dataset = fo.Dataset()
        dataset.add_samples([sample1, sample2])

        dataset.default_skeleton = fo.KeypointSkeleton(
            labels=["nose", "left eye", "right eye", "left ear", "right ear"],
            edges=[[0, 1, 2, 0], [0, 3], [0, 4]],
        )

        count_nans = lambda points: len([p for p in points if np.isnan(p[0])])

        #
        # Test `Keypoint` sample fields
        #

        # only_matches=True
        view = dataset.filter_keypoints("kp", filter=F("confidence") > 0.75)
        self.assertEqual(len(view), 1)
        sample = view.first()
        self.assertEqual(len(sample["kp"].points), 5)
        self.assertEqual(count_nans(sample["kp"].points), 3)

        # only_matches=False
        view = dataset.filter_keypoints(
            "kp", filter=F("confidence") > 0.75, only_matches=False
        )
        self.assertEqual(len(view), 2)
        sample = view.first()
        self.assertEqual(len(sample["kp"].points), 5)
        self.assertEqual(count_nans(sample["kp"].points), 3)

        # view with no matches
        view = dataset.filter_keypoints("kp", filter=F("confidence") > 0.95)
        self.assertEqual(len(view), 0)

        # only_matches=True
        view = dataset.filter_keypoints("kp", labels=["left eye", "right eye"])
        self.assertEqual(len(view), 1)
        sample = view.first()
        self.assertEqual(len(sample["kp"].points), 5)
        self.assertEqual(count_nans(sample["kp"].points), 3)

        # only_matches=False
        view = dataset.filter_keypoints(
            "kp", labels=["left eye", "right eye"], only_matches=False
        )
        self.assertEqual(len(view), 2)
        sample = view.first()
        self.assertEqual(len(sample["kp"].points), 5)
        self.assertEqual(count_nans(sample["kp"].points), 3)

        # view with no matches
        view = dataset.filter_keypoints("kp", labels=[])
        self.assertEqual(len(view), 0)

        #
        # Test `Keypoints` sample fields
        #

        # only_matches=True
        view = dataset.filter_keypoints("kps", filter=F("confidence") > 0.75)
        self.assertEqual(len(view), 1)
        self.assertEqual(view.count("kps.keypoints"), 1)
        sample = view.first()
        self.assertEqual(len(sample["kps"].keypoints[0].points), 5)
        self.assertEqual(count_nans(sample["kps"].keypoints[0].points), 3)

        # only_matches=False
        view = dataset.filter_keypoints(
            "kps", filter=F("confidence") > 0.75, only_matches=False
        )
        self.assertEqual(len(view), 2)
        self.assertEqual(view.count("kps.keypoints"), 2)
        sample = view.first()
        self.assertEqual(len(sample["kps"].keypoints[0].points), 5)
        self.assertEqual(count_nans(sample["kps"].keypoints[0].points), 3)

        # view with no matches
        view = dataset.filter_keypoints("kps", filter=F("confidence") > 0.95)
        self.assertEqual(len(view), 0)

        # only_matches=True
        view = dataset.filter_keypoints(
            "kps", labels=["left eye", "right eye"]
        )
        self.assertEqual(len(view), 1)
        self.assertEqual(view.count("kps.keypoints"), 1)
        sample = view.first()
        self.assertEqual(len(sample["kps"].keypoints[0].points), 5)
        self.assertEqual(count_nans(sample["kps"].keypoints[0].points), 3)

        # only_matches=False
        view = dataset.filter_keypoints(
            "kps", labels=["left eye", "right eye"], only_matches=False
        )
        self.assertEqual(len(view), 2)
        self.assertEqual(view.count("kps.keypoints"), 2)
        sample = view.first()
        self.assertEqual(len(sample["kps"].keypoints[0].points), 5)
        self.assertEqual(count_nans(sample["kps"].keypoints[0].points), 3)

        # view with no matches
        view = dataset.filter_keypoints("kps", labels=[])
        self.assertEqual(len(view), 0)

    def test_filter_keypoints_frames(self):
        sample1 = fo.Sample(filepath="video1.mp4")
        sample1.frames[1] = fo.Frame(
            kp=fo.Keypoint(
                label="person",
                points=[(0, 0), (0, 0), (0, 0), (0, 0), (0, 0)],
                confidence=[0.5, 0.6, 0.7, 0.8, 0.9],
            ),
            kps=fo.Keypoints(
                keypoints=[
                    fo.Keypoint(
                        label="person",
                        points=[(0, 0), (0, 0), (0, 0), (0, 0), (0, 0)],
                        confidence=[0.5, 0.6, 0.7, 0.8, 0.9],
                    ),
                    fo.Keypoint(),
                ]
            ),
        )
        sample1.frames[2] = fo.Frame()

        sample2 = fo.Sample(filepath="video2.mp4")

        dataset = fo.Dataset()
        dataset.add_samples([sample1, sample2])

        dataset.default_skeleton = fo.KeypointSkeleton(
            labels=["nose", "left eye", "right eye", "left ear", "right ear"],
            edges=[[0, 1, 2, 0], [0, 3], [0, 4]],
        )

        count_nans = lambda points: len([p for p in points if np.isnan(p[0])])

        #
        # Test `Keypoint` frame fields
        #

        # only_matches=True
        view = dataset.filter_keypoints(
            "frames.kp", filter=F("confidence") > 0.75
        )
        self.assertEqual(len(view), 1)

        frame = view.first().frames.first()
        self.assertEqual(len(frame["kp"].points), 5)
        self.assertEqual(count_nans(frame["kp"].points), 3)

        # only_matches=False
        view = dataset.filter_keypoints(
            "frames.kp", filter=F("confidence") > 0.75, only_matches=False
        )
        self.assertEqual(len(view), 2)
        frame = view.first().frames.first()
        self.assertEqual(len(frame["kp"].points), 5)
        self.assertEqual(count_nans(frame["kp"].points), 3)

        # view with no matches
        view = dataset.filter_keypoints(
            "frames.kp", filter=F("confidence") > 0.95
        )
        self.assertEqual(len(view), 0)

        # only_matches=True
        view = dataset.filter_keypoints(
            "frames.kp", labels=["left eye", "right eye"]
        )
        self.assertEqual(len(view), 1)
        frame = view.first().frames.first()
        self.assertEqual(len(frame["kp"].points), 5)
        self.assertEqual(count_nans(frame["kp"].points), 3)

        # only_matches=False
        view = dataset.filter_keypoints(
            "frames.kp", labels=["left eye", "right eye"], only_matches=False
        )
        self.assertEqual(len(view), 2)
        frame = view.first().frames.first()
        self.assertEqual(len(frame["kp"].points), 5)
        self.assertEqual(count_nans(frame["kp"].points), 3)

        # view with no matches
        view = dataset.filter_keypoints("frames.kp", labels=[])
        self.assertEqual(len(view), 0)

        #
        # Test `Keypoints` frame fields
        #

        # only_matches=True
        view = dataset.filter_keypoints(
            "frames.kps", filter=F("confidence") > 0.75
        )
        self.assertEqual(len(view), 1)
        self.assertEqual(view.count("frames.kps.keypoints"), 1)
        frame = view.first().frames.first()
        self.assertEqual(len(frame["kps"].keypoints[0].points), 5)
        self.assertEqual(count_nans(frame["kps"].keypoints[0].points), 3)

        # only_matches=False
        view = dataset.filter_keypoints(
            "frames.kps", filter=F("confidence") > 0.75, only_matches=False
        )
        self.assertEqual(len(view), 2)
        self.assertEqual(view.count("frames.kps.keypoints"), 2)
        frame = view.first().frames.first()
        self.assertEqual(len(frame["kps"].keypoints[0].points), 5)
        self.assertEqual(count_nans(frame["kps"].keypoints[0].points), 3)

        # view with no matches
        view = dataset.filter_keypoints(
            "frames.kps", filter=F("confidence") > 0.95
        )
        self.assertEqual(len(view), 0)

        # only_matches=True
        view = dataset.filter_keypoints(
            "frames.kps", labels=["left eye", "right eye"]
        )
        self.assertEqual(len(view), 1)
        self.assertEqual(view.count("frames.kps.keypoints"), 1)
        frame = view.first().frames.first()
        self.assertEqual(len(frame["kps"].keypoints[0].points), 5)
        self.assertEqual(count_nans(frame["kps"].keypoints[0].points), 3)

        # only_matches=False
        view = dataset.filter_keypoints(
            "frames.kps", labels=["left eye", "right eye"], only_matches=False
        )
        self.assertEqual(len(view), 2)
        self.assertEqual(view.count("frames.kps.keypoints"), 2)
        frame = view.first().frames.first()
        self.assertEqual(len(frame["kps"].keypoints[0].points), 5)
        self.assertEqual(count_nans(frame["kps"].keypoints[0].points), 3)

        # view with no matches
        view = dataset.filter_keypoints("frames.kps", labels=[])
        self.assertEqual(len(view), 0)

    def test_limit(self):
        result = list(self.dataset.limit(1))
        self.assertIs(len(result), 1)

    def test_limit_labels(self):
        sample1 = fo.Sample(
            filepath="image1.png",
            test_clfs=fo.Classifications(
                classifications=[
                    fo.Classification(label="friend", confidence=0.9),
                    fo.Classification(label="friend", confidence=0.3),
                    fo.Classification(label="stopper", confidence=0.1),
                    fo.Classification(label="big bro", confidence=0.6),
                ]
            ),
        )

        sample2 = fo.Sample(
            filepath="image2.png",
            test_clfs=fo.Classifications(
                classifications=[
                    fo.Classification(label="friend", confidence=0.99),
                    fo.Classification(label="tricam", confidence=0.2),
                    fo.Classification(label="hex", confidence=0.8),
                ]
            ),
        )

        sample3 = fo.Sample(filepath="image3.png")

        dataset = fo.Dataset()
        dataset.add_samples([sample1, sample2, sample3])

        view = dataset.limit_labels("test_clfs", 1)

        values = view.values(F("test_clfs.classifications").length())

        self.assertListEqual(values, [1, 1, 0])
        self.assertIs(len(view.first()["test_clfs"].classifications), 1)
        self.assertIsNone(view.last()["test_clfs"])

    def test_map_labels(self):
        self._setUp_classification()
        self._setUp_detection()
        mapping = {"friend": "enemy", "hex": "curse", "enemy": "friend"}
        view = self.dataset.map_labels("test_clf", mapping).map_labels(
            "test_det", mapping
        )
        it = zip(view, self.dataset)
        for sv, s in it:
            self.assertEqual(sv.test_clf.label, mapping[s.test_clf.label])
            self.assertEqual(sv.test_det.label, mapping[s.test_det.label])

        self._setUp_classifications()
        self._setUp_detections()
        view = self.dataset.map_labels("test_clfs", mapping).map_labels(
            "test_dets", mapping
        )
        it = zip(view, self.dataset)
        for sv, s in it:
            clfs = zip(
                sv.test_clfs.classifications, s.test_clfs.classifications
            )
            dets = zip(sv.test_dets.detections, s.test_dets.detections)
            for f in (clfs, dets):
                for lv, l in f:
                    if l.label in mapping:
                        self.assertEqual(lv.label, mapping[l.label])
                    else:
                        self.assertEqual(lv.label, l.label)

    def test_set_field(self):
        self._setUp_numeric()

        # Clip all negative values of `numeric_field` to zero
        view = self.dataset.set_field(
            "numeric_field", F("numeric_field").max(0)
        )
        it = zip(view, self.dataset)
        for sv, s in it:
            if s.numeric_field < 0:
                self.assertTrue(sv.numeric_field == 0)
            else:
                self.assertTrue(sv.numeric_field >= 0)

        # Replace all negative values of `numeric_field` with `None`
        view = self.dataset.set_field(
            "numeric_field",
            (F("numeric_field") >= 0).if_else(F("numeric_field"), None),
        )
        it = zip(view, self.dataset)
        for sv, s in it:
            if s.numeric_field < 0:
                self.assertIsNone(sv.numeric_field)
            else:
                self.assertIsNotNone(sv.numeric_field)

        # Clip all negative values of `numeric_list_field` to zero
        view = self.dataset.set_field(
            "numeric_list_field", F("numeric_list_field").map(F().max(0))
        )
        it = zip(view, self.dataset)
        for sv, s in it:
            for fv, f in zip(sv.numeric_list_field, s.numeric_list_field):
                if f < 0:
                    self.assertTrue(fv == 0)
                else:
                    self.assertTrue(fv >= 0)

    def test_set_embedded_field(self):
        self._setUp_detections()

        # Set a new embedded list field
        view = self.dataset.set_field(
            "test_dets.detections.is_best_friend",
            (F("confidence") > 0.5) & (F("label") == "friend"),
            _allow_missing=True,
        )

        for sample in view:
            for det in sample.test_dets.detections:
                is_best_friend = det.confidence > 0.5 and det.label == "friend"
                self.assertEqual(det.is_best_friend, is_best_friend)

        # Set an embedded field
        view = self.dataset.set_field(
            "test_dets.num_predictions",
            F("detections").length(),
            _allow_missing=True,
        )

        for sample in view:
            self.assertEqual(
                sample.test_dets.num_predictions,
                len(sample.test_dets.detections),
            )

        # Validate that terminal list fields are not automatically unrolled
        view = self.dataset.set_field(
            "test_dets.detections",
            F("detections").filter(F("confidence") > 0.5),
        )

        for sample in view:
            for det in sample.test_dets.detections:
                self.assertGreater(det.confidence, 0.5)

        # Validate that terminal list fields can be unrolled if desired
        # Sets all bounding box coordinates to 0
        view = self.dataset.set_field("test_dets.detections.bounding_box[]", 0)

        for sample in view:
            for det in sample.test_dets.detections:
                for coord in det.bounding_box:
                    self.assertEqual(coord, 0)

    def test_tag_samples(self):
        view = self.dataset[:1]

        tags = self.dataset.count_values("tags")
        self.assertDictEqual(tags, {})

        view.tag_samples("test")
        tags = self.dataset.count_values("tags")
        self.assertDictEqual(tags, {"test": 1})

        view.untag_samples("test")
        tags = self.dataset.count_values("tags")
        self.assertDictEqual(tags, {})

    def test_tag_labels(self):
        self._setUp_classification()
        self._setUp_detections()

        view = self.dataset.filter_labels("test_clf", F("confidence") > 0.95)
        num_samples = len(view)
        self.assertEqual(num_samples, 1)

        view.tag_labels("test", "test_clf")
        tags = self.dataset.count_label_tags("test_clf")
        self.assertDictEqual(tags, {"test": 1})

        view.untag_labels("test", "test_clf")
        tags = self.dataset.count_label_tags("test_clf")
        self.assertDictEqual(tags, {})

        view = self.dataset.filter_labels("test_dets", F("confidence") > 0.7)
        num_samples = len(view)
        num_labels = view.count("test_dets.detections")
        self.assertEqual(num_samples, 2)
        self.assertEqual(num_labels, 3)

        view.tag_labels("test", "test_dets")
        tags = self.dataset.count_label_tags("test_dets")
        self.assertDictEqual(tags, {"test": 3})

        view.untag_labels("test", "test_dets")
        tags = self.dataset.count_label_tags("test_dets")
        self.assertDictEqual(tags, {})

    def test_match(self):
        self.sample1["value"] = "value"
        self.sample1.save()
        result = list(self.dataset.match({"value": "value"}))
        self.assertIs(len(result), 1)
        self.assertEqual(result[0].id, self.sample1.id)

    def test_match_labels(self):
        sample1 = fo.Sample(
            filepath="image1.png",
            test_clfs=fo.Classifications(
                classifications=[
                    fo.Classification(
                        label="friend",
                        confidence=0.9,
                        tags=["good"],
                    ),
                    fo.Classification(
                        label="big bro",
                        confidence=0.6,
                        tags=["bad"],
                    ),
                ]
            ),
        )

        sample2 = fo.Sample(
            filepath="image2.png",
            test_clfs=fo.Classifications(
                classifications=[
                    fo.Classification(
                        label="tricam",
                        confidence=0.99,
                        tags=["good"],
                    )
                ]
            ),
        )

        sample3 = fo.Sample(filepath="image3.png")

        dataset = fo.Dataset()
        dataset.add_samples([sample1, sample2, sample3])

        view = dataset.match_labels(tags="good")
        self.assertEqual(len(view), 2)

        view = dataset.match_labels(tags="bad")
        self.assertEqual(len(view), 1)

        view = dataset.match_labels(filter=F("confidence") > 0.8)
        self.assertEqual(len(view), 2)

        view = dataset.match_labels(tags="good", filter=F("confidence") < 0.95)
        self.assertEqual(len(view), 1)

        # Test `bool=False`

        view1 = dataset.match_labels(tags="bad")
        view2 = dataset.match_labels(tags="bad", bool=False)

        self.assertEqual(len(dataset), len(view1) + len(view2))
        self.assertSetEqual(
            set(dataset.values("id")),
            set(view1.values("id") + view2.values("id")),
        )

        view1 = dataset.match_labels(filter=F("confidence") > 0.8)
        view2 = dataset.match_labels(filter=F("confidence") > 0.8, bool=False)

        self.assertEqual(len(dataset), len(view1) + len(view2))
        self.assertSetEqual(
            set(dataset.values("id")),
            set(view1.values("id") + view2.values("id")),
        )

    def test_match_labels_video(self):
        sample1 = fo.Sample(filepath="video1.mp4")
        sample1.frames[1] = fo.Frame(
            test_clfs=fo.Classifications(
                classifications=[
                    fo.Classification(
                        label="friend",
                        confidence=0.9,
                        tags=["good"],
                    ),
                    fo.Classification(
                        label="big bro",
                        confidence=0.6,
                        tags=["bad"],
                    ),
                ]
            )
        )
        sample1.frames[2] = fo.Frame(
            test_clfs=fo.Classifications(
                classifications=[
                    fo.Classification(
                        label="tricam",
                        confidence=0.99,
                        tags=["good"],
                    )
                ]
            )
        )

        sample2 = fo.Sample(filepath="video2.mp4")
        sample2.frames[2] = fo.Frame(
            test_clfs=fo.Classifications(
                classifications=[
                    fo.Classification(
                        label="big bro",
                        confidence=0.4,
                        tags=["bad"],
                    )
                ]
            )
        )

        sample3 = fo.Sample(filepath="video3.mp4")

        dataset = fo.Dataset()
        dataset.add_samples([sample1, sample2, sample3])

        view = dataset.match_labels(tags="good")
        self.assertEqual(len(view), 1)

        view = dataset.match_labels(tags="bad")
        self.assertEqual(len(view), 2)

        view = dataset.match_labels(tags=["good", "bad"])
        self.assertEqual(len(view), 2)

        view = dataset.match_labels(filter=F("label") == "friend")
        self.assertEqual(len(view), 1)

        view = dataset.match_labels(filter=F("label") == "big bro")
        self.assertEqual(len(view), 2)

        view = dataset.match_labels(tags="bad", filter=F("confidence") < 0.5)
        self.assertEqual(len(view), 1)

        # Test `bool=False`

        view1 = dataset.match_labels(tags="bad")
        view2 = dataset.match_labels(tags="bad", bool=False)

        self.assertEqual(len(dataset), len(view1) + len(view2))
        self.assertSetEqual(
            set(dataset.values("id")),
            set(view1.values("id") + view2.values("id")),
        )

        view1 = dataset.match_labels(filter=F("label") == "friend")
        view2 = dataset.match_labels(filter=F("label") == "friend", bool=False)

        self.assertEqual(len(dataset), len(view1) + len(view2))
        self.assertSetEqual(
            set(dataset.values("id")),
            set(view1.values("id") + view2.values("id")),
        )

    def test_match_tags(self):
        self.sample1.tags.append("test")
        self.sample1.save()
        result = list(self.dataset.match_tags(["test"]))
        self.assertIs(len(result), 1)
        self.assertEqual(result[0].id, self.sample1.id)

    def test_re_match(self):
        result = list(self.dataset.match(F("filepath").re_match(r"two\.png$")))
        self.assertIs(len(result), 1)
        self.assertTrue(result[0].filepath.endswith("two.png"))

        # case-insentive match
        result = list(
            self.dataset.match(
                F("filepath").re_match(r"TWO\.PNG$", options="i")
            )
        )
        self.assertIs(len(result), 1)
        self.assertTrue(result[0].filepath.endswith("two.png"))

    def test_mongo(self):
        result = list(self.dataset.mongo([{"$limit": 1}]))
        self.assertIs(len(result), 1)
        self.assertEqual(result[0].id, self.sample1.id)

    def test_select(self):
        result = list(self.dataset.select([self.sample1.id]))
        self.assertIs(len(result), 1)
        self.assertEqual(result[0].id, self.sample1.id)

    def test_select_ordered(self):
        ids = [self.sample2.id, self.sample1.id]
        view = self.dataset.select(ids, ordered=True)
        self.assertIs(len(view), 2)
        for sample, _id in zip(view, ids):
            self.assertEqual(sample.id, _id)

    def test_select_fields(self):
        self.dataset.add_sample_field("select_fields_field", fo.IntField)

        for sample in self.dataset.select_fields():
            self.assertSetEqual(
                sample.selected_field_names,
                set(fos.get_default_sample_fields(include_private=True)),
            )
            self.assertIsNone(sample.excluded_field_names)
            sample.filepath
            sample.metadata
            sample.tags
            with self.assertRaises(AttributeError):
                sample.select_fields_field

    def test_skip(self):
        result = list(self.dataset.sort_by("filepath").skip(1))
        self.assertIs(len(result), 1)
        self.assertEqual(result[0].id, self.sample2.id)

    def test_sort_by(self):
        result = list(self.dataset.sort_by("filepath"))
        self.assertIs(len(result), 2)
        self.assertEqual(result[0].id, self.sample1.id)
        result = list(self.dataset.sort_by("filepath", reverse=True))
        self.assertIs(len(result), 2)
        self.assertEqual(result[0].id, self.sample2.id)

    def test_sort_by_embedded(self):
        self._setUp_classification()

        result = list(self.dataset.sort_by("test_clf.label"))
        self.assertEqual(result[0]["test_clf"].label, "enemy")
        self.assertEqual(result[1]["test_clf"].label, "friend")

    def test_take(self):
        result = list(self.dataset.take(1))
        self.assertIs(len(result), 1)

    def test_uuids(self):
        stage = fosg.Take(1)
        stage_dict = stage._serialize()
        self.assertEqual(stage._uuid, stage_dict["_uuid"])
        self.assertEqual(
            stage_dict["_uuid"], fosg.ViewStage._from_dict(stage_dict)._uuid
        )

    def test_view_field_copy(self):
        self.assertEqual(str(VALUE), str(deepcopy(VALUE)))

        field = F("$ground_truth")
        self.assertEqual(str(field), str(deepcopy(field)))


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
