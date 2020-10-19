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
    def test_count(self):
        d = fo.Dataset()
        s = fo.Sample("image.jpeg")
        v = d.view()
        self.assertEqual(d.aggregate([fo.Count()])[0], 0)
        self.assertEqual(d.aggregate([fo.Count()])[0], 0)
        d.add_sample(s)
        self.assertEqual(d.aggregate([fo.Count()])[0], 1)
        self.assertEqual(d.aggregate([fo.Count()])[0], 1)

    @drop_datasets
    def test_values(self):
        pass
