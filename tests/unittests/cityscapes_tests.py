"""
Cityscapes utility unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

import fiftyone.utils.cityscapes as foucs


class CityscapesSplitTests(unittest.TestCase):
    def test_parse_split(self):
        self.assertEqual(foucs._parse_split("train"), "train")
        self.assertEqual(foucs._parse_split("train_extra"), "train_extra")
        self.assertEqual(foucs._parse_split("validation"), "val")
        self.assertEqual(foucs._parse_split("test"), "test")

        with self.assertRaises(ValueError):
            foucs._parse_split("bad-split")


if __name__ == "__main__":
    unittest.main(verbosity=2)
