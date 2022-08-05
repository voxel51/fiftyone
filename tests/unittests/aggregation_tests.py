"""
FiftyOne aggregation-related unit tests.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from datetime import date, datetime, timedelta
import math

from bson import ObjectId
import numpy as np
import unittest

import fiftyone as fo
from fiftyone import ViewField as F

from decorators import drop_datasets


class DatasetTests(unittest.TestCase):
    @drop_datasets
    def test_bounds(self):
        d = fo.Dataset()
        d.add_sample_field("numbers", fo.ListField, subfield=fo.IntField())
        s = fo.Sample(filepath="image.jpeg")
        s["number"] = 0
        s["numbers"] = [0, 1]
        d.add_sample(s)
        self.assertEqual(d.bounds("number"), (0, 0))
        self.assertEqual(d.bounds("numbers"), (0, 1))

        d = fo.Dataset()
        s = fo.Sample(filepath="video.mp4")
        d.add_sample(s)
        d.add_frame_field("numbers", fo.ListField, subfield=fo.IntField())
        s[1]["number"] = 0
        s[1]["numbers"] = [0, 1]
        s.save()
        self.assertEqual(d.bounds("frames.number"), (0, 0))
        self.assertEqual(d.bounds("frames.numbers"), (0, 1))

        d = fo.Dataset()
        s = fo.Sample(filepath="image.jpeg")
        s["detection"] = fo.Detection(label="label", confidence=1)
        d.add_sample(s)
        self.assertEqual(d.bounds("detection.confidence"), (1, 1))

        s["detections"] = fo.Detections(
            detections=[
                fo.Detection(label="label", confidence=1),
                fo.Detection(label="label", confidence=0),
            ]
        )
        s.save()
        self.assertEqual(
            d.bounds("detections.detections.confidence"),
            (0, 1),
        )
        self.assertEqual(
            d.bounds(1 + F("detections.detections.confidence")),
            (1, 2),
        )

        d = fo.Dataset()
        s = fo.Sample(filepath="video.mp4")
        s[1]["detection"] = fo.Detection(label="label", confidence=1)
        d.add_sample(s)
        self.assertEqual(
            d.bounds("frames.detection.confidence"),
            (1, 1),
        )

    @drop_datasets
    def test_count(self):
        d = fo.Dataset()
        self.assertEqual(d.count(), 0)

        v = d.view()
        self.assertEqual(v.count(), 0)

        s = fo.Sample(filepath="image.jpeg")
        d.add_sample(s)
        self.assertEqual(d.count(), 1)
        self.assertEqual(v.count(), 1)

        s["single"] = fo.Classification()
        s["list"] = fo.Classifications(
            classifications=[
                fo.Classification(label="a"),
                fo.Classification(label="b"),
            ]
        )
        s["empty"] = fo.Classifications()
        s.save()
        self.assertEqual(d.count("single"), 1)
        self.assertEqual(d.count("list.classifications"), 2)
        self.assertEqual(
            d.count(F("list.classifications").filter(F("label") == "a")), 1
        )
        self.assertEqual(d.count("empty.classifications"), 0)

        d = fo.Dataset()
        s = fo.Sample(filepath="video.mp4")
        s[1]["value"] = "value"
        s[2]["value"] = "value"
        d.add_sample(s)
        self.assertEqual(d.count("frames"), 2)

    @drop_datasets
    def test_count_values(self):
        d = fo.Dataset()
        s = fo.Sample(filepath="image.jpeg")
        s.tags += ["one", "two"]  # pylint: disable=no-member
        d.add_sample(s)
        self.assertEqual(d.count_values("tags"), {"one": 1, "two": 1})

        d = fo.Dataset()
        s = fo.Sample(filepath="video.mp4")
        s["classifications"] = fo.Classifications(
            classifications=[
                fo.Classification(label="one"),
                fo.Classification(label="two"),
                fo.Classification(label="two"),
            ]
        )
        s[1]["classifications"] = fo.Classifications(
            classifications=[
                fo.Classification(label="one"),
                fo.Classification(label="two"),
                fo.Classification(label="two"),
            ]
        )
        s["classification"] = fo.Classification(label="one")
        d.add_sample(s)
        self.assertEqual(d.count_values("classification.label"), {"one": 1})
        self.assertEqual(
            d.count_values("classifications.classifications.label"),
            {"one": 1, "two": 2},
        )
        self.assertEqual(
            d.count_values(F("classifications.classifications.label").upper()),
            {"ONE": 1, "TWO": 2},
        )
        self.assertEqual(
            d.count_values("frames.classifications.classifications.label"),
            {"one": 1, "two": 2},
        )

    @drop_datasets
    def test_distinct(self):
        d = fo.Dataset()
        d.add_sample_field("strings", fo.ListField, subfield=fo.StringField())
        s = fo.Sample(filepath="image.jpeg")
        s["string"] = "string"
        s["strings"] = ["one", "two"]
        d.add_sample(s)
        self.assertEqual(d.distinct("string"), ["string"])
        self.assertEqual(d.distinct("strings"), ["one", "two"])

        d = fo.Dataset()
        s = fo.Sample(filepath="video.mp4")

        s = fo.Sample(filepath="image.jpeg")
        d.add_sample(s)
        s["classification"] = fo.Classification(label="label", confidence=1)
        s.save()
        self.assertEqual(d.distinct("classification.label"), ["label"])
        s["classifications"] = fo.Classifications(
            classifications=[
                fo.Classification(label="one"),
                fo.Classification(label="two"),
            ]
        )
        s.save()
        self.assertEqual(
            d.distinct("classifications.classifications.label"),
            ["one", "two"],
        )

        self.assertEqual(
            d.distinct(F("classifications.classifications.label").upper()),
            ["ONE", "TWO"],
        )

        d = fo.Dataset()
        s = fo.Sample(filepath="video.mp4")
        s[1]["classification"] = fo.Classification(label="label", confidence=1)
        d.add_sample(s)
        self.assertEqual(d.distinct("frames.classification.label"), ["label"])

    @drop_datasets
    def test_sum(self):
        d = fo.Dataset()
        d.add_sample_field("numeric_field", fo.IntField)
        self.assertEqual(d.sum("numeric_field"), 0)

        s = fo.Sample(filepath="image.jpeg", numeric_field=1)
        d.add_sample(s)
        self.assertEqual(d.sum("numeric_field"), 1)

        s = fo.Sample(filepath="image2.jpeg", numeric_field=2)
        d.add_sample(s)
        self.assertEqual(d.sum("numeric_field"), 3)

        self.assertAlmostEqual(d.sum(2.0 * (F("numeric_field") + 1)), 10.0)

    @drop_datasets
    def test_mean(self):
        d = fo.Dataset()
        d.add_sample_field("numeric_field", fo.IntField)
        self.assertEqual(d.mean("numeric_field"), 0)

        s = fo.Sample(filepath="image.jpeg", numeric_field=1)
        d.add_sample(s)
        self.assertEqual(d.mean("numeric_field"), 1)

        s = fo.Sample(filepath="image2.jpeg", numeric_field=3)
        d.add_sample(s)
        self.assertEqual(d.mean("numeric_field"), 2)

        self.assertAlmostEqual(d.mean(2.0 * (F("numeric_field") + 1)), 6.0)

    @drop_datasets
    def test_quantiles(self):
        d = fo.Dataset()
        d.add_sample_field("numeric_field", fo.IntField)
        self.assertIsNone(d.quantiles("numeric_field", 0.5))
        self.assertListEqual(d.quantiles("numeric_field", [0.5]), [None])

        s = fo.Sample(filepath="image.jpeg", numeric_field=1)
        d.add_sample(s)
        self.assertAlmostEqual(d.quantiles("numeric_field", 0.5), 1)

        s = fo.Sample(filepath="image2.jpeg", numeric_field=2)
        d.add_sample(s)

        q = np.linspace(0, 1, 11)

        results1 = d.quantiles("numeric_field", q)

        # only available in `numpy>=1.22`
        # results2 = np.quantile([1, 2], q, method="inverted_cdf")
        results2 = [1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2]

        self.assertEqual(len(results1), len(results2))
        for r1, r2 in zip(results1, results2):
            self.assertAlmostEqual(r1, r2)

        results1 = d.quantiles(2.0 * (F("numeric_field") + 1), q)

        # only available in `numpy>=1.22`
        # results2 = np.quantile([4, 6], q, method="inverted_cdf")
        results2 = [4, 4, 4, 4, 4, 4, 6, 6, 6, 6, 6]

        self.assertEqual(len(results1), len(results2))
        for r1, r2 in zip(results1, results2):
            self.assertAlmostEqual(r1, r2)

        with self.assertRaises(ValueError):
            d.quantiles("numeric_field", "bad-value")

        with self.assertRaises(ValueError):
            d.quantiles("numeric_field", -1)

        with self.assertRaises(ValueError):
            d.quantiles("numeric_field", 2)

    @drop_datasets
    def test_std(self):
        d = fo.Dataset()
        d.add_sample_field("numeric_field", fo.IntField)
        self.assertEqual(d.std("numeric_field"), 0)

        s = fo.Sample(filepath="image.jpeg", numeric_field=1)
        d.add_sample(s)
        self.assertEqual(d.std("numeric_field"), 0)

        s = fo.Sample(filepath="image2.jpeg", numeric_field=3)
        d.add_sample(s)
        self.assertEqual(d.std("numeric_field"), 1)

        self.assertAlmostEqual(d.std(2.0 * (F("numeric_field") + 1)), 2.0)

    @drop_datasets
    def test_values(self):
        d = fo.Dataset()
        d.add_sample_field(
            "predictions",
            fo.EmbeddedDocumentField,
            embedded_doc_type=fo.Detections,
        )
        self.assertListEqual(d.values("predictions"), [])
        self.assertListEqual(d.values("predictions.detections"), [])
        self.assertListEqual(d.values("predictions.detections.label"), [])

        d.add_samples(
            [
                fo.Sample(
                    filepath="image1.jpeg",
                    predictions=fo.Detections(
                        detections=[
                            fo.Detection(label="cat"),
                            fo.Detection(label="dog"),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="image2.jpeg",
                    predictions=fo.Detections(
                        detections=[
                            fo.Detection(label="cat"),
                            fo.Detection(label="rabbit"),
                            fo.Detection(label="squirrel"),
                        ]
                    ),
                ),
                fo.Sample(
                    filepath="image3.jpeg",
                    predictions=fo.Detections(
                        detections=[
                            fo.Detection(label="elephant"),
                            fo.Detection(),
                        ]
                    ),
                ),
                fo.Sample(filepath="image4.jpeg", predictions=None),
                fo.Sample(filepath="image5.jpeg"),
            ]
        )

        self.assertListEqual(
            d.values("predictions.detections.label"),
            [
                ["cat", "dog"],
                ["cat", "rabbit", "squirrel"],
                ["elephant", None],
                None,
                None,
            ],
        )

        self.assertListEqual(
            d.values("predictions.detections.label", missing_value="missing"),
            [
                ["cat", "dog"],
                ["cat", "rabbit", "squirrel"],
                ["elephant", "missing"],
                None,
                None,
            ],
        )

        self.assertListEqual(
            d.values("predictions.detections[].label"),
            ["cat", "dog", "cat", "rabbit", "squirrel", "elephant", None],
        )

        self.assertListEqual(
            d.values(F("predictions.detections[].label")),
            ["cat", "dog", "cat", "rabbit", "squirrel", "elephant", None],
        )

        self.assertListEqual(
            d.values(
                "predictions.detections[].label", missing_value="missing"
            ),
            ["cat", "dog", "cat", "rabbit", "squirrel", "elephant", "missing"],
        )

        self.assertListEqual(
            d.values(F("predictions.detections").length()),
            [2, 3, 2, 0, 0],
        )

        self.assertListEqual(
            d.values(
                (F("predictions.detections.label") != None).if_else(
                    "found", "missing"
                )
            ),
            [
                ["found", "found"],
                ["found", "found", "found"],
                ["found", "missing"],
                None,
                None,
            ],
        )

        self.assertListEqual(
            d.values(
                (F("predictions.detections[].label") != None).if_else(
                    "found", "missing"
                )
            ),
            ["found", "found", "found", "found", "found", "found", "missing"],
        )

    @drop_datasets
    def test_values_unwind(self):
        sample1 = fo.Sample(filepath="video1.mp4")
        sample1.frames[1] = fo.Frame(
            ground_truth=fo.Classifications(
                classifications=[fo.Classification(label="cat")]
            )
        )
        sample1.frames[2] = fo.Frame()
        sample1.frames[3] = fo.Frame(
            ground_truth=fo.Classifications(
                classifications=[fo.Classification(label="dog")]
            )
        )

        sample2 = fo.Sample(filepath="video2.mp4")
        sample2.frames[1] = fo.Frame(
            ground_truth=fo.Classifications(
                classifications=[
                    fo.Classification(label="cat"),
                    fo.Classification(label="dog"),
                ]
            )
        )
        sample2.frames[2] = fo.Frame(
            ground_truth=fo.Classifications(
                classifications=[fo.Classification(label="rabbit")]
            )
        )
        sample2.frames[3] = fo.Frame(
            ground_truth=fo.Classifications(
                classifications=[fo.Classification(label="squirrel")]
            )
        )

        dataset = fo.Dataset()
        dataset.add_samples([sample1, sample2])

        # [num_samples][num_frames][num_classifications]
        values = dataset.values("frames.ground_truth.classifications.label")
        expected = [
            [["cat"], None, ["dog"]],
            [["cat", "dog"], ["rabbit"], ["squirrel"]],
        ]

        self.assertListEqual(values, expected)

        # [num_samples][num_frames x num_classifications]
        values1 = dataset.values("frames.ground_truth.classifications[].label")
        values2 = dataset.values(
            "frames.ground_truth.classifications.label", unwind=-1
        )
        expected = [["cat", "dog"], ["cat", "dog", "rabbit", "squirrel"]]
        self.assertListEqual(values1, expected)
        self.assertListEqual(values2, expected)

        # [num_samples x num_frames x num_classifications]
        values1 = dataset.values(
            "frames[].ground_truth.classifications[].label"
        )
        values2 = dataset.values(
            "frames.ground_truth.classifications.label", unwind=True
        )
        expected = ["cat", "dog", "cat", "dog", "rabbit", "squirrel"]
        self.assertListEqual(values1, expected)
        self.assertListEqual(values2, expected)

    @drop_datasets
    def test_nan_inf(self):
        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(filepath="image1.png", float=1.0),
                fo.Sample(filepath="image2.png", float=-float("inf")),
                fo.Sample(filepath="image3.png", float=float("inf")),
                fo.Sample(filepath="image4.png", float=float("nan")),
                fo.Sample(filepath="image5.png", float=None),
                fo.Sample(filepath="image6.png"),
            ]
        )

        bounds = dataset.bounds("float")
        self.assertTrue(math.isnan(bounds[0]))
        self.assertTrue(math.isinf(bounds[1]))

        self.assertEqual(dataset.count("float"), 4)
        self.assertEqual(len(dataset.distinct("float")), 4)
        self.assertEqual(len(dataset.count_values("float")), 5)
        self.assertEqual(len(dataset.values("float")), 6)
        self.assertTrue(math.isnan(dataset.mean("float")))
        self.assertTrue(math.isnan(dataset.sum("float")))
        self.assertTrue(math.isnan(dataset.std("float")))
        self.assertTrue(math.isnan(dataset.quantiles("float", 0)))
        self.assertTrue(math.isnan(dataset.quantiles("float", 0.25)))
        self.assertTrue(math.isinf(dataset.quantiles("float", 0.50)))
        self.assertAlmostEqual(dataset.quantiles("float", 0.75), 1.0)
        self.assertTrue(math.isinf(dataset.quantiles("float", 1)))

        counts, edges, other = dataset.histogram_values("float")
        self.assertEqual(other, 5)  # captures None, nan, inf

        # Test `safe=True` option

        bounds = dataset.bounds("float", safe=True)
        self.assertAlmostEqual(bounds[0], 1.0)
        self.assertAlmostEqual(bounds[1], 1.0)

        self.assertEqual(dataset.count("float", safe=True), 1)
        self.assertEqual(len(dataset.distinct("float", safe=True)), 1)
        self.assertEqual(len(dataset.count_values("float", safe=True)), 2)
        self.assertAlmostEqual(dataset.mean("float", safe=True), 1.0)
        self.assertAlmostEqual(dataset.sum("float", safe=True), 1.0)
        self.assertAlmostEqual(dataset.std("float", safe=True), 0.0)

        self.assertAlmostEqual(dataset.quantiles("float", 0, safe=True), 1.0)
        self.assertAlmostEqual(dataset.quantiles("float", 1, safe=True), 1.0)
        self.assertAlmostEqual(dataset.quantiles("float", 0.5, safe=True), 1.0)

    @drop_datasets
    def test_object_ids(self):
        dataset = fo.Dataset()
        for i in range(5):
            sample = fo.Sample(
                filepath="video%d.mp4" % i,
                ground_truth=fo.Classification(label=str(i)),
            )
            for j in range(1, 5):
                sample.frames[j] = fo.Frame(
                    ground_truth=fo.Classification(label=str(j)),
                )

            dataset.add_sample(sample)

        id_bounds = dataset.bounds("id")
        for _id in id_bounds:
            self.assertIsInstance(_id, str)

        oid_bounds = dataset.bounds("_id")
        for oid in oid_bounds:
            self.assertIsInstance(oid, ObjectId)

        id_bounds = dataset.bounds("ground_truth.id")
        for _id in id_bounds:
            self.assertIsInstance(_id, str)

        oid_bounds = dataset.bounds("ground_truth._id")
        for oid in oid_bounds:
            self.assertIsInstance(oid, ObjectId)

        id_bounds = dataset.bounds("frames.ground_truth.id")
        for _id in id_bounds:
            self.assertIsInstance(_id, str)

        oid_bounds = dataset.bounds("frames.ground_truth._id")
        for oid in oid_bounds:
            self.assertIsInstance(oid, ObjectId)

        ids = dataset.distinct("id")
        for _id in ids:
            self.assertIsInstance(_id, str)

        oids = dataset.distinct("_id")
        for oid in oids:
            self.assertIsInstance(oid, ObjectId)

        ids = dataset.distinct("ground_truth.id")
        for _id in ids:
            self.assertIsInstance(_id, str)

        oids = dataset.distinct("ground_truth._id")
        for oid in oids:
            self.assertIsInstance(oid, ObjectId)

        ids = dataset.distinct("frames.ground_truth.id")
        for _id in ids:
            self.assertIsInstance(_id, str)

        oids = dataset.distinct("frames.ground_truth._id")
        for oid in oids:
            self.assertIsInstance(oid, ObjectId)

        self.assertEqual(dataset.count("id"), 5)
        self.assertEqual(dataset.count("_id"), 5)

        self.assertEqual(dataset.count("ground_truth.id"), 5)
        self.assertEqual(dataset.count("ground_truth._id"), 5)

        self.assertEqual(dataset.count("frames.ground_truth.id"), 20)
        self.assertEqual(dataset.count("frames.ground_truth._id"), 20)

        id_counts = dataset.count_values("id")
        for _id, count in id_counts.items():
            self.assertIsInstance(_id, str)
            self.assertEqual(count, 1)

        oid_counts = dataset.count_values("_id")
        for oid, count in oid_counts.items():
            self.assertIsInstance(oid, ObjectId)
            self.assertEqual(count, 1)

        id_counts = dataset.count_values("ground_truth.id")
        for _id, count in id_counts.items():
            self.assertIsInstance(_id, str)
            self.assertEqual(count, 1)

        oid_counts = dataset.count_values("ground_truth._id")
        for oid, count in oid_counts.items():
            self.assertIsInstance(oid, ObjectId)
            self.assertEqual(count, 1)

        id_counts = dataset.count_values("frames.ground_truth.id")
        for _id, count in id_counts.items():
            self.assertIsInstance(_id, str)
            self.assertEqual(count, 1)

        oid_counts = dataset.count_values("frames.ground_truth._id")
        for oid, count in oid_counts.items():
            self.assertIsInstance(oid, ObjectId)
            self.assertEqual(count, 1)

        ids = dataset.values("id")

        self.assertEqual(len(ids), 5)
        for _id in ids:
            self.assertIsInstance(_id, str)

        oids = dataset.values("_id")

        self.assertEqual(len(oids), 5)
        for oid in oids:
            self.assertIsInstance(oid, ObjectId)

        label_ids = dataset.values("ground_truth.id")

        self.assertEqual(len(label_ids), 5)
        for _id in label_ids:
            self.assertIsInstance(_id, str)

        label_oids = dataset.values("ground_truth._id")

        self.assertEqual(len(label_oids), 5)
        for oid in label_oids:
            self.assertIsInstance(oid, ObjectId)

        frame_ids = dataset.values("frames.id")

        self.assertEqual(len(frame_ids), 5)
        for _frame_ids in frame_ids:
            self.assertEqual(len(_frame_ids), 4)
            for _id in _frame_ids:
                self.assertIsInstance(_id, str)

        frame_oids = dataset.values("frames._id")

        self.assertEqual(len(frame_oids), 5)
        for _frame_oids in frame_oids:
            self.assertEqual(len(_frame_oids), 4)
            for oid in _frame_oids:
                self.assertIsInstance(oid, ObjectId)

        frame_label_ids = dataset.values("frames.ground_truth.id")

        self.assertEqual(len(frame_label_ids), 5)
        for _frame_label_ids in frame_label_ids:
            self.assertEqual(len(_frame_label_ids), 4)
            for _id in _frame_label_ids:
                self.assertIsInstance(_id, str)

        frame_label_oids = dataset.values("frames.ground_truth._id")

        self.assertEqual(len(frame_label_oids), 5)
        for _frame_label_oids in frame_label_oids:
            self.assertEqual(len(_frame_label_oids), 4)
            for oid in _frame_label_oids:
                self.assertIsInstance(oid, ObjectId)

    @drop_datasets
    def test_dates(self):
        today = date.today()
        now = datetime.utcnow()

        samples = []
        for idx in range(100):
            sample = fo.Sample(filepath="image%d.jpg" % idx)

            # Dates
            sample["dates"] = today - timedelta(days=idx)

            # Datetimes
            sample["ms"] = now - timedelta(milliseconds=idx)
            sample["seconds"] = now - timedelta(seconds=idx)
            sample["minutes"] = now - timedelta(minutes=idx)
            sample["hours"] = now - timedelta(hours=idx)
            sample["days"] = now - timedelta(days=idx)
            sample["weeks"] = now - timedelta(weeks=idx)

            samples.append(sample)

        dataset = fo.Dataset()
        dataset.add_samples(samples)

        bounds = dataset.bounds("dates")
        self.assertIsInstance(bounds[0], date)
        self.assertIsInstance(bounds[1], date)

        count = dataset.count("dates")
        self.assertEqual(count, 100)

        values = dataset.values("dates")
        for value in values:
            self.assertIsInstance(value, date)

        uniques = dataset.distinct("dates")
        self.assertListEqual(uniques, list(reversed(values)))

        counts_dict = dataset.count_values("dates")
        for value, count in counts_dict.items():
            self.assertIsInstance(value, date)
            self.assertEqual(count, 1)

        counts, edges, other = dataset.histogram_values("dates", bins=10)
        self.assertListEqual(counts, [10] * 10)
        self.assertEqual(other, 0)
        for edge in edges:
            self.assertIsInstance(edge, datetime)

        for field in ["ms", "seconds", "minutes", "hours", "days", "weeks"]:
            bounds = dataset.bounds(field)
            self.assertIsInstance(bounds[0], datetime)
            self.assertIsInstance(bounds[1], datetime)

            count = dataset.count(field)
            self.assertEqual(count, 100)

            values = dataset.values(field)
            for value in values:
                self.assertIsInstance(value, datetime)

            uniques = dataset.distinct(field)
            self.assertListEqual(uniques, list(reversed(values)))

            counts_dict = dataset.count_values(field)
            for value, count in counts_dict.items():
                self.assertIsInstance(value, datetime)
                self.assertEqual(count, 1)

            counts, edges, other = dataset.histogram_values(field, bins=10)
            self.assertListEqual(counts, [10] * 10)
            self.assertEqual(other, 0)
            for edge in edges:
                self.assertIsInstance(edge, datetime)

    @drop_datasets
    def test_order(self):
        d = fo.Dataset()
        s = fo.Sample(filepath="image.jpeg")
        s["number"] = 0
        s["numbers"] = [0, 1]
        d.add_sample(s)
        results = d.aggregate([fo.Count("number"), fo.Count("numbers")])
        self.assertEqual(results[0], 1)
        self.assertEqual(results[1], 2)

    @drop_datasets
    def test_batching(self):
        dataset = fo.Dataset()
        for i in range(5):
            sample = fo.Sample(
                filepath="video%d.mp4" % i,
                cls=fo.Classification(label=i * str(i)),
                det=fo.Detections(
                    detections=[
                        fo.Detection(label=ii * str(ii)) for ii in range(i)
                    ]
                ),
            )
            for j in range(1, 5):
                sample.frames[j] = fo.Frame(
                    cls=fo.Classification(label=(i + j) * str(i + j)),
                    det=fo.Detections(
                        detections=[
                            fo.Detection(label=ij * str(ij))
                            for ij in range(i + j)
                        ]
                    ),
                )

            dataset.add_sample(sample)

        stages = [
            fo.Count(),
            fo.Count("frames"),
            fo.Distinct("cls.label"),
            fo.Distinct("frames.cls.label"),
            fo.Values("id"),
            fo.Values("cls.label"),
            fo.Values("cls.label", expr=F().strlen()),
            fo.Values(F("cls.label").strlen()),
            fo.Values("det.detections.label"),
            fo.Values("det.detections[].label"),
            fo.Values("det.detections.label", unwind=True),
            fo.Values("frames.id"),
            fo.Values("frames.cls.label"),
            fo.Values("frames.cls.label", expr=F().strlen()),
            fo.Values(F("frames.cls.label").strlen()),
            fo.Values("frames.det.detections.label"),
            fo.Values("frames[].det.detections[].label"),
            fo.Values("frames.det.detections.label", unwind=True),
        ]

        results = dataset.aggregate(stages)
        self.assertEqual(len(stages), len(results))

        fields = [
            "id",
            "cls.label",
            "det.detections.label",
            "det.detections[].label",
            "frames.id",
            "frames.cls.label",
            "frames.det.detections.label",
            "frames[].det.detections[].label",
        ]

        results = dataset.values(fields)
        self.assertEqual(len(fields), len(results))

    @drop_datasets
    def test_video_frames(self):
        sample = fo.Sample(filepath="video.mp4")
        sample.frames[1] = fo.Frame(
            detections=fo.Detections(
                detections=[
                    fo.Detection(label="cat"),
                    fo.Detection(label="dog"),
                ]
            )
        )
        sample.frames[2] = fo.Frame()
        sample.frames[3] = fo.Frame(
            detections=fo.Detections(
                detections=[
                    fo.Detection(label="rabbit"),
                    fo.Detection(label="squirrel"),
                    fo.Detection(label="fox"),
                ]
            )
        )

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        num_objs = F("frames").map(F("detections.detections").length())

        values = dataset.values(num_objs)
        self.assertListEqual(values, [[2, 0, 3]])

        counts = dataset.count_values(num_objs)
        self.assertDictEqual(counts, {2: 1, 3: 1, 0: 1})

        max_objs = F("frames").map(F("detections.detections").length()).max()

        values = dataset.values(max_objs)
        self.assertListEqual(values, [3])

        counts = dataset.count_values(max_objs)
        self.assertDictEqual(counts, {3: 1})

    @drop_datasets
    def test_needs_frames(self):
        sample1 = fo.Sample(filepath="video1.mp4", int=1)
        sample1.frames[1] = fo.Frame(
            detections=fo.Detections(
                detections=[
                    fo.Detection(label="cat"),
                    fo.Detection(label="dog"),
                ]
            )
        )
        sample1.frames[2] = fo.Frame()
        sample1.frames[3] = fo.Frame(
            detections=fo.Detections(
                detections=[
                    fo.Detection(label="rabbit"),
                    fo.Detection(label="squirrel"),
                    fo.Detection(label="fox"),
                ]
            )
        )

        sample2 = fo.Sample(filepath="video2.mp4", int=2)
        sample2.frames[1] = fo.Frame(
            detections=fo.Detections(
                detections=[
                    fo.Detection(label="cat"),
                    fo.Detection(label="dog"),
                ]
            )
        )
        sample2.frames[2] = fo.Frame()

        dataset = fo.Dataset()
        dataset.add_samples([sample1, sample2])

        expr1 = F("int") > 1.5
        expr2 = F("frames").length() > 2

        values = dataset.values(expr1)
        self.assertListEqual(values, [False, True])

        values = dataset.values(expr2)
        self.assertListEqual(values, [True, False])

        values = dataset.values(expr1 | expr2)
        self.assertListEqual(values, [True, True])

        values = dataset.values(expr1 & expr2)
        self.assertListEqual(values, [False, False])

    @drop_datasets
    def test_serialize(self):
        bbox_area = F("bounding_box")[2] * F("bounding_box")[3]

        aggregations = [
            fo.Bounds("predictions.detections.confidence"),
            fo.Count(),
            fo.Count("predictions.detections"),
            fo.CountValues("predictions.detections.label"),
            fo.Distinct("predictions.detections.label"),
            fo.HistogramValues(
                "predictions.detections.confidence",
                bins=50,
                range=[0, 1],
            ),
            fo.Mean("predictions.detections[]", expr=bbox_area),
            fo.Std("predictions.detections[]", expr=bbox_area),
            fo.Sum("predictions.detections", expr=F().length()),
            fo.Values("id"),
        ]

        agg_dicts = [a._serialize() for a in aggregations]
        also_aggregations = [fo.Aggregation._from_dict(d) for d in agg_dicts]

        self.assertListEqual(aggregations, also_aggregations)


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
