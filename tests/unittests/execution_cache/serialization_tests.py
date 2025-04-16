"""
Unit tests for cache serialization.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import datetime
import numpy as np
from pathlib import Path
import unittest

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
            "date": datetime.date(2021, 6, 9),
            "single_char": "1",
        }

        serialized = auto_serialize(data)
        deserialized = auto_deserialize(serialized)

        self.assertEqual(deserialized["int"], 1)
        self.assertEqual(deserialized["float"], 2.5)
        self.assertEqual(deserialized["bool"], True)
        self.assertIsNone(deserialized["none"])
        self.assertEqual(deserialized["str"], "hello")
        self.assertEqual(deserialized["list"], [1, 2, 3])
        self.assertEqual(deserialized["set"], {7, 8, 9})
        self.assertEqual(deserialized["tuple"], (4, 5, 6))
        self.assertEqual(deserialized["nested"]["x"], 10)
        self.assertEqual(deserialized["nested"]["y"], [11, 12])
        self.assertEqual(deserialized["date"], datetime.date(2021, 6, 9))
        self.assertEqual(deserialized["single_char"], "1")

    def test_auto_serialize_deserialize_datetime(self):
        dt = datetime.datetime(2019, 4, 11, 12, 0, 0)
        d = datetime.date(2021, 6, 9)

        serialized = auto_serialize({"dt": dt, "d": d})
        deserialized = auto_deserialize(serialized)

        self.assertIsInstance(deserialized["dt"], datetime.datetime)
        self.assertIsInstance(deserialized["d"], datetime.date)
        self.assertEqual(deserialized["dt"].isoformat(), dt.isoformat())

    def test_auto_deserialize_recursive_with_sample(self):
        expected_path = str(Path(Path.cwd().anchor, "hello", "world.jpg"))
        sample_dict = {
            "filepath": expected_path,
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
            },
        }

        result = auto_deserialize(raw)

        self.assertEqual(result["a"], [1, 2, 3])
        self.assertEqual(result["b"]["nested"], 10)
        self.assertAlmostEqual(result["b"]["float"], 1.23)
        self.assertIsInstance(result["b"]["sample"], fo.Sample)
        self.assertEqual(result["b"]["sample"].filepath, expected_path)

    def test_auto_serialize_sample(self):
        expected_path = str(Path(Path.cwd().anchor, "tmp", "image.jpg"))
        sample = fo.Sample(
            filepath=expected_path,
            ground_truth=fo.Classification(label="cat"),
        )
        result = auto_serialize(sample)

        self.assertIn("filepath", result)
        self.assertIn("ground_truth", result)
        self.assertEqual(result["_cls"], "fiftyone.core.sample.Sample")

    def test_auto_serialize_nested_samples(self):
        expected_path = str(Path(Path.cwd().anchor, "tmp", "image.jpg"))
        sample = fo.Sample(
            filepath=expected_path,
            ground_truth=fo.Classification(label="cat"),
        )
        nested = [sample]
        result = auto_serialize(nested)

        self.assertEqual(result[0]["_cls"], "fiftyone.core.sample.Sample")

    def test_auto_deserialize_sample(self):
        expected_path = str(Path(Path.cwd().anchor, "tmp", "image.jpg"))
        sample_dict = {
            "filepath": expected_path,
            "ground_truth": {"label": "cat", "confidence": 0.9},
            "_cls": "fiftyone.core.sample.Sample",
        }

        result = auto_deserialize(sample_dict)

        self.assertIsInstance(result, fo.Sample)
        self.assertEqual(result["filepath"], expected_path)
        self.assertAlmostEqual(result["ground_truth"]["confidence"], 0.9)

    def test_auto_deserialize_nested_samples(self):
        expected_path_img1 = str(Path(Path.cwd().anchor, "tmp", "image.jpg"))
        expected_path_img2 = str(Path(Path.cwd().anchor, "tmp", "image2.jpg"))

        sample_dict = {
            "_cls": "fiftyone.core.sample.Sample",
            "filepath": expected_path_img1,
            "ground_truth": {"label": "cat", "confidence": 0.9},
            "other": [
                {
                    "filepath": expected_path_img2,
                    "ground_truth": {"label": "dog", "confidence": 0.8},
                }
            ],
        }

        list_of_samples = auto_deserialize([sample_dict])
        self.assertIsInstance(list_of_samples[0], fo.Sample)

        dict_of_samples = auto_deserialize({"sample": sample_dict})
        self.assertIsInstance(dict_of_samples["sample"], fo.Sample)

    def test_auto_serialize_numpy_arrays(self):
        # Integer array
        array = np.array([1, 2, 3], dtype=np.int32)
        result = auto_serialize(array)
        self.assertEqual(result, [1, 2, 3])
        self.assertIsInstance(result, list)

        # np float array using real NumPy float types
        array = np.array([1.0, 2.0, 3.0], dtype=np.float64)
        result = auto_serialize(array)
        self.assertEqual(result, [1.0, 2.0, 3.0])
        self.assertIsInstance(result[0], float)
        self.assertNotIsInstance(result[0], np.float64)
        self.assertIsInstance(result, list)

        # Test with another NumPy float type for good measure
        array = np.array([4.0, 5.0, 6.0], dtype=np.float32)
        result = auto_serialize(array)
        self.assertEqual(result, [4.0, 5.0, 6.0])
        self.assertIsInstance(result[0], float)
        self.assertNotIsInstance(result[0], np.float32)
        self.assertIsInstance(result, list)

    def test_auto_serialize_numpy_generic(self):
        # np.int32
        array = np.int32(42)
        result = auto_serialize(array)
        self.assertEqual(result, 42)
        self.assertIsInstance(result, int)

        # np.float64
        array = np.float64(3.14)
        result = auto_serialize(array)
        self.assertEqual(result, 3.14)
        self.assertIsInstance(result, float)

    def test_auto_serialize_set_and_tuple(self):
        # Set
        s = {1, 2, 3}
        result = auto_serialize(s)
        self.assertEqual(result["_cls"], "set")
        self.assertEqual(set(result["values"]), {1, 2, 3})

        # Tuple
        t = (4, 5, 6)
        result = auto_serialize(t)
        self.assertEqual(result["_cls"], "tuple")
        self.assertEqual(result["values"], [4, 5, 6])
        self.assertIsInstance(result["values"], list)
        self.assertNotIsInstance(result["values"], tuple)
        self.assertEqual(result["values"][0], 4)
        self.assertEqual(result["values"][1], 5)

    def test_auto_deserialize_set_and_tuple(self):
        # Set
        s = {"_cls": "set", "values": [1, 2, 3]}
        result = auto_deserialize(s)
        self.assertEqual(set(result), {1, 2, 3})
        self.assertIsInstance(result, set)

        # Tuple
        t = {"_cls": "tuple", "values": [4, 5, 6]}
        result = auto_deserialize(t)
        self.assertEqual(result, (4, 5, 6))
        self.assertIsInstance(result, tuple)
