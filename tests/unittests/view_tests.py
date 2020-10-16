"""
FiftyOne view related unit tests.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import math
import unittest

import fiftyone as fo
from fiftyone import ViewField as F
import fiftyone.core.sample as fos
import fiftyone.core.stages as fosg
from fiftyone.core.odm.sample import (
    DatasetSampleDocument,
    default_sample_fields,
)

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
            .filter_detections("test_dets", F("confidence") > 0.5)
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
    def test_field_names(self):
        self.assertEqual(
            F.ground_truth.to_mongo(), F("ground_truth").to_mongo()
        )
        self.assertEqual(
            F.ground_truth.label.to_mongo(), F("ground_truth.label").to_mongo()
        )
        self.assertEqual(
            F.ground_truth.label.to_mongo(), F("ground_truth.label").to_mongo()
        )
        self.assertEqual(
            F.ground_truth.label.to_mongo(), F("ground_truth").label.to_mongo()
        )


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


class AggregationTests(unittest.TestCase):
    @drop_datasets
    def test_aggregate(self):
        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample("1.jpg", tags=["tag1"]),
                fo.Sample("2.jpg", tags=["tag1", "tag2"]),
                fo.Sample("3.jpg", tags=["tag2", "tag3"]),
            ]
        )

        counts = {
            "tag1": 2,
            "tag2": 2,
            "tag3": 1,
        }

        pipeline = [
            {"$unwind": "$tags"},
            {"$group": {"_id": "$tags", "count": {"$sum": 1}}},
        ]

        for ds in dataset, dataset.view():
            for d in ds.aggregate(pipeline):
                tag = d["_id"]
                count = d["count"]
                self.assertEqual(count, counts[tag])


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

    def test_filter_classifications(self):
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

        view = self.dataset.filter_classifications(
            "test_clfs", (F("confidence") > 0.5) & (F("label") == "friend")
        )

        for sample in view:
            for clf in sample.test_clfs.classifications:
                self.assertGreater(clf.confidence, 0.5)
                self.assertEqual(clf.label, "friend")

    def test_filter_detections(self):
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
                    label="friend", confidence=0.99, bounding_box=[0, 0, 1, 1],
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

        view = self.dataset.filter_detections(
            "test_dets", (F("confidence") > 0.5) & (F("label") == "friend")
        )

        for sample in view:
            for det in sample.test_dets.detections:
                self.assertGreater(det.confidence, 0.5)
                self.assertEqual(det.label, "friend")

    def test_limit(self):
        result = list(self.dataset.limit(1))
        self.assertIs(len(result), 1)

    def test_match(self):
        self.sample1["value"] = "value"
        self.sample1.save()
        result = list(self.dataset.match({"value": "value"}))
        self.assertIs(len(result), 1)
        self.assertEqual(result[0].id, self.sample1.id)

    def test_match_tag(self):
        self.sample1.tags.append("test")
        self.sample1.save()
        result = list(self.dataset.match_tag("test"))
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

    def test_select_fields(self):
        self.dataset.add_sample_field("select_fields_field", fo.IntField)

        for sample in self.dataset.select_fields():
            self.assertSetEqual(
                sample.selected_field_names,
                set(default_sample_fields(DatasetSampleDocument)),
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


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
