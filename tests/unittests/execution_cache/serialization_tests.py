"""
Unit tests for cache serialization.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest
import json
import datetime

import fiftyone as fo
from fiftyone import ViewField as F
from fiftyone.operators.cache.serialization import (
    auto_serialize,
    auto_deserialize,
)


class TestCacheSerialization(unittest.TestCase):
    def test_auto_serialize_deserialize_basic_types(self):
        data = {
            "int": 1,
            "float": 2.5,
            "bool": True,
            "none": None,
            "str": "hello",
            "list": [1, 2, 3],
            "tuple": (4, 5, 6),
            "set": {7, 8, 9},
            "nested": {"x": 10, "y": [11, 12]},
        }

        serialized = auto_serialize(data)
        deserialized = auto_deserialize(serialized)

        self.assertEqual(deserialized["int"], 1)
        self.assertEqual(deserialized["float"], 2.5)
        self.assertEqual(deserialized["bool"], True)
        self.assertIsNone(deserialized["none"])
        self.assertEqual(deserialized["str"], "hello")
        self.assertEqual(deserialized["list"], [1, 2, 3])
        self.assertEqual(set(deserialized["set"]), {7, 8, 9})
        self.assertEqual(deserialized["tuple"], [4, 5, 6])  # becomes list
        self.assertEqual(deserialized["nested"]["x"], 10)

    def test_auto_serialize_deserialize_datetime(self):
        dt = datetime.datetime(2019, 4, 11, 12, 0, 0)
        d = datetime.date(2021, 6, 9)

        serialized = auto_serialize({"dt": dt, "d": d})
        deserialized = auto_deserialize(serialized)

        self.assertIsInstance(deserialized["dt"], datetime.datetime)
        self.assertIsInstance(deserialized["d"], datetime.date)
        self.assertEqual(deserialized["dt"].isoformat(), dt.isoformat())

    def test_auto_deserialize_recursive_with_sample(self):
        sample_dict = {
            "filepath": "/hello/world.jpg",
            "ground_truth": {"label": "cat", "confidence": 0.9},
            "_cls": "fiftyone.core.sample.Sample",
        }

        raw = {
            "a": [1, 2, 3],
            "b": {
                "nested": 10,
                "bool": True,
                "float": 1.23,
                "sample": sample_dict,
                "date": "2023-10-01T12:00:00Z",
            },
        }

        result = auto_deserialize(raw)

        self.assertEqual(result["a"], [1, 2, 3])
        self.assertEqual(result["b"]["nested"], 10)
        self.assertAlmostEqual(result["b"]["float"], 1.23)
        self.assertIsInstance(result["b"]["sample"], fo.Sample)
        self.assertEqual(result["b"]["sample"].filepath, "/hello/world.jpg")
        self.assertIsInstance(result["b"]["date"], datetime.datetime)

    def test_auto_serialize_sample(self):
        sample = fo.Sample(
            filepath="/tmp/image.jpg",
            ground_truth=fo.Classification(label="cat"),
        )
        result = auto_serialize(sample)

        self.assertIn("filepath", result)
        self.assertIn("ground_truth", result)
        self.assertEqual(result["_cls"], "fiftyone.core.sample.Sample")

    def test_auto_serialize_nested_samples(self):
        sample = fo.Sample(
            filepath="/tmp/image.jpg",
            ground_truth=fo.Classification(label="cat"),
        )
        nested = [sample]
        result = auto_serialize(nested)

        self.assertEqual(result[0]["_cls"], "fiftyone.core.sample.Sample")

    def test_auto_deserialize_sample(self):
        sample_dict = {
            "filepath": "/tmp/image.jpg",
            "ground_truth": {"label": "cat", "confidence": 0.9},
            "_cls": "fiftyone.core.sample.Sample",
        }

        result = auto_deserialize(sample_dict)

        self.assertIsInstance(result, fo.Sample)
        self.assertEqual(result["filepath"], "/tmp/image.jpg")
        self.assertAlmostEqual(result["ground_truth"]["confidence"], 0.9)

    def test_auto_deserialize_nested_samples(self):
        sample_dict = {
            "_cls": "fiftyone.core.sample.Sample",
            "filepath": "/tmp/image.jpg",
            "ground_truth": {"label": "cat", "confidence": 0.9},
            "other": [
                {
                    "filepath": "/tmp/image2.jpg",
                    "ground_truth": {"label": "dog", "confidence": 0.8},
                }
            ],
        }

        list_of_samples = auto_deserialize([sample_dict])
        self.assertIsInstance(list_of_samples[0], fo.Sample)

        dict_of_samples = auto_deserialize({"sample": sample_dict})
        self.assertIsInstance(dict_of_samples["sample"], fo.Sample)
