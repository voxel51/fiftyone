"""
FiftyOne aggregation related unit tests.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

import fiftyone as fo

from decorators import drop_datasets


class DatasetTests(unittest.TestCase):
    @drop_datasets
    def test_bounds(self):
        d = fo.Dataset()
        d.add_sample_field("numbers", fo.ListField, subfield=fo.IntField())
        s = fo.Sample("image.jpeg")
        s["number"] = 0
        s["numbers"] = [0, 1]
        d.add_sample(s)
        self.assertEqual(d.aggregate(fo.Bounds("number")).bounds, (0, 0))
        self.assertEqual(d.aggregate(fo.Bounds("numbers")).bounds, (0, 1))

    @drop_datasets
    def test_confidence_bounds(self):
        d = fo.Dataset()
        s = fo.Sample("image.jpeg")
        d.add_sample(s)
        s["detection"] = fo.Detection(label="label", confidence=1)
        s.save()
        self.assertEqual(
            d.aggregate(fo.ConfidenceBounds("detection")).bounds, (1, 1)
        )
        s["detections"] = fo.Detections(
            detections=[
                fo.Detection(label="label", confidence=1),
                fo.Detection(label="label", confidence=0),
            ]
        )
        s.save()
        self.assertEqual(
            d.aggregate(fo.ConfidenceBounds("detections")).bounds, (0, 1)
        )

    @drop_datasets
    def test_count(self):
        d = fo.Dataset()
        s = fo.Sample("image.jpeg")
        v = d.view()
        self.assertEqual(d.aggregate(fo.Count()).count, 0)
        self.assertEqual(d.aggregate(fo.Count()).count, 0)
        d.add_sample(s)
        self.assertEqual(d.aggregate(fo.Count()).count, 1)
        self.assertEqual(d.aggregate(fo.Count()).count, 1)
        s["single"] = fo.Classification()
        s["list"] = fo.Classifications(
            classifications=[fo.Classification()] * 2
        )
        s["empty"] = fo.Classifications()
        s.save()
        self.assertEqual(d.aggregate(fo.Count("single")).count, 1)
        self.assertEqual(d.aggregate(fo.Count("list")).count, 2)
        self.assertEqual(d.aggregate(fo.Count("empty")).count, 0)

    @drop_datasets
    def test_distinct(self):
        d = fo.Dataset()
        d.add_sample_field("strings", fo.ListField, subfield=fo.StringField())
        s = fo.Sample("image.jpeg")
        s["string"] = "string"
        s["strings"] = ["one", "two"]
        d.add_sample(s)
        self.assertEqual(d.aggregate(fo.Distinct("string")).values, ["string"])
        self.assertEqual(
            d.aggregate(fo.Distinct("strings")).values, ["one", "two"]
        )

    @drop_datasets
    def test_distinct_labels(self):
        d = fo.Dataset()
        s = fo.Sample("image.jpeg")
        d.add_sample(s)
        s["classification"] = fo.Classification(label="label", confidence=1)
        s.save()
        self.assertEqual(
            d.aggregate(fo.DistinctLabels("classification")).labels, ["label"]
        )
        s["classifications"] = fo.Classifications(
            classifications=[
                fo.Classification(label="one"),
                fo.Classification(label="two"),
            ]
        )
        s.save()
        self.assertEqual(
            d.aggregate(fo.DistinctLabels("classifications")).labels,
            ["one", "two"],
        )


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
