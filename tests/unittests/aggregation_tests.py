"""
FiftyOne aggregation-related unit tests.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from bson import ObjectId
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
            d.bounds("detections.detections.confidence"), (0, 1),
        )
        self.assertEqual(
            d.bounds(1 + F("detections.detections.confidence")), (1, 2),
        )

        d = fo.Dataset()
        s = fo.Sample(filepath="video.mp4")
        s[1]["detection"] = fo.Detection(label="label", confidence=1)
        d.add_sample(s)
        self.assertEqual(
            d.bounds("frames.detection.confidence"), (1, 1),
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
            d.values(F("predictions.detections").length()), [2, 3, 2, 0, 0],
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


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
