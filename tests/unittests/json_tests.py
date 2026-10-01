"""
FiftyOne JSON handling tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

import numpy as np

import fiftyone.core.json as foj
import fiftyone.core.utils as fou


class StringifyMaskTests(unittest.TestCase):
    def test_c_ordered_mask_matches_round_trip(self):
        mask = np.arange(12, dtype=np.uint8).reshape(3, 4) > 5
        raw = fou.serialize_numpy_array(mask)

        actual = foj.stringify({"_cls": "Detection", "mask": raw})["mask"]

        expected = fou.serialize_numpy_array(
            fou.deserialize_numpy_array(raw), ascii=True
        )
        self.assertEqual(actual, expected)

    def test_fortran_ordered_mask_is_made_contiguous(self):
        mask = np.asfortranarray(np.arange(12, dtype=np.uint8).reshape(3, 4))
        raw = fou.serialize_numpy_array(mask)

        actual = foj.stringify({"_cls": "Segmentation", "mask": raw})["mask"]

        array = fou.deserialize_numpy_array(actual, ascii=True)
        self.assertFalse(np.isfortran(array))
        np.testing.assert_array_equal(array, mask)
        self.assertNotEqual(actual, fou.serialize_numpy_array(mask, True))

    def test_non_mask_array_is_its_shape(self):
        raw = fou.serialize_numpy_array(np.zeros((2, 5)))

        actual = foj.stringify({"_cls": "Classification", "logits": raw})

        self.assertEqual(actual["logits"], "(2, 5)")

    def test_other_bytes_are_stringified(self):
        actual = foj.stringify({"_cls": "Detection", "mask": b"not numpy"})

        self.assertEqual(actual["mask"], str(b"not numpy"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
