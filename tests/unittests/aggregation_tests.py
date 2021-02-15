"""
FiftyOne aggregation-related unit tests.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

import fiftyone as fo
from fiftyone import ViewField as F

from decorators import drop_datasets


class DatasetTests(unittest.TestCase):
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
            classifications=[fo.Classification()] * 2
        )
        s["empty"] = fo.Classifications()
        s.save()
        self.assertEqual(d.count("single"), 1)
        self.assertEqual(d.count("list.classifications"), 2)
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
            d.values(
                "predictions.detections[].label", missing_value="missing"
            ),
            ["cat", "dog", "cat", "rabbit", "squirrel", "elephant", "missing"],
        )

        self.assertListEqual(
            d.values("predictions.detections", expr=F().length()),
            [2, 3, 2, 0, 0],
        )

        self.assertListEqual(
            d.values(
                "predictions.detections[]",
                expr=(F("label") != None).if_else("found", "missing"),
            ),
            ["found", "found", "found", "found", "found", "found", "missing"],
        )


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
