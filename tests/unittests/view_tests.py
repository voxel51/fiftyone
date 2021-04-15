"""
FiftyOne view-related unit tests.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from copy import deepcopy
import math
import unittest

import fiftyone as fo
from fiftyone import ViewField as F, VALUE
import fiftyone.core.sample as fos
import fiftyone.core.stages as fosg

from decorators import drop_datasets


class DatasetViewTests(unittest.TestCase):
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


class ViewFieldTests(unittest.TestCase):
    @drop_datasets
    @unittest.skip("TODO: Fix workflow errors. Must be run manually")
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

    @drop_datasets
    @unittest.skip("TODO: Fix workflow errors. Must be run manually")
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

        save_view = high_conf_view.exclude_fields(
            ["low_conf", "high_conf"]
        ).limit(1)
        save_view.save()
        schema = dataset.get_field_schema()
        self.assertTrue(len(dataset), 1)
        self.assertNotIn("low_conf", schema)
        self.assertNotIn("high_conf", schema)
        self.assertEqual(len(sample1["predictions"].detections), 2)


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
        dataset_name = self.test_array.__name__
        dataset = fo.Dataset()

        dataset.add_samples(
            [
                fo.Sample(
                    filepath="filepath1.jpg",
                    tags=["train"],
                    my_int=5,
                    my_list=["a", "b"],
                ),
                fo.Sample(
                    filepath="filepath2.jpg",
                    tags=["train"],
                    my_int=6,
                    my_list=["b", "c"],
                ),
                fo.Sample(
                    filepath="filepath3.jpg",
                    tags=["test"],
                    my_int=7,
                    my_list=["c", "d"],
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

        # test __getitem__
        idx = 1
        value = "c"
        manual_ids = [
            sample.id for sample in dataset if sample.my_list[idx] == value
        ]
        view = dataset.match(F("my_list")[idx] == value)
        self.assertListEqual([sample.id for sample in view], manual_ids)

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
            label="friend", confidence=0.9, bounding_box=[0, 0, 0.5, 0.5],
        )
        self.sample1.save()
        self.sample2["test_det"] = fo.Detection(
            label="hex", confidence=0.8, bounding_box=[0.35, 0, 0.2, 0.25],
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

        for sample in self.dataset.exclude_fields(["exclude_fields_field1"]):
            self.assertIsNone(sample.selected_field_names)
            self.assertSetEqual(
                sample.excluded_field_names, {"exclude_fields_field1"}
            )
            with self.assertRaises(AttributeError):
                sample.exclude_fields_field1

            self.assertIsNone(sample.exclude_fields_field2)

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

    def test_limit(self):
        result = list(self.dataset.limit(1))
        self.assertIs(len(result), 1)

    def test_limit_labels(self):
        self._setUp_classifications()

        result = list(self.dataset.limit_labels("test_clfs", 1))
        self.assertIs(len(result[0]["test_clfs"].classifications), 1)

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
        )

        for sample in view:
            for det in sample.test_dets.detections:
                is_best_friend = det.confidence > 0.5 and det.label == "friend"
                self.assertEqual(det.is_best_friend, is_best_friend)

        # Set an embedded field
        view = self.dataset.set_field(
            "test_dets.num_predictions", F("detections").length()
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
                set(
                    fos.get_default_sample_fields(
                        include_private=True, include_id=True
                    )
                ),
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
