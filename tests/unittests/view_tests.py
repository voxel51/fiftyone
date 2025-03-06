"""
FiftyOne view-related unit tests.

| Copyright 2017-2025, Voxel51, Inc.
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
import fiftyone.core.media as fom
import fiftyone.core.sample as fos
import fiftyone.core.stages as fosg
import fiftyone.core.view as fov

from fiftyone.core.labels import Classification, Classifications

from decorators import drop_datasets, skip_windows


class DatasetViewTests(unittest.TestCase):
    @drop_datasets
    def test_eq(self):
        dataset = fo.Dataset()
        dataset.add_samples(
            [fo.Sample(filepath="image%d.jpg" % i) for i in range(5)]
        )

        view1 = dataset.shuffle(seed=51).limit(3)
        view2 = dataset.shuffle(seed=51).limit(3)
        view3 = deepcopy(view1)

        self.assertEqual(view1, view2)
        self.assertEqual(view1, view3)

        view1 = dataset.limit(1).concat(dataset.skip(1).limit(1))
        view2 = dataset.limit(1).concat(dataset.skip(1).limit(1))
        view3 = deepcopy(view1)

        self.assertEqual(view1, view2)
        self.assertEqual(view1, view3)

    @drop_datasets
    def test_iter_samples(self):
        dataset = fo.Dataset()
        dataset.add_samples(
            [fo.Sample(filepath="image%d.jpg" % i) for i in range(51)]
        )

        first_sample = dataset.first()
        view = dataset.limit(50)

        last_modified_at1 = view.values("last_modified_at")

        for idx, sample in enumerate(view):
            sample["int"] = idx + 1
            sample.save()

        last_modified_at2 = view.values("last_modified_at")

        self.assertTupleEqual(dataset.bounds("int"), (1, 50))
        self.assertEqual(first_sample.int, 1)
        self.assertTrue(
            all(
                m1 < m2 for m1, m2 in zip(last_modified_at1, last_modified_at2)
            )
        )

        for idx, sample in enumerate(view.iter_samples(progress=True)):
            sample["int"] = idx + 2
            sample.save()

        self.assertTupleEqual(dataset.bounds("int"), (2, 51))
        self.assertEqual(first_sample.int, 2)

        for idx, sample in enumerate(view.iter_samples(autosave=True)):
            sample["int"] = idx + 3

        last_modified_at3 = view.values("last_modified_at")

        self.assertTupleEqual(dataset.bounds("int"), (3, 52))
        self.assertEqual(first_sample.int, 3)
        self.assertTrue(
            all(
                m2 < m3 for m2, m3 in zip(last_modified_at2, last_modified_at3)
            )
        )

        with view.save_context() as context:
            for idx, sample in enumerate(view):
                sample["int"] = idx + 4
                context.save(sample)

        last_modified_at4 = view.values("last_modified_at")

        self.assertTupleEqual(dataset.bounds("int"), (4, 53))
        self.assertEqual(first_sample.int, 4)
        self.assertTrue(
            all(
                m3 < m4 for m3, m4 in zip(last_modified_at3, last_modified_at4)
            )
        )

    @drop_datasets
    def test_set_unknown_attribute(self):
        dataset_name = self.test_set_unknown_attribute.__name__

        dataset = fo.Dataset(dataset_name)
        view = dataset.view()
        self.assertRaises(AttributeError, setattr, view, "persistant", True)
        self.assertRaises(AttributeError, setattr, view, "somethingelse", 5)

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

    @drop_datasets
    def test_view_name_readonly(self):
        dataset = fo.Dataset()
        view = dataset.view()

        with self.assertRaises(AttributeError):
            view.name = "new_name"

    @drop_datasets
    def test_reload(self):
        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(filepath="image1.jpg", foo="bar"),
                fo.Sample(filepath="image2.jpg", spam="eggs"),
                fo.Sample(filepath="image3.jpg"),
                fo.Sample(filepath="image4.jpg"),
                fo.Sample(filepath="image5.jpg"),
            ]
        )

        view = dataset.take(3).sort_by("filepath").select_fields("foo")
        sample_ids = view.values("id")

        # Reloading should not cause dataset-independent view stage parameters
        # like Take's internal random seed to be changed
        view.reload()
        same_sample_ids = view.values("id")

        self.assertListEqual(sample_ids, same_sample_ids)

        dataset.delete_sample_field("foo")

        # Field `foo` no longer exists, so validation should fail on reload
        with self.assertRaises(ValueError):
            view.reload()


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

    def test_set_values_validation(self):
        sample = fo.Sample(
            filepath="image.jpg",
            predictions=fo.Classification(label="bar"),
            labels=fo.Classifications(
                classifications=[fo.Classification(label="foo")]
            ),
        )

        dataset = fo.Dataset()
        dataset.add_samples([sample, sample, sample, sample, sample])

        # Test emebedd field validation

        with self.assertRaises(ValueError):
            dataset.set_values("predictions", [1, 2, 3, 4, 5])

        for value in dataset.values("predictions"):
            self.assertIsInstance(value, fo.Classification)

        dataset.set_values("predictions.int", [1, 2, 3, 4, 5])

        self.assertListEqual(
            dataset.values("predictions.int"),
            [1, 2, 3, 4, 5],
        )

        with self.assertRaises(ValueError):
            dataset.set_values("predictions.int", [5, 4, "c", 2, 1])

        self.assertListEqual(
            dataset.values("predictions.int"),
            [1, 2, 3, 4, 5],
        )

        dataset.set_values(
            "predictions.int",
            ["e", "d", "c", "b", "a"],
            validate=False,
        )

        self.assertListEqual(
            dataset.values("predictions.int"),
            ["e", "d", "c", "b", "a"],
        )

        dataset.set_values(
            "predictions.also_int",
            [1, 2, 3, 4, 5],
            dynamic=True,
        )

        self.assertListEqual(
            dataset.values("predictions.also_int"),
            [1, 2, 3, 4, 5],
        )

        schema = dataset.get_field_schema(flat=True)
        self.assertIsInstance(schema["predictions.also_int"], fo.IntField)

        dataset.set_values(
            "predictions.labels",
            [fo.Classification() for _ in range(len(dataset))],
            dynamic=True,
        )

        for value in dataset.values("predictions.labels"):
            self.assertIsInstance(value, fo.Classification)

        # Test embedded list field validation

        with self.assertRaises(ValueError):
            dataset.set_values("labels", [1, 2, 3, 4, 5])

        for value in dataset.values("labels"):
            self.assertIsInstance(value, fo.Classifications)

        dataset.set_values(
            "labels.classifications.int",
            [[1], [2], [3], [4], [5]],
        )

        self.assertListEqual(
            dataset.values("labels.classifications.int"),
            [[1], [2], [3], [4], [5]],
        )

        with self.assertRaises(ValueError):
            dataset.set_values(
                "labels.classifications.int",
                [[5], [4], ["c"], [2], [1]],
            )

        self.assertListEqual(
            dataset.values("labels.classifications.int"),
            [[1], [2], [3], [4], [5]],
        )

        dataset.set_values(
            "labels.classifications.int",
            [["e"], ["d"], ["c"], ["b"], ["a"]],
            validate=False,
        )

        self.assertListEqual(
            dataset.values("labels.classifications.int"),
            [["e"], ["d"], ["c"], ["b"], ["a"]],
        )

        dataset.set_values(
            "labels.classifications.also_int",
            [[1], [2], [3], [4], [5]],
            dynamic=True,
        )

        self.assertListEqual(
            dataset.values("labels.classifications.also_int"),
            [[1], [2], [3], [4], [5]],
        )

        schema = dataset.get_field_schema(flat=True)
        self.assertIsInstance(
            schema["labels.classifications.also_int"],
            fo.IntField,
        )

    def test_set_values_dynamic1(self):
        dataset = _make_labels_dataset()

        values = dataset.values("labels.classifications.label")

        dataset.set_values("labels.classifications.also_label", values)

        schema = dataset.get_field_schema(flat=True)
        self.assertNotIn("labels.classifications.also_label", schema)

        also_values = dataset.values("labels.classifications.also_label")
        self.assertEqual(values, also_values)

        dataset.set_values(
            "labels.classifications.still_label", values, dynamic=True
        )

        schema = dataset.get_field_schema(flat=True)
        self.assertIn("labels.classifications.still_label", schema)

        still_values = dataset.values("labels.classifications.still_label")
        self.assertEqual(values, still_values)

    def test_set_values_dynamic2(self):
        dataset = _make_labels_dataset()

        values = [
            [fo.Classification(label=v) for v in vv]
            if vv is not None
            else None
            for vv in dataset.values("labels.classifications.label")
        ]

        dataset.set_values("labels.classifications.also_label", values)

        schema = dataset.get_field_schema(flat=True)
        self.assertNotIn("labels.classifications.also_label", schema)

        # Since this field is not in the schema, the values are loaded as dicts
        also_values = [
            [fo.Classification.from_dict(d) for d in dd]
            if dd is not None
            else None
            for dd in dataset.values("labels.classifications.also_label")
        ]
        self.assertEqual(values, also_values)

        dataset.set_values(
            "labels.classifications.still_label", values, dynamic=True
        )

        schema = dataset.get_field_schema(flat=True)
        self.assertIn("labels.classifications.still_label", schema)

        # Now the field is in the schema, so `Classification`s are loaded
        still_values = dataset.values("labels.classifications.still_label")
        self.assertEqual(values, still_values)

    def test_set_values_dynamic3(self):
        dataset = _make_labels_dataset()
        values = dataset.values("labels")

        dataset.set_values("also_labels", values)
        schema = dataset.get_field_schema(flat=True)

        self.assertNotIn("also_labels.classifications.mood", schema)
        self.assertNotIn("also_labels.classifications.age", schema)
        self.assertNotIn("also_labels.classifications.fluffy", schema)

        self.assertListEqual(
            dataset.values("labels.classifications.mood"),
            dataset.values("also_labels.classifications.mood"),
        )
        self.assertListEqual(
            dataset.values("labels.classifications.age"),
            dataset.values("also_labels.classifications.age"),
        )
        self.assertListEqual(
            dataset.values("labels.classifications.fluffy"),
            dataset.values("also_labels.classifications.fluffy"),
        )

        dataset.set_values("still_labels", values, dynamic=True)
        schema = dataset.get_field_schema(flat=True)

        self.assertIn("still_labels.classifications.mood", schema)
        self.assertIn("still_labels.classifications.age", schema)
        self.assertIn("still_labels.classifications.fluffy", schema)

        self.assertListEqual(
            dataset.values("labels.classifications.mood"),
            dataset.values("still_labels.classifications.mood"),
        )
        self.assertListEqual(
            dataset.values("labels.classifications.age"),
            dataset.values("still_labels.classifications.age"),
        )
        self.assertListEqual(
            dataset.values("labels.classifications.fluffy"),
            dataset.values("still_labels.classifications.fluffy"),
        )

    def test_set_frame_values_dynamic1(self):
        dataset = _make_frame_labels_dataset()

        values = dataset.values("frames.labels.classifications.label")

        dataset.set_values("frames.labels.classifications.also_label", values)

        schema = dataset.get_frame_field_schema(flat=True)
        self.assertNotIn("labels.classifications.also_label", schema)

        also_values = dataset.values(
            "frames.labels.classifications.also_label"
        )
        self.assertEqual(values, also_values)

        dataset.set_values(
            "frames.labels.classifications.still_label", values, dynamic=True
        )

        schema = dataset.get_frame_field_schema(flat=True)
        self.assertIn("labels.classifications.still_label", schema)

        still_values = dataset.values(
            "frames.labels.classifications.still_label"
        )
        self.assertEqual(values, still_values)

    def test_set_frame_values_dynamic2(self):
        dataset = _make_frame_labels_dataset()

        values = [
            [
                [fo.Classification(label=v) for v in vv]
                if vv is not None
                else None
                for vv in ff
            ]
            for ff in dataset.values("frames.labels.classifications.label")
        ]

        dataset.set_values("frames.labels.classifications.also_label", values)

        schema = dataset.get_frame_field_schema(flat=True)
        self.assertNotIn("labels.classifications.also_label", schema)

        # Since this field is not in the schema, the values are loaded as dicts
        also_values = [
            [
                [fo.Classification.from_dict(d) for d in dd]
                if dd is not None
                else None
                for dd in ff
            ]
            for ff in dataset.values(
                "frames.labels.classifications.also_label"
            )
        ]
        self.assertEqual(values, also_values)

        dataset.set_values(
            "frames.labels.classifications.still_label", values, dynamic=True
        )

        schema = dataset.get_frame_field_schema(flat=True)
        self.assertIn("labels.classifications.still_label", schema)

        # Now the field is in the schema, so `Classification`s are loaded
        still_values = dataset.values(
            "frames.labels.classifications.still_label"
        )
        self.assertEqual(values, still_values)

    def test_set_frame_values_dynamic3(self):
        dataset = _make_frame_labels_dataset()
        values = dataset.values("frames.labels")

        dataset.set_values("frames.also_labels", values)
        schema = dataset.get_frame_field_schema(flat=True)

        self.assertNotIn("also_labels.classifications.mood", schema)
        self.assertNotIn("also_labels.classifications.age", schema)
        self.assertNotIn("also_labels.classifications.fluffy", schema)

        self.assertListEqual(
            dataset.values("frames.labels.classifications.mood"),
            dataset.values("frames.also_labels.classifications.mood"),
        )
        self.assertListEqual(
            dataset.values("frames.labels.classifications.age"),
            dataset.values("frames.also_labels.classifications.age"),
        )
        self.assertListEqual(
            dataset.values("frames.labels.classifications.fluffy"),
            dataset.values("frames.also_labels.classifications.fluffy"),
        )

        dataset.set_values("frames.still_labels", values, dynamic=True)
        schema = dataset.get_frame_field_schema(flat=True)

        self.assertIn("still_labels.classifications.mood", schema)
        self.assertIn("still_labels.classifications.age", schema)
        self.assertIn("still_labels.classifications.fluffy", schema)

        self.assertListEqual(
            dataset.values("frames.labels.classifications.mood"),
            dataset.values("frames.still_labels.classifications.mood"),
        )
        self.assertListEqual(
            dataset.values("frames.labels.classifications.age"),
            dataset.values("frames.still_labels.classifications.age"),
        )
        self.assertListEqual(
            dataset.values("frames.labels.classifications.fluffy"),
            dataset.values("frames.still_labels.classifications.fluffy"),
        )


class SetLabelValuesTests(unittest.TestCase):
    @drop_datasets
    def test_set_label_values(self):
        dataset = _make_classification_dataset()

        view = dataset.match(F("label.label") == "cat")
        cat_ids = set(view.values("label.id"))

        values = {_id: True for _id in cat_ids}

        dataset.set_label_values("label.is_cat1", values)
        schema = dataset.get_field_schema(flat=True)

        self.assertNotIn("label.is_cat1", schema)
        self.assertDictEqual(
            dataset.count_values("label.is_cat1"), {True: 1, None: 4}
        )

        dataset.set_label_values("label.is_cat2", values, dynamic=True)
        schema = dataset.get_field_schema(flat=True)

        self.assertIn("label.is_cat2", schema)
        self.assertDictEqual(
            dataset.count_values("label.is_cat2"), {True: 1, None: 4}
        )

        with self.assertRaises(ValueError):
            dataset.set_label_values("wrong_field.id", values)

        all_ids = dataset.exists("label").values("label.id", unwind=True)
        values = {_id: _id in cat_ids for _id in all_ids}
        dataset.set_label_values("label.is_cat3", values)

        self.assertDictEqual(
            dataset.count_values("label.is_cat3"),
            {True: 1, False: 2, None: 2},
        )

        cats_view = dataset.filter_labels("label", F("is_cat3") == True)
        self.assertListEqual(cats_view.distinct("label.label"), ["cat"])

    @drop_datasets
    def test_set_label_list_values(self):
        dataset = _make_labels_dataset()

        view = dataset.filter_labels("labels", F("label") == "cat")
        cat_ids = set(view.values("labels.classifications.id", unwind=True))

        values = {_id: True for _id in cat_ids}

        dataset.set_label_values("labels.classifications.is_cat1", values)
        schema = dataset.get_field_schema(flat=True)

        self.assertNotIn("labels.classifications.is_cat1", schema)
        self.assertDictEqual(
            dataset.count_values("labels.classifications.is_cat1"),
            {True: 2, None: 4},
        )

        dataset.set_label_values(
            "labels.classifications.is_cat2", values, dynamic=True
        )
        schema = dataset.get_field_schema(flat=True)

        self.assertIn("labels.classifications.is_cat2", schema)
        self.assertDictEqual(
            dataset.count_values("labels.classifications.is_cat2"),
            {True: 2, None: 4},
        )

        with self.assertRaises(ValueError):
            dataset.set_label_values("wrong_field.classifications.id", values)

        all_ids = dataset.values("labels.classifications.id", unwind=True)
        values = {_id: _id in cat_ids for _id in all_ids}
        dataset.set_label_values(
            "labels.classifications.is_cat3",
            values,
        )

        self.assertDictEqual(
            dataset.count_values("labels.classifications.is_cat3"),
            {True: 2, False: 4},
        )

        cats_view = dataset.filter_labels("labels", F("is_cat3") == True)
        self.assertListEqual(
            cats_view.distinct("labels.classifications.label"),
            ["cat"],
        )

    @drop_datasets
    def test_set_frame_label_values(self):
        dataset = _make_frame_classification_dataset()

        view = dataset.match_frames(F("label.label") == "cat")
        cat_ids = set(view.values("frames.label.id", unwind=True))

        values = {_id: True for _id in cat_ids}

        dataset.set_label_values("frames.label.is_cat1", values)
        schema = dataset.get_frame_field_schema(flat=True)

        self.assertNotIn("label.is_cat1", schema)
        self.assertDictEqual(
            dataset.count_values("frames.label.is_cat1"), {True: 1, None: 3}
        )

        dataset.set_label_values("frames.label.is_cat2", values, dynamic=True)
        schema = dataset.get_frame_field_schema(flat=True)

        self.assertIn("label.is_cat2", schema)
        self.assertDictEqual(
            dataset.count_values("frames.label.is_cat2"), {True: 1, None: 3}
        )

        with self.assertRaises(ValueError):
            dataset.set_label_values("frames.wrong_field.id", values)

        all_ids = dataset.match_frames(F("label") != None).values(
            "frames.label.id", unwind=True
        )
        values = {_id: _id in cat_ids for _id in all_ids}
        dataset.set_label_values("frames.label.is_cat3", values)

        self.assertDictEqual(
            dataset.count_values("frames.label.is_cat3"),
            {True: 1, False: 2, None: 1},
        )

        cats_view = dataset.filter_labels("frames.label", F("is_cat3") == True)
        self.assertListEqual(cats_view.distinct("frames.label.label"), ["cat"])

    @drop_datasets
    def test_set_frame_label_list_values(self):
        dataset = _make_frame_labels_dataset()

        view = dataset.filter_labels("frames.labels", F("label") == "cat")
        cat_ids = set(
            view.values("frames.labels.classifications.id", unwind=True)
        )

        values = {_id: True for _id in cat_ids}

        dataset.set_label_values(
            "frames.labels.classifications.is_cat1", values
        )
        schema = dataset.get_frame_field_schema(flat=True)

        self.assertNotIn("labels.classifications.is_cat1", schema)
        self.assertDictEqual(
            dataset.count_values("frames.labels.classifications.is_cat1"),
            {True: 2, None: 4},
        )

        dataset.set_label_values(
            "frames.labels.classifications.is_cat2", values, dynamic=True
        )
        schema = dataset.get_frame_field_schema(flat=True)

        self.assertIn("labels.classifications.is_cat2", schema)
        self.assertDictEqual(
            dataset.count_values("frames.labels.classifications.is_cat2"),
            {True: 2, None: 4},
        )

        with self.assertRaises(ValueError):
            dataset.set_label_values(
                "frames.wrong_field.classifications.id", values
            )

        all_ids = dataset.values(
            "frames.labels.classifications.id", unwind=True
        )
        values = {_id: _id in cat_ids for _id in all_ids}
        dataset.set_label_values(
            "frames.labels.classifications.is_cat3",
            values,
        )

        self.assertDictEqual(
            dataset.count_values("frames.labels.classifications.is_cat3"),
            {True: 2, False: 4},
        )

        cats_view = dataset.filter_labels(
            "frames.labels", F("is_cat3") == True
        )
        self.assertListEqual(
            cats_view.distinct("frames.labels.classifications.label"),
            ["cat"],
        )

    def test_set_values_last_modified_at(self):
        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(filepath="test1.png", int_field=1),
                fo.Sample(filepath="test2.png", int_field=2),
                fo.Sample(filepath="test3.png", int_field=3),
                fo.Sample(filepath="test4.png", int_field=4),
            ]
        )

        # key_field

        values = {1: "1", 3: "3"}
        lma1 = dataset.values("last_modified_at")

        dataset.set_values("str_field", values, key_field="int_field")

        lma2 = dataset.values("last_modified_at")

        self.assertListEqual(
            [i < j for i, j in zip(lma1, lma2)],
            [True, False, True, False],
        )

        # view

        lma1 = dataset.values("last_modified_at")

        view = dataset.limit(2)
        view.set_values("str_field", ["foo", "bar"])

        lma2 = dataset.values("last_modified_at")

        self.assertListEqual(
            [i < j for i, j in zip(lma1, lma2)],
            [True, True, False, False],
        )

    def test_set_values_video_last_modified_at(self):
        dataset = fo.Dataset()

        sample1 = fo.Sample(filepath="video1.mp4")
        sample1.frames[1] = fo.Frame()
        sample1.frames[2] = fo.Frame()

        sample2 = fo.Sample(filepath="video2.mp4")

        sample3 = fo.Sample(filepath="video3.mp4")
        sample3.frames[1] = fo.Frame()
        sample3.frames[2] = fo.Frame()

        dataset.add_samples([sample1, sample2, sample3])

        # key_field

        values = {sample1.id: {1: "1"}, sample3.id: {2: "2"}}
        lma1 = dataset.values("frames.last_modified_at", unwind=True)

        dataset.set_values("frames.str_field", values, key_field="id")

        lma2 = dataset.values("frames.last_modified_at", unwind=True)

        self.assertListEqual(
            [i < j for i, j in zip(lma1, lma2)],
            [True, False, False, True],
        )

        # view

        lma1 = dataset.values("frames.last_modified_at", unwind=True)

        view = dataset.match_frames(F("str_field").exists(), omit_empty=False)
        view.set_values("frames.str_field", [["foo"], [], ["bar"]])

        lma2 = dataset.values("frames.last_modified_at", unwind=True)

        self.assertListEqual(
            [i < j for i, j in zip(lma1, lma2)],
            [True, False, False, True],
        )


def _make_classification_dataset():
    sample1 = fo.Sample(
        filepath="image1.jpg",
        label=fo.Classification(label="cat", mood="surly"),
    )

    sample2 = fo.Sample(filepath="image2.jpg")

    sample3 = fo.Sample(
        filepath="image3.jpg",
        label=fo.Classification(label="dog", age=51),
    )

    sample4 = fo.Sample(
        filepath="image4.jpg",
        label=fo.Classification(label="squirrel", fluffy=True),
    )

    sample5 = fo.Sample(filepath="image5.jpg")

    dataset = fo.Dataset()
    dataset.add_samples([sample1, sample2, sample3, sample4, sample5])

    return dataset


def _make_frame_classification_dataset():
    sample1 = fo.Sample("video1.mp4")
    sample1.frames[1] = fo.Frame(
        label=fo.Classification(label="cat", mood="surly"),
    )

    sample2 = fo.Sample("video2.mp4")
    sample2.frames[2] = fo.Frame()

    sample3 = fo.Sample("video3.mp4")
    sample3.frames[3] = fo.Frame(
        label=fo.Classification(label="dog", age=51),
    )

    sample4 = fo.Sample("video4.mp4")
    sample4.frames[4] = fo.Frame(
        label=fo.Classification(label="squirrel", fluffy=True)
    )

    sample5 = fo.Sample("video5.mp4")

    dataset = fo.Dataset()
    dataset.add_samples([sample1, sample2, sample3, sample4, sample5])

    return dataset


def _make_labels_dataset():
    sample1 = fo.Sample(
        filepath="image1.jpg",
        labels=fo.Classifications(
            classifications=[fo.Classification(label="cat", mood="surly")]
        ),
    )

    sample2 = fo.Sample(filepath="image2.jpg")

    sample3 = fo.Sample(
        filepath="image3.jpg",
        labels=fo.Classifications(
            classifications=[
                fo.Classification(label="cat"),
                fo.Classification(label="dog", age=51),
            ]
        ),
    )

    sample4 = fo.Sample(
        filepath="image4.jpg",
        labels=fo.Classifications(
            classifications=[
                fo.Classification(label="rabbit"),
                fo.Classification(label="squirrel", fluffy=True),
                fo.Classification(label="frog"),
            ]
        ),
    )

    sample5 = fo.Sample(filepath="image5.jpg")

    dataset = fo.Dataset()
    dataset.add_samples([sample1, sample2, sample3, sample4, sample5])

    return dataset


def _make_frame_labels_dataset():
    sample1 = fo.Sample(filepath="video1.mp4")
    sample1.frames[1] = fo.Frame(
        labels=fo.Classifications(
            classifications=[fo.Classification(label="cat", mood="surly")]
        )
    )

    sample2 = fo.Sample(filepath="video2.mp4")
    sample2.frames[2] = fo.Frame()

    sample3 = fo.Sample(filepath="video3.mp4")
    sample3.frames[3] = fo.Frame(
        labels=fo.Classifications(
            classifications=[
                fo.Classification(label="cat"),
                fo.Classification(label="dog", age=51),
            ]
        )
    )

    sample4 = fo.Sample(filepath="video4.mp4")
    sample4.frames[4] = fo.Frame(
        labels=fo.Classifications(
            classifications=[
                fo.Classification(label="rabbit"),
                fo.Classification(label="squirrel", fluffy=True),
                fo.Classification(label="frog"),
            ]
        )
    )

    sample5 = fo.Sample(filepath="video5.mp4")

    dataset = fo.Dataset()
    dataset.add_samples([sample1, sample2, sample3, sample4, sample5])

    return dataset


class ViewSaveTests(unittest.TestCase):
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
        sample = view.first()

        self.assertEqual(dataset.count("frames"), 4)
        self.assertEqual(view.count("frames"), 1)
        self.assertEqual(len(sample.frames), 1)

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

        self.assertNotIn("classifications", dataset.get_field_schema())

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

    def test_concat(self):
        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(filepath="image1.jpg", field=1),
                fo.Sample(filepath="image2.jpg", field=2),
                fo.Sample(filepath="image3.jpg", field=3),
                fo.Sample(filepath="image4.jpg", field=4),
            ]
        )

        view1 = dataset.skip(0).limit(1)
        view2 = dataset.skip(1).limit(1)
        view3 = dataset.skip(2).limit(1)
        view4 = dataset.skip(3).limit(1)

        view = view1.concat(view2)

        self.assertEqual(len(view), 2)
        self.assertListEqual(view.values("field"), [1, 2])

        view = view1.concat(view2).concat(view3).concat(view4)

        self.assertEqual(len(view), 4)
        self.assertListEqual(view.values("field"), [1, 2, 3, 4])

    def test_exclude(self):
        result = list(self.dataset.exclude([self.sample1.id]))
        self.assertIs(len(result), 1)
        self.assertEqual(result[0].id, self.sample2.id)

    def _exclude_fields_setup(self):
        self.dataset.add_sample_field("exclude_fields_field1", fo.IntField)
        self.dataset.add_sample_field("exclude_fields_field2", fo.IntField)
        self.dataset.set_values(
            "exclude_fields_field1", [1] * len(self.dataset)
        )
        self.dataset.set_values(
            "exclude_fields_field2", [1] * len(self.dataset)
        )

    def _exclude_fields_teardown(self):
        self.dataset.delete_sample_fields(
            ["exclude_fields_field1", "exclude_fields_field2"]
        )

    def test_exclude_fields(self):
        self._exclude_fields_setup()
        default_fields = (
            "id",
            "filepath",
            "tags",
            "metadata",
            "created_at",
            "last_modified_at",
        )

        for default_field in default_fields:
            with self.assertRaises(ValueError):
                self.dataset.exclude_fields(default_field)

        for sample in self.dataset.exclude_fields(["exclude_fields_field1"]):
            self.assertIsNone(sample.selected_field_names)
            self.assertSetEqual(
                sample.excluded_field_names, {"exclude_fields_field1"}
            )
            with self.assertRaises(AttributeError):
                sample.exclude_fields_field1

            self.assertEqual(sample.exclude_fields_field2, 1)
        self._exclude_fields_teardown()

    def test_exclude_fields_multiple(self):
        samples = [
            fo.Sample(filepath="image1.jpg"),
            fo.Sample(
                filepath="image2.jpg",
                foo="bar",
                spam="eggs",
                ground_truth=fo.Classifications(
                    classifications=[
                        fo.Classification(
                            label="cat",
                            foo="bar",
                            spam="eggs",
                        )
                    ]
                ),
                predictions=fo.Classifications(
                    classifications=[
                        fo.Classification(
                            label="dog",
                            foo="baz",
                            spam="eggz",
                        )
                    ]
                ),
            ),
        ]

        dataset = fo.Dataset()
        dataset.add_samples(samples, dynamic=True)

        schema = dataset.get_field_schema()

        self.assertIn("foo", schema)
        self.assertIn("spam", schema)
        self.assertIn("ground_truth", schema)
        self.assertIn("predictions", schema)

        flat_schema = dataset.get_field_schema(flat=True)

        self.assertIn("foo", flat_schema)
        self.assertIn("spam", flat_schema)
        self.assertIn("ground_truth", flat_schema)
        self.assertIn("ground_truth.classifications", flat_schema)
        self.assertIn("ground_truth.classifications.label", flat_schema)
        self.assertIn("ground_truth.classifications.foo", flat_schema)
        self.assertIn("ground_truth.classifications.spam", flat_schema)
        self.assertIn("predictions", flat_schema)
        self.assertIn("predictions.classifications", flat_schema)
        self.assertIn("predictions.classifications.label", flat_schema)
        self.assertIn("predictions.classifications.foo", flat_schema)
        self.assertIn("predictions.classifications.spam", flat_schema)

        view = dataset.exclude_fields(["spam", "predictions"])

        schema = view.get_field_schema()

        self.assertIn("foo", schema)
        self.assertNotIn("spam", schema)
        self.assertIn("ground_truth", schema)
        self.assertNotIn("predictions", schema)

        flat_schema = view.get_field_schema(flat=True)

        self.assertIn("foo", flat_schema)
        self.assertNotIn("spam", flat_schema)
        self.assertIn("ground_truth", flat_schema)
        self.assertIn("ground_truth.classifications", flat_schema)
        self.assertIn("ground_truth.classifications.label", flat_schema)
        self.assertIn("ground_truth.classifications.foo", flat_schema)
        self.assertIn("ground_truth.classifications.spam", flat_schema)
        self.assertNotIn("predictions", flat_schema)
        self.assertNotIn("predictions.classifications", flat_schema)
        self.assertNotIn("predictions.classifications.label", flat_schema)
        self.assertNotIn("predictions.classifications.foo", flat_schema)
        self.assertNotIn("predictions.classifications.spam", flat_schema)

        sample = view.last()

        self.assertTrue(sample.has_field("foo"))
        self.assertFalse(sample.has_field("spam"))
        self.assertTrue(sample.has_field("ground_truth"))
        self.assertFalse(sample.has_field("predictions"))

        view = dataset.exclude_fields(
            ["foo", "predictions.classifications.foo"]
        ).exclude_fields(["spam", "predictions.classifications.spam"])

        schema = view.get_field_schema()

        self.assertNotIn("foo", schema)
        self.assertNotIn("spam", schema)
        self.assertIn("ground_truth", schema)
        self.assertIn("predictions", schema)

        flat_schema = view.get_field_schema(flat=True)

        self.assertNotIn("foo", flat_schema)
        self.assertNotIn("spam", flat_schema)
        self.assertIn("ground_truth", flat_schema)
        self.assertIn("ground_truth.classifications", flat_schema)
        self.assertIn("ground_truth.classifications.label", flat_schema)
        self.assertIn("ground_truth.classifications.foo", flat_schema)
        self.assertIn("ground_truth.classifications.spam", flat_schema)
        self.assertIn("predictions", flat_schema)
        self.assertIn("predictions.classifications.label", flat_schema)
        self.assertNotIn("predictions.classifications.foo", flat_schema)
        self.assertNotIn("predictions.classifications.spam", flat_schema)

        sample = view.last()

        self.assertFalse(sample.has_field("foo"))
        self.assertFalse(sample.has_field("spam"))
        self.assertTrue(sample.has_field("ground_truth"))
        self.assertIsNotNone(sample.ground_truth.classifications[0].foo)
        self.assertIsNotNone(sample.ground_truth.classifications[0].spam)
        self.assertTrue(sample.has_field("predictions"))
        with self.assertRaises(AttributeError):
            sample.predictions.classifications[0].foo
        with self.assertRaises(AttributeError):
            sample.predictions.classifications[0].spam

    def test_exclude_fields_stats(self):
        self._exclude_fields_setup()
        base_size = self.dataset.exclude_fields(
            ["exclude_fields_field1", "exclude_fields_field2"]
        ).stats()["samples_bytes"]
        excl1_size = self.dataset.exclude_fields(
            ["exclude_fields_field1"]
        ).stats()["samples_bytes"]
        total_size = self.dataset.stats()["samples_bytes"]
        self.assertLess(base_size, excl1_size)
        self.assertLess(excl1_size, total_size)
        self._exclude_fields_teardown()

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

    def test_exclude_frame_fields_stats(self):
        sample = fo.Sample(filepath="video.mp4")
        sample.frames[1] = fo.Frame(int_field=1)

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        excl_size = dataset.exclude_fields(["frames.int_field"]).stats()[
            "frames_bytes"
        ]
        total_size = dataset.stats()["frames_bytes"]
        self.assertLess(excl_size, total_size)

    def test_exclude_fields_meta_filter(self):
        self._exclude_fields_setup()
        dataset = self.dataset

        dataset.add_samples(
            [
                fo.Sample(
                    filepath="image1.jpg", ground_truth=fo.Classification()
                ),
                fo.Sample(
                    filepath="image3.jpg",
                    field_1=1,
                    predictions=fo.Detections(
                        detections=[fo.Detection(field_1=1)]
                    ),
                ),
                fo.Sample(
                    filepath="image4.jpg",
                    field_2=2,
                    predictions=fo.Detections(
                        detections=[fo.Detection(field_2=2)]
                    ),
                ),
            ]
        )
        dataset.add_sample_field("field_3", ftype=fo.StringField)

        field_1 = dataset.get_field("field_1")
        field_2 = dataset.get_field("field_2")
        field_3 = dataset.get_field("field_3")

        field_1.description = "this is a unique description by joe"
        field_2.description = "hello world test123"

        field_1.info = {
            "a": 12,
            "b": 24,
            "c": 36,
            "owner": "jill",
            "test": True,
            "d_1": {
                "e_2": {"f_3": "oo", "g_3": {"h_4": {"i_5": {"j_6": "nope"}}}}
            },
        }
        field_2.info = {
            "list": [1, 2, 3],
            "owner": "joe",
            "test": True,
            "other": "this is a unique info value",
            "date_created": "2020-01-01",
        }
        field_3.info = {"one": {"two": {"three": "test123"}}}

        field_1.save()
        field_2.save()
        field_3.save()

        # return everything on empty string
        view = dataset.exclude_fields(field_names=[], meta_filter="")
        fields = view.get_field_schema(flat=True)
        self.assertIn("field_1", fields)
        self.assertIn("field_2", fields)
        self.assertIn("field_3", fields)
        self.assertIn("ground_truth", fields)

        # returns everything on None
        view = dataset.exclude_fields(field_names=[], meta_filter=None)
        fields = view.get_field_schema(flat=True)
        self.assertIn("field_1", fields)
        self.assertIn("field_2", fields)
        self.assertIn("field_3", fields)
        self.assertIn("ground_truth", fields)

        # basic string match anywhere
        view = dataset.exclude_fields(field_names=[], meta_filter="unique")
        fields = view.get_field_schema(flat=True)
        self.assertNotIn("field_1", fields)
        self.assertNotIn("field_2", fields)
        self.assertIn("field_3", fields)
        self.assertIn("ground_truth", fields)

        # basic string match in info
        view = dataset.exclude_fields(
            field_names=[], meta_filter=dict(info="2020")
        )
        fields = view.get_field_schema(flat=True)
        self.assertIn("field_1", fields)
        self.assertNotIn("field_2", fields)
        self.assertIn("field_3", fields)
        self.assertIn("ground_truth", fields)

        # should bust the recursion limit (default is 1)
        view = dataset.exclude_fields(
            field_names=[], meta_filter=dict(j_6="nope")
        )
        fields = view.get_field_schema(flat=True)
        self.assertIn("field_1", fields)
        self.assertIn("field_2", fields)
        self.assertIn("field_3", fields)
        self.assertIn("ground_truth", fields)

        # basic string match anywhere
        view = dataset.exclude_fields(field_names=[], meta_filter="test123")
        fields = view.get_field_schema(flat=True)
        self.assertIn("field_1", fields)
        self.assertNotIn("field_2", fields)
        self.assertNotIn("field_3", fields)
        self.assertIn("ground_truth", fields)

        # match entire info with some additional selected fields
        view = dataset.exclude_fields(
            field_names=["ground_truth", "field_2"],
            meta_filter=dict(one=dict(two=dict(three="test123"))),
        )
        fields = view.get_field_schema(flat=True)
        self.assertIn("field_1", fields)
        self.assertNotIn("field_2", fields)
        self.assertNotIn("field_3", fields)
        self.assertNotIn("ground_truth", fields)

        # match entire info with no additional selected fields
        view = dataset.exclude_fields(
            field_names=[],
            meta_filter=dict(one=dict(two=dict(three="test123"))),
        )
        fields = view.get_field_schema(flat=True)
        self.assertIn("field_1", fields)
        self.assertIn("field_2", fields)
        self.assertNotIn("field_3", fields)
        self.assertIn("ground_truth", fields)

        view = dataset.exclude_fields(
            field_names="ground_truth",
            meta_filter=dict(one=dict(two=dict(three="test123"))),
        )
        fields = view.get_field_schema(flat=True)
        self.assertIn("field_1", fields)
        self.assertIn("field_2", fields)
        self.assertNotIn("field_3", fields)
        self.assertNotIn("ground_truth", fields)

        view = dataset.exclude_fields(field_names=[], meta_filter="joe")
        fields = view.get_field_schema(flat=True)
        self.assertNotIn("field_1", fields)
        self.assertNotIn("field_2", fields)
        self.assertIn("field_3", fields)
        self.assertIn("ground_truth", fields)

        view = dataset.exclude_fields(
            field_names=[], meta_filter=dict(owner="joe")
        )
        fields = view.get_field_schema(flat=True)
        self.assertIn("field_1", fields)
        self.assertNotIn("field_2", fields)
        self.assertIn("field_3", fields)
        self.assertIn("ground_truth", fields)

        # match a boolean value
        view = dataset.exclude_fields(
            field_names=[], meta_filter=dict(test=True)
        )
        fields = view.get_field_schema(flat=True)
        self.assertNotIn("field_1", fields)
        self.assertNotIn("field_2", fields)
        self.assertIn("field_3", fields)
        self.assertIn("ground_truth", fields)

        # match a boolean value
        meta_filter = {"description": "joe"}
        view = dataset.exclude_fields(field_names=[], meta_filter=meta_filter)
        dataset.save_view("joe_view", view=view)
        fields = view.get_field_schema(flat=True)
        self.assertNotIn("field_1", fields)
        self.assertIn("field_2", fields)
        self.assertIn("field_3", fields)
        self.assertIn("ground_truth", fields)

        pre_length = len(view)

        # add another field that would match the previous view
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="image4.jpg",
                    field_4=4,
                    predictions=fo.Detections(
                        detections=[fo.Detection(field_2=2)]
                    ),
                ),
            ]
        )
        field_4 = dataset.get_field("field_4")
        field_4.description = "this was added by joe as well"
        field_4.save()

        # make sure the new field is also excluded
        view = dataset.load_saved_view("joe_view")
        fields = view.get_field_schema(flat=True)

        self.assertNotIn("field_1", fields)
        self.assertIn("field_2", fields)
        self.assertIn("field_3", fields)
        self.assertNotIn("field_4", fields)
        self.assertIn("ground_truth", fields)

        self.assertEqual(len(view), pre_length + 1)

        self._exclude_fields_teardown()

    def test_exists(self):
        sample1 = fo.Sample(filepath="video1.mp4", index=1)
        sample1.frames[1] = fo.Frame()

        sample2 = fo.Sample(filepath="video2.mp4", foo="bar", index=2)
        sample2.frames[1] = fo.Frame(foo="bar")

        sample3 = fo.Sample(filepath="video3.mp4", index=3)

        dataset = fo.Dataset()
        dataset.add_samples([sample1, sample2, sample3])

        view = dataset.exists("foo")

        self.assertEqual(view.values("index"), [2])

        view = dataset.exists("foo", bool=False)

        self.assertEqual(view.values("index"), [1, 3])

        view = dataset.exists("frames")

        self.assertEqual(view.values("index"), [1, 2])

        view = dataset.exists("frames", bool=False)

        self.assertEqual(view.values("index"), [3])

        view = dataset.exists("frames.foo")

        self.assertEqual(view.values("index"), [2])
        self.assertEqual(view.count("frames"), 1)

        view = dataset.exists("frames.foo", bool=False)

        self.assertEqual(view.values("index"), [1, 3])
        self.assertEqual(view.count("frames"), 1)

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

    def test_filter_keypoints_embedded_document(self):
        sample1 = fo.Sample(
            filepath="image1.jpg",
            dynamic=fo.DynamicEmbeddedDocument(
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
            ),
        )

        sample2 = fo.Sample(filepath="image2.jpg")

        dataset = fo.Dataset()
        dataset.add_samples([sample1, sample2], dynamic=True)

        dataset.default_skeleton = fo.KeypointSkeleton(
            labels=["nose", "left eye", "right eye", "left ear", "right ear"],
            edges=[[0, 1, 2, 0], [0, 3], [0, 4]],
        )

        count_nans = lambda points: len([p for p in points if np.isnan(p[0])])

        #
        # Test `Keypoint` sample fields
        #

        # only_matches=True
        view = dataset.filter_keypoints(
            "dynamic.kp", filter=F("confidence") > 0.75
        )
        self.assertEqual(len(view), 1)
        sample = view.first()
        self.assertEqual(len(sample["dynamic.kp"].points), 5)
        self.assertEqual(count_nans(sample["dynamic.kp"].points), 3)

        # only_matches=False
        view = dataset.filter_keypoints(
            "dynamic.kp", filter=F("confidence") > 0.75, only_matches=False
        )
        self.assertEqual(len(view), 2)
        sample = view.first()
        self.assertEqual(len(sample["dynamic.kp"].points), 5)
        self.assertEqual(count_nans(sample["dynamic.kp"].points), 3)

        # view with no matches
        view = dataset.filter_keypoints(
            "dynamic.kp", filter=F("confidence") > 0.95
        )
        self.assertEqual(len(view), 0)

        # only_matches=True
        view = dataset.filter_keypoints(
            "dynamic.kp", labels=["left eye", "right eye"]
        )
        self.assertEqual(len(view), 1)
        sample = view.first()
        self.assertEqual(len(sample["dynamic.kp"].points), 5)
        self.assertEqual(count_nans(sample["dynamic.kp"].points), 3)

        # only_matches=False
        view = dataset.filter_keypoints(
            "dynamic.kp", labels=["left eye", "right eye"], only_matches=False
        )
        self.assertEqual(len(view), 2)
        sample = view.first()
        self.assertEqual(len(sample["dynamic.kp"].points), 5)
        self.assertEqual(count_nans(sample["dynamic.kp"].points), 3)

        # view with no matches
        view = dataset.filter_keypoints("dynamic.kp", labels=[])
        self.assertEqual(len(view), 0)

        #
        # Test `Keypoints` sample fields
        #

        # only_matches=True
        view = dataset.filter_keypoints(
            "dynamic.kps", filter=F("confidence") > 0.75
        )
        self.assertEqual(len(view), 1)
        self.assertEqual(view.count("dynamic.kps.keypoints"), 1)
        sample = view.first()
        self.assertEqual(len(sample["dynamic.kps"].keypoints[0].points), 5)
        self.assertEqual(
            count_nans(sample["dynamic.kps"].keypoints[0].points), 3
        )

        # only_matches=False
        view = dataset.filter_keypoints(
            "dynamic.kps", filter=F("confidence") > 0.75, only_matches=False
        )
        self.assertEqual(len(view), 2)
        self.assertEqual(view.count("dynamic.kps.keypoints"), 2)
        sample = view.first()
        self.assertEqual(len(sample["dynamic.kps"].keypoints[0].points), 5)
        self.assertEqual(
            count_nans(sample["dynamic.kps"].keypoints[0].points), 3
        )

        # view with no matches
        view = dataset.filter_keypoints(
            "dynamic.kps", filter=F("confidence") > 0.95
        )
        self.assertEqual(len(view), 0)

        # only_matches=True
        view = dataset.filter_keypoints(
            "dynamic.kps", labels=["left eye", "right eye"]
        )
        self.assertEqual(len(view), 1)
        self.assertEqual(view.count("dynamic.kps.keypoints"), 1)
        sample = view.first()
        self.assertEqual(len(sample["dynamic.kps"].keypoints[0].points), 5)
        self.assertEqual(
            count_nans(sample["dynamic.kps"].keypoints[0].points), 3
        )

        # only_matches=False
        view = dataset.filter_keypoints(
            "dynamic.kps", labels=["left eye", "right eye"], only_matches=False
        )
        self.assertEqual(len(view), 2)
        self.assertEqual(view.count("dynamic.kps.keypoints"), 2)
        sample = view.first()
        self.assertEqual(len(sample["dynamic.kps"].keypoints[0].points), 5)
        self.assertEqual(
            count_nans(sample["dynamic.kps"].keypoints[0].points), 3
        )

        # view with no matches
        view = dataset.filter_keypoints("dynamic.kps", labels=[])
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

        lma1 = self.dataset.values("last_modified_at")
        view.tag_samples("test")
        tags = self.dataset.count_values("tags")
        lma2 = self.dataset.values("last_modified_at")
        self.assertDictEqual(tags, {"test": 1})
        self.assertListEqual(
            [i < j for i, j in zip(lma1, lma2)],
            [True, False],
        )

        lma1 = self.dataset.values("last_modified_at")
        view.untag_samples("test")
        tags = self.dataset.count_values("tags")
        lma2 = self.dataset.values("last_modified_at")
        self.assertDictEqual(tags, {})
        self.assertListEqual(
            [i < j for i, j in zip(lma1, lma2)],
            [True, False],
        )

    def test_tag_samples_none(self):
        view = self.dataset[:2]

        view.clear_sample_field("tags")

        for tags in view.values("tags"):
            self.assertIsNone(tags)

        view.untag_samples("test")
        view.untag_samples(["test1", "test2"])

        counts = view.count_sample_tags()
        self.assertDictEqual(counts, {})

        view.tag_samples("test")
        view.tag_samples(["test1", "test2"])

        counts = view.count_sample_tags()
        self.assertDictEqual(counts, {"test": 2, "test1": 2, "test2": 2})

        view.set_field("tags", []).save()

        for tags in view.values("tags"):
            self.assertListEqual(tags, [])

    def test_tag_labels(self):
        self._setUp_classification()
        self._setUp_detections()

        view = self.dataset.filter_labels("test_clf", F("confidence") > 0.95)
        num_samples = len(view)
        self.assertEqual(num_samples, 1)

        lma1 = self.dataset.values("last_modified_at")
        view.tag_labels("test", "test_clf")
        tags = self.dataset.count_label_tags("test_clf")
        lma2 = self.dataset.values("last_modified_at")
        self.assertDictEqual(tags, {"test": 1})
        self.assertListEqual(
            [i < j for i, j in zip(lma1, lma2)],
            [False, True],
        )

        lma1 = self.dataset.values("last_modified_at")
        view.untag_labels("test", "test_clf")
        tags = self.dataset.count_label_tags("test_clf")
        lma2 = self.dataset.values("last_modified_at")
        self.assertDictEqual(tags, {})
        self.assertListEqual(
            [i < j for i, j in zip(lma1, lma2)],
            [False, True],
        )

        view = self.dataset.filter_labels("test_dets", F("confidence") > 0.7)
        num_samples = len(view)
        num_labels = view.count("test_dets.detections")
        self.assertEqual(num_samples, 2)
        self.assertEqual(num_labels, 3)

        lma1 = self.dataset.values("last_modified_at")
        view.tag_labels("test", "test_dets")
        tags = self.dataset.count_label_tags("test_dets")
        lma2 = self.dataset.values("last_modified_at")
        self.assertDictEqual(tags, {"test": 3})
        self.assertListEqual(
            [i < j for i, j in zip(lma1, lma2)],
            [True, True],
        )

        lma1 = self.dataset.values("last_modified_at")
        view.untag_labels("test", "test_dets")
        tags = self.dataset.count_label_tags("test_dets")
        lma2 = self.dataset.values("last_modified_at")
        self.assertDictEqual(tags, {})
        self.assertListEqual(
            [i < j for i, j in zip(lma1, lma2)],
            [True, True],
        )

    def test_tag_labels_none(self):
        self._setUp_classification()
        self._setUp_detections()

        # Test classifications
        view = self.dataset.filter_labels("test_clf", F("confidence") > 0.95)
        view.clear_sample_field("test_clf.tags")

        for tags in view.values("test_clf.tags"):
            self.assertIsNone(tags)

        view.untag_labels("test", label_fields="test_clf")
        view.untag_labels(["test1", "test2"], label_fields="test_clf")

        counts = view.count_label_tags()
        self.assertDictEqual(counts, {})

        view.tag_labels("test", label_fields="test_clf")
        view.tag_labels(["test1", "test2"], label_fields="test_clf")

        counts = view.count_label_tags()
        self.assertDictEqual(counts, {"test": 1, "test1": 1, "test2": 1})

        view.set_field("test_clf.tags", []).save()

        for tags in view.values("test_clf.tags"):
            self.assertListEqual(tags, [])

        # Test detections
        view = self.dataset.filter_labels("test_dets", F("confidence") > 0.7)
        view.clear_sample_field("test_dets.detections.tags")

        for tags in view.values("test_dets.detections.tags", unwind=True):
            self.assertIsNone(tags)

        view.untag_labels("test", label_fields="test_dets")
        view.untag_labels(["test1", "test2"], label_fields="test_dets")

        counts = view.count_label_tags()
        self.assertDictEqual(counts, {})

        view.tag_labels("test", label_fields="test_dets")
        view.tag_labels(["test1", "test2"], label_fields="test_dets")

        counts = view.count_label_tags()
        self.assertDictEqual(counts, {"test": 3, "test1": 3, "test2": 3})

        view.set_field("test_dets.detections.tags", []).save()

        for tags in view.values("test_dets.detections.tags", unwind=True):
            self.assertListEqual(tags, [])

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

        # Test query syntax

        view = dataset.match(
            {"frames.test_clfs.classifications.label": "friend"}
        )
        self.assertEqual(len(view), 1)

    def test_match_tags(self):
        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(filepath="image1.png", tags=["train"], i=1),
                fo.Sample(filepath="image2.png", tags=["test"], i=2),
                fo.Sample(filepath="image3.png", tags=["train", "test"], i=3),
                fo.Sample(filepath="image4.png", i=4),
            ]
        )

        view = dataset.match_tags("test")
        indexes = view.values("i")

        self.assertEqual(len(view), 2)
        self.assertListEqual(indexes, [2, 3])

        view = dataset.match_tags("test", bool=False)
        indexes = view.values("i")

        self.assertEqual(len(view), 2)
        self.assertListEqual(indexes, [1, 4])

        view = dataset.match_tags(["test", "train"])
        indexes = view.values("i")

        self.assertEqual(len(view), 3)
        self.assertListEqual(indexes, [1, 2, 3])

        view = dataset.match_tags(["test", "train"], all=True)
        indexes = view.values("i")

        self.assertEqual(len(view), 1)
        self.assertListEqual(indexes, [3])

        view = dataset.match_tags(["test", "train"], bool=False)
        indexes = view.values("i")

        self.assertEqual(len(view), 1)
        self.assertListEqual(indexes, [4])

        view = dataset.match_tags(["test", "train"], bool=False, all=True)
        indexes = view.values("i")

        self.assertEqual(len(view), 3)
        self.assertListEqual(indexes, [1, 2, 4])

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

    def test_select_by(self):
        filepaths = self.dataset.values("filepath")

        values = [filepaths[1], filepaths[0]]
        unordered_values = [filepaths[0], filepaths[1]]

        result = self.dataset.select_by("filepath", values)

        self.assertEqual(len(result), 2)
        self.assertEqual(result.values("filepath"), unordered_values)

        ids = self.dataset.values("id")

        values = [ids[1], ids[0]]
        unordered_values = [ids[0], ids[1]]

        result = self.dataset.select_by("id", values)

        self.assertEqual(len(result), 2)
        self.assertEqual(result.values("id"), unordered_values)

    def test_select_by_ordered(self):
        filepaths = self.dataset.values("filepath")

        values = [filepaths[1], filepaths[0]]

        result = self.dataset.select_by("filepath", values, ordered=True)

        self.assertEqual(len(result), 2)
        self.assertEqual(result.values("filepath"), values)

        ids = self.dataset.values("id")

        values = [ids[1], ids[0]]

        result = self.dataset.select_by("id", values, ordered=True)

        self.assertEqual(len(result), 2)
        self.assertEqual(result.values("id"), values)

    def _select_field_setup(self):
        self.dataset.add_sample_field("select_fields_field", fo.IntField)
        self.dataset.set_values("select_fields_field", [1] * len(self.dataset))

    def _select_field_teardown(self):
        self.dataset.delete_sample_field("select_fields_field")

    def test_select_fields(self):
        self._select_field_setup()
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
        self._select_field_teardown()

    def test_select_fields_multiple(self):
        samples = [
            fo.Sample(filepath="image1.jpg"),
            fo.Sample(
                filepath="image2.jpg",
                foo="bar",
                spam="eggs",
                ground_truth=fo.Classifications(
                    classifications=[
                        fo.Classification(
                            label="cat",
                            foo="bar",
                            spam="eggs",
                        )
                    ]
                ),
                predictions=fo.Classifications(
                    classifications=[
                        fo.Classification(
                            label="dog",
                            foo="baz",
                            spam="eggz",
                        )
                    ]
                ),
            ),
        ]

        dataset = fo.Dataset()
        dataset.add_samples(samples, dynamic=True)

        schema = dataset.get_field_schema()

        self.assertIn("foo", schema)
        self.assertIn("spam", schema)
        self.assertIn("ground_truth", schema)
        self.assertIn("predictions", schema)

        flat_schema = dataset.get_field_schema(flat=True)

        self.assertIn("foo", flat_schema)
        self.assertIn("spam", flat_schema)
        self.assertIn("ground_truth", flat_schema)
        self.assertIn("ground_truth.classifications", flat_schema)
        self.assertIn("ground_truth.classifications.label", flat_schema)
        self.assertIn("ground_truth.classifications.foo", flat_schema)
        self.assertIn("ground_truth.classifications.spam", flat_schema)
        self.assertIn("predictions", flat_schema)
        self.assertIn("predictions.classifications", flat_schema)
        self.assertIn("predictions.classifications.label", flat_schema)
        self.assertIn("predictions.classifications.foo", flat_schema)
        self.assertIn("predictions.classifications.spam", flat_schema)

        view = dataset.select_fields(["foo", "ground_truth"])

        schema = view.get_field_schema()

        self.assertIn("foo", schema)
        self.assertNotIn("spam", schema)
        self.assertIn("ground_truth", schema)
        self.assertNotIn("predictions", schema)

        flat_schema = view.get_field_schema(flat=True)

        self.assertIn("foo", flat_schema)
        self.assertNotIn("spam", flat_schema)
        self.assertIn("ground_truth", flat_schema)
        self.assertIn("ground_truth.classifications", flat_schema)
        self.assertIn("ground_truth.classifications.label", flat_schema)
        self.assertIn("ground_truth.classifications.foo", flat_schema)
        self.assertIn("ground_truth.classifications.spam", flat_schema)
        self.assertNotIn("predictions", flat_schema)
        self.assertNotIn("predictions.classifications", flat_schema)
        self.assertNotIn("predictions.classifications.label", flat_schema)
        self.assertNotIn("predictions.classifications.foo", flat_schema)
        self.assertNotIn("predictions.classifications.spam", flat_schema)

        sample = view.last()

        self.assertTrue(sample.has_field("foo"))
        self.assertFalse(sample.has_field("spam"))
        self.assertTrue(sample.has_field("ground_truth"))
        self.assertFalse(sample.has_field("predictions"))

        # Can't select disjoint fields
        with self.assertRaises(ValueError):
            _ = dataset.select_fields("foo").select_fields(
                "ground_truth.classifications.foo"
            )

        view = (
            dataset.select_fields(["foo", "ground_truth"])
            .select_fields(["foo", "ground_truth.classifications"])
            .select_fields("ground_truth.classifications.foo")
        )

        schema = view.get_field_schema()

        self.assertNotIn("foo", schema)
        self.assertNotIn("spam", schema)
        self.assertIn("ground_truth", schema)
        self.assertNotIn("predictions", schema)

        flat_schema = view.get_field_schema(flat=True)

        self.assertNotIn("foo", flat_schema)
        self.assertNotIn("spam", flat_schema)
        self.assertIn("ground_truth", flat_schema)
        self.assertIn("ground_truth.classifications", flat_schema)
        self.assertIn("ground_truth.classifications.label", flat_schema)
        self.assertIn("ground_truth.classifications.foo", flat_schema)
        self.assertNotIn("ground_truth.classifications.spam", flat_schema)
        self.assertNotIn("predictions", flat_schema)
        self.assertNotIn("predictions.classifications.label", flat_schema)
        self.assertNotIn("predictions.classifications.foo", flat_schema)
        self.assertNotIn("predictions.classifications.spam", flat_schema)

        sample = view.last()

        self.assertFalse(sample.has_field("foo"))
        self.assertFalse(sample.has_field("spam"))
        self.assertTrue(sample.has_field("ground_truth"))
        self.assertIsNotNone(sample.ground_truth.classifications[0].foo)
        with self.assertRaises(AttributeError):
            sample.ground_truth.classifications[0].spam
        self.assertFalse(sample.has_field("predictions"))

    def test_select_fields_stats(self):
        self._select_field_setup()

        base_size = self.dataset.select_fields().stats()["samples_bytes"]
        total_size = self.dataset.stats()["samples_bytes"]
        self.assertLess(base_size, total_size)
        self._select_field_teardown()

    def test_select_fields_meta_filter(self):
        self._select_field_setup()
        dataset = self.dataset

        dataset.add_samples(
            [
                fo.Sample(
                    filepath="image1.jpg", ground_truth=fo.Classification()
                ),
                fo.Sample(
                    filepath="image3.jpg",
                    field_1=1,
                    predictions=fo.Detections(
                        detections=[fo.Detection(field_1=1)]
                    ),
                ),
                fo.Sample(
                    filepath="image4.jpg",
                    field_2=2,
                    predictions=fo.Detections(
                        detections=[fo.Detection(field_2=2)]
                    ),
                ),
            ]
        )

        sample4 = fo.Sample(
            filepath="image5.jpg",
            field_parent=fo.Classifications(
                classifications=[
                    fo.Classification(label="rabbit"),
                    fo.Classification(label="squirrel", fluffy=True),
                    fo.Classification(label="frog"),
                ]
            ),
        )

        dataset.add_sample(sample4)

        dataset.add_sample_field("field_3", ftype=fo.StringField)
        dataset.add_sample_field("field_string", ftype=fo.StringField)
        dataset.add_sample_field("field_array", ftype=fo.ArrayField)
        dataset.add_sample_field("field_boolean", ftype=fo.BooleanField)
        dataset.add_sample_field("field_classes", ftype=fo.ClassesField)
        dataset.add_sample_field("field_date", ftype=fo.DateField)
        dataset.add_sample_field("field_dict", ftype=fo.DictField)

        field_1 = dataset.get_field("field_1")
        field_2 = dataset.get_field("field_2")
        field_3 = dataset.get_field("field_3")

        field_child = dataset.get_field("field_parent.classifications.label")
        field_child.description = (
            "this is a child field that should return when including nested "
            "fields"
        )
        field_child.info = {"isChild": True}
        field_child.save()

        field_1.description = "this is a unique description by joe"
        field_2.description = "hello world test123"

        field_1.info = {
            "a": 12,
            "b": 24,
            "c": 36,
            "owner": "jill",
            "test": True,
            "d_1": {
                "e_2": {"f_3": "oo", "g_3": {"h_4": {"i_5": {"j_6": "nope"}}}}
            },
        }
        field_2.info = {
            "list": [1, 2, 3],
            "owner": "joe",
            "test": True,
            "other": "this is a unique info value",
            "date_created": "2020-01-01",
        }
        field_3.info = {"one": {"two": {"three": "test123"}}}

        field_1.save()
        field_2.save()
        field_3.save()

        # doesn't return anything on empty string
        view = dataset.select_fields(meta_filter="")
        fields = view.get_field_schema(flat=True)
        self.assertNotIn("field_1", fields)
        self.assertNotIn("field_2", fields)
        self.assertNotIn("field_3", fields)
        self.assertNotIn("ground_truth", fields)

        # returns everything on None
        view = dataset.select_fields(meta_filter=None)
        fields = view.get_field_schema(flat=True)
        self.assertNotIn("field_1", fields)
        self.assertNotIn("field_2", fields)
        self.assertNotIn("field_3", fields)
        self.assertNotIn("ground_truth", fields)

        # basic string match anywhere
        view = dataset.select_fields(meta_filter="unique")
        fields = view.get_field_schema(flat=True)
        self.assertIn("field_1", fields)
        self.assertIn("field_2", fields)
        self.assertNotIn("field_3", fields)
        self.assertNotIn("ground_truth", fields)

        # basic string match anywhere
        view = dataset.select_fields(meta_filter={"any": "unique"})
        fields = view.get_field_schema(flat=True)
        self.assertIn("field_1", fields)
        self.assertIn("field_2", fields)
        self.assertNotIn("field_3", fields)
        self.assertNotIn("ground_truth", fields)

        # search in nested fields
        view = dataset.select_fields(
            meta_filter={"info.isChild": True, "include_nested_fields": True}
        )
        fields = view.get_field_schema(flat=True)
        self.assertIn("field_parent.classifications.label", fields)
        self.assertIn("field_parent.classifications", fields)
        self.assertIn("field_parent", fields)
        self.assertNotIn("field_1", fields)
        self.assertNotIn("field_2", fields)
        self.assertNotIn("field_3", fields)
        self.assertNotIn("ground_truth", fields)

        view = dataset.select_fields(meta_filter={"info.isChild": True})
        fields = view.get_field_schema(flat=True)
        self.assertNotIn("field_parent.classifications.label", fields)
        self.assertNotIn("field_parent.classifications", fields)
        self.assertNotIn("field_parent", fields)
        self.assertNotIn("field_1", fields)
        self.assertNotIn("field_2", fields)
        self.assertNotIn("field_3", fields)
        self.assertNotIn("ground_truth", fields)

        # finds fields based on type
        view = dataset.select_fields(meta_filter={"type": fo.BooleanField})
        fields = view.get_field_schema(flat=True)
        self.assertIn("field_boolean", fields)
        self.assertNotIn("field_1", fields)
        self.assertNotIn("field_2", fields)
        self.assertNotIn("field_3", fields)
        self.assertNotIn("ground_truth", fields)

        # finds fields based on type as string
        view = dataset.select_fields(meta_filter={"type": "BooleanField"})
        fields = view.get_field_schema(flat=True)
        self.assertIn("field_boolean", fields)
        self.assertNotIn("field_1", fields)
        self.assertNotIn("field_2", fields)
        self.assertNotIn("field_3", fields)
        self.assertNotIn("ground_truth", fields)

        # finds fields based on EmbeddedDocumentField.document-type
        view = dataset.select_fields(meta_filter={"type": Classification})
        fields = view.get_field_schema(flat=True)
        self.assertNotIn("field_parent", fields)
        self.assertNotIn("field_1", fields)
        self.assertNotIn("field_2", fields)
        self.assertNotIn("field_3", fields)
        self.assertIn("ground_truth", fields)

        # finds fields based on EmbeddedDocumentField.document-type as string
        view = dataset.select_fields(meta_filter={"type": "Classification"})
        fields = view.get_field_schema(flat=True)
        self.assertNotIn("field_parent", fields)
        self.assertNotIn("field_1", fields)
        self.assertNotIn("field_2", fields)
        self.assertNotIn("field_3", fields)
        self.assertIn("ground_truth", fields)

        view = dataset.select_fields(meta_filter={"type": Classifications})
        fields = view.get_field_schema(flat=True)
        self.assertIn("field_parent", fields)
        self.assertNotIn("field_1", fields)
        self.assertNotIn("field_2", fields)
        self.assertNotIn("field_3", fields)
        self.assertNotIn("ground_truth", fields)

        # basic string match in info
        view = dataset.select_fields(meta_filter=dict(info="2020"))
        fields = view.get_field_schema(flat=True)
        self.assertNotIn("field_1", fields)
        self.assertIn("field_2", fields)
        self.assertNotIn("field_3", fields)
        self.assertNotIn("ground_truth", fields)

        view = dataset.select_fields(meta_filter=dict(j_6="nope"))
        fields = view.get_field_schema(flat=True)
        self.assertNotIn("field_1", fields)
        self.assertNotIn("field_2", fields)
        self.assertNotIn("field_3", fields)
        self.assertNotIn("ground_truth", fields)

        # basic string match anywhere
        view = dataset.select_fields(meta_filter="test123")
        fields = view.get_field_schema(flat=True)
        self.assertNotIn("field_1", fields)
        self.assertIn("field_2", fields)
        self.assertIn("field_3", fields)
        self.assertNotIn("ground_truth", fields)

        # match entire info with some additional selected fields
        view = dataset.select_fields(
            ["ground_truth", "field_2"],
            meta_filter=dict(one=dict(two=dict(three="test123"))),
        )
        fields = view.get_field_schema(flat=True)
        self.assertNotIn("field_1", fields)
        self.assertIn("field_2", fields)
        self.assertIn("field_3", fields)
        self.assertIn("ground_truth", fields)

        # match entire info with no additional selected fields
        view = dataset.select_fields(
            meta_filter=dict(one=dict(two=dict(three="test123")))
        )
        fields = view.get_field_schema(flat=True)
        self.assertNotIn("field_1", fields)
        self.assertNotIn("field_2", fields)
        self.assertIn("field_3", fields)
        self.assertNotIn("ground_truth", fields)

        view = dataset.select_fields(
            "ground_truth",
            meta_filter=dict(one=dict(two=dict(three="test123"))),
        )
        fields = view.get_field_schema(flat=True)
        self.assertNotIn("field_1", fields)
        self.assertNotIn("field_2", fields)
        self.assertIn("field_3", fields)
        self.assertIn("ground_truth", fields)

        view = dataset.select_fields(meta_filter="joe")
        fields = view.get_field_schema(flat=True)
        self.assertIn("field_1", fields)
        self.assertIn("field_2", fields)
        self.assertNotIn("field_3", fields)
        self.assertNotIn("ground_truth", fields)

        view = dataset.select_fields(meta_filter=dict(owner="joe"))
        fields = view.get_field_schema(flat=True)
        self.assertNotIn("field_1", fields)
        self.assertIn("field_2", fields)
        self.assertNotIn("field_3", fields)
        self.assertNotIn("ground_truth", fields)

        view = dataset.select_fields(meta_filter={"info.owner": "joe"})
        fields = view.get_field_schema(flat=True)
        self.assertNotIn("field_1", fields)
        self.assertIn("field_2", fields)
        self.assertNotIn("field_3", fields)
        self.assertNotIn("ground_truth", fields)

        # match a boolean value
        view = dataset.select_fields(meta_filter=dict(test=True))
        fields = view.get_field_schema(flat=True)
        self.assertIn("field_1", fields)
        self.assertIn("field_2", fields)
        self.assertNotIn("field_3", fields)
        self.assertNotIn("ground_truth", fields)

        # match a boolean value
        meta_filter = {"description": "joe"}
        view = dataset.select_fields(meta_filter=meta_filter)
        dataset.save_view("joe_view", view=view)
        fields = view.get_field_schema(flat=True)
        self.assertIn("field_1", fields)
        self.assertNotIn("field_2", fields)
        self.assertNotIn("field_3", fields)
        self.assertNotIn("ground_truth", fields)

        pre_length = len(view)

        # add another field that would match the previous view
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="image4.jpg",
                    field_4=4,
                    predictions=fo.Detections(
                        detections=[fo.Detection(field_2=2)]
                    ),
                ),
            ]
        )
        field_4 = dataset.get_field("field_4")
        field_4.description = "this was added by joe as well"
        field_4.save()

        # make sure the new field comes back in the schema as well
        view = dataset.load_saved_view("joe_view")
        fields = view.get_field_schema(flat=True)

        self.assertIn("field_1", fields)
        self.assertNotIn("field_2", fields)
        self.assertNotIn("field_3", fields)
        self.assertIn("field_4", fields)
        self.assertNotIn("ground_truth", fields)

        self.assertEqual(len(view), pre_length + 1)

        self._select_field_teardown()

    def test_select_fields_point_clouds(self):
        group = fo.Group()

        sample1 = fo.Sample(
            filepath="image.jpg",
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="cat", bounding_box=[0, 0, 1, 1])
                ]
            ),
            group=group.element("image"),
        )

        sample2 = fo.Sample(
            filepath="point-cloud.pcd",
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(
                        label="dog",
                        location=[0, 0, 0],
                        dimensions=[1, 1, 1],
                        rotation=[0, 0, 0],
                    )
                ]
            ),
            group=group.element("pcd"),
        )

        dataset = fo.Dataset()
        dataset.add_samples([sample1, sample2])

        # This should treat `location`, `dimensions`, and `rotation` as default
        view = dataset.select_fields("ground_truth.detections.label")

        view.group_slice = "image"
        sample = view.first()

        self.assertEqual(
            len(sample.ground_truth.detections[0].bounding_box), 4
        )

        view.group_slice = "pcd"
        sample = view.first()

        self.assertEqual(len(sample.ground_truth.detections[0].location), 3)
        self.assertEqual(len(sample.ground_truth.detections[0].dimensions), 3)
        self.assertEqual(len(sample.ground_truth.detections[0].rotation), 3)

        dataset.add_sample_field(
            "ground_truth.detections.location",
            fo.ListField,
            subfield=fo.FloatField,
        )
        dataset.add_sample_field(
            "ground_truth.detections.dimensions",
            fo.ListField,
            subfield=fo.FloatField,
        )
        dataset.add_sample_field(
            "ground_truth.detections.rotation",
            fo.ListField,
            subfield=fo.FloatField,
        )

        # This should treat `location`, `dimensions`, and `rotation` as default
        # And they should exist in the view's schema
        view = dataset.select_fields("ground_truth.detections.label")

        view.group_slice = "pcd"
        schema = view.get_field_schema(flat=True)

        self.assertIn("ground_truth.detections.location", schema)
        self.assertIn("ground_truth.detections.dimensions", schema)
        self.assertIn("ground_truth.detections.rotation", schema)

        sample = view.first()

        self.assertEqual(len(sample.ground_truth.detections[0].location), 3)
        self.assertEqual(len(sample.ground_truth.detections[0].dimensions), 3)
        self.assertEqual(len(sample.ground_truth.detections[0].rotation), 3)

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

    def test_sort_by_indexes(self):
        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(filepath="image1.jpg", foo="spam", field=2),
                fo.Sample(filepath="image2.jpg", foo="spam", field=1),
                fo.Sample(filepath="image3.jpg", foo="bar", field=3),
            ]
        )

        view1 = dataset.sort_by("field")

        self.assertListEqual(view1.values("field"), [1, 2, 3])
        self.assertIn("field", dataset.list_indexes())

        view2 = dataset.sort_by([("foo", 1), ("field", 1)])

        self.assertListEqual(view2.values("foo"), ["bar", "spam", "spam"])
        self.assertListEqual(view2.values("field"), [3, 1, 2])
        self.assertIn("foo_1_field_1", dataset.list_indexes())

        also_view2 = fo.DatasetView._build(dataset, view2._serialize())

        self.assertListEqual(also_view2.values("foo"), ["bar", "spam", "spam"])
        self.assertListEqual(also_view2.values("field"), [3, 1, 2])

        dataset2 = dataset.clone()

        self.assertIn("field", dataset2.list_indexes())
        self.assertIn("foo_1_field_1", dataset2.list_indexes())

        view3 = dataset2.sort_by(F("field"))

        self.assertListEqual(view3.values("field"), [1, 2, 3])
        self.assertIn("field", dataset2.list_indexes())

        view4 = dataset2.sort_by([(F("foo"), 1), (F("field"), 1)])

        self.assertListEqual(view4.values("foo"), ["bar", "spam", "spam"])
        self.assertListEqual(view4.values("field"), [3, 1, 2])
        self.assertIn("foo_1_field_1", dataset2.list_indexes())

        also_view4 = fo.DatasetView._build(dataset2, view4._serialize())

        self.assertListEqual(also_view4.values("foo"), ["bar", "spam", "spam"])
        self.assertListEqual(also_view4.values("field"), [3, 1, 2])

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

    def test_views_with_frozen_expressions(self):
        sample1 = fo.Sample(filepath="video1.mp4")
        sample1.frames[1] = fo.Frame(
            detections=fo.Detections(
                detections=[
                    fo.Detection(
                        label="vehicle",
                        bounding_box=[0.2, 0.2, 0.2, 0.2],
                    )
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
                    )
                ]
            )
        )
        sample1.frames[4] = fo.Frame(
            detections=fo.Detections(
                detections=[
                    fo.Detection(
                        label="vehicle",
                        bounding_box=[0.2, 0.2, 0.2, 0.2],
                    )
                ]
            )
        )
        sample1.frames[5] = fo.Frame()
        sample1.frames[6] = fo.Frame(
            detections=fo.Detections(
                detections=[
                    fo.Detection(
                        label="vehicle",
                        bounding_box=[0.2, 0.2, 0.2, 0.2],
                    )
                ]
            )
        )

        sample2 = fo.Sample(filepath="video2.mp4")
        sample2.frames[1] = fo.Frame()

        sample3 = fo.Sample(filepath="video3.mp4")

        dataset = fo.Dataset()
        dataset.add_samples([sample1, sample2, sample3])

        vehicles = F("detections.detections").filter(F("label") == "vehicle")
        clips = dataset.to_clips(vehicles.length() >= 2)

        dataset.save_view("clips", clips)

        also_clips = dataset.load_saved_view("clips")

        # Here we're making sure that serializing + reloading a view that
        # involves the `ToClips` stage successfully detects that it can reuse
        # the same `_state`
        self.assertTrue(clips is not also_clips)
        self.assertEqual(clips._dataset.name, also_clips._dataset.name)

    def test_make_optimized_select_view_group_dataset(self):
        dataset, sample_ids = self._make_group_dataset()

        optimized_view = fov.make_optimized_select_view(
            dataset, sample_ids[0], flatten=True
        )

        expected_stages = [
            fosg.SelectGroupSlices(_allow_mixed=True),
            fosg.Select(sample_ids[0]),
        ]
        self.assertEqual(optimized_view._all_stages, expected_stages)

    def test_make_optimized_select_view_select_group_slices_before_sample_selection(
        self,
    ):
        dataset, sample_ids = self._make_group_dataset()
        view = dataset.select_group_slices(["left", "right"])

        optimized_view = fov.make_optimized_select_view(
            view,
            sample_ids[1],
        )

        first_stage, second_stage = optimized_view._stages
        # the order matters
        self.assertEqual(type(first_stage), fosg.SelectGroupSlices)
        self.assertEqual(type(second_stage), fosg.Select)

    def test_selected_samples_in_group_slices(self):
        (dataset, selected_ids) = self._make_group_by_group_dataset()
        view = dataset.view()
        self.assertEqual(view.media_type, "group")

        # treating sample_ids as groups will yield no sample
        optimized_view = fov.make_optimized_select_view(
            dataset, selected_ids[0], groups=True, flatten=True
        )
        self.assertEqual(len(optimized_view), 0)

        # selects one sample from all group_slices
        optimized_view = fov.make_optimized_select_view(
            dataset, selected_ids[0], groups=False, flatten=True
        )
        self.assertEqual(len(optimized_view), 1)

        # selects two sample from all group_slices
        optimized_view = fov.make_optimized_select_view(
            dataset, selected_ids[:2], groups=False, flatten=True
        )
        self.assertEqual(len(optimized_view), 2)

    def _make_group_dataset(self):
        dataset = fo.Dataset()
        dataset.add_group_field("group", default="left")
        groups = ["left", "right"]
        filepaths = [str(i) + ".jpg" for i in groups]

        filepaths = [dict(zip(groups, fps)) for fps in zip(*filepaths)]
        group = fo.Group()
        samples = []
        for fps in filepaths:
            for name, filepath in fps.items():
                samples.append(
                    fo.Sample(filepath=filepath, group=group.element(name))
                )
        return dataset, dataset.add_samples(samples)

    def _make_group_by_group_dataset(self):
        dataset = fo.Dataset()
        dataset.add_group_field("group_field", default="left")

        group1 = fo.Group()
        group2 = fo.Group()
        group3 = fo.Group()

        samples = [
            fo.Sample(
                filepath="left-image1.jpg",
                group_field=group1.element("left"),
                scene="foo",
            ),
            fo.Sample(
                filepath="right-image1.jpg",
                group_field=group1.element("right"),
                scene="foo",
            ),
            fo.Sample(
                filepath="left-image2.jpg",
                group_field=group2.element("left"),
                scene="foo",
            ),
            fo.Sample(
                filepath="right-image2.jpg",
                group_field=group2.element("right"),
                scene="foo",
            ),
            fo.Sample(
                filepath="left-image3.jpg",
                group_field=group3.element("left"),
                scene="bar",
            ),
            fo.Sample(
                filepath="right-image3.jpg",
                group_field=group3.element("right"),
                scene="bar",
            ),
        ]

        dataset.add_samples(samples)

        return (dataset, [s.id for s in samples])


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
