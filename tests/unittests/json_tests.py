"""
FiftyOne JSON stringify unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

import numpy as np

import fiftyone.core.json as foj
import fiftyone.core.utils as fou


class NumpyArrayStringifyTests(unittest.TestCase):
    def test_mask_bytes_are_passed_through_when_c_ordered(self):
        array = np.arange(12, dtype=np.uint8).reshape(3, 4)
        raw = fou.serialize_numpy_array(array)

        out = foj.stringify({"_cls": "Segmentation", "mask": raw})

        # The stored bytes are already the wire format; no re-encode
        self.assertEqual(
            out["mask"], fou.serialize_numpy_array(array, ascii=True)
        )
        np.testing.assert_array_equal(
            fou.deserialize_numpy_array(out["mask"], ascii=True), array
        )

    def test_fortran_ordered_mask_is_made_contiguous(self):
        array = np.asfortranarray(np.arange(12, dtype=np.uint8).reshape(3, 4))
        raw = fou.serialize_numpy_array(array)

        out = foj.stringify({"_cls": "Heatmap", "map": raw})

        back = fou.deserialize_numpy_array(out["map"], ascii=True)
        np.testing.assert_array_equal(back, array)
        self.assertTrue(back.flags.c_contiguous)

    def test_uint16_mask_round_trips(self):
        array = np.full((2, 3), 300, dtype=np.uint16)
        raw = fou.serialize_numpy_array(array)

        out = foj.stringify({"_cls": "Segmentation", "mask": raw})

        back = fou.deserialize_numpy_array(out["mask"], ascii=True)
        self.assertEqual(back.dtype, np.uint16)
        np.testing.assert_array_equal(back, array)

    def test_non_mask_bytes_become_a_shape_string(self):
        array = np.zeros((5, 7, 3), dtype=np.float32)
        raw = fou.serialize_numpy_array(array)

        out = foj.stringify({"_cls": "Embedding", "vector": raw})

        self.assertEqual(out["vector"], "(5, 7, 3)")

    def test_unreadable_bytes_fall_back_to_str(self):
        out = foj.stringify({"_cls": "Segmentation", "mask": b"not numpy"})

        self.assertEqual(out["mask"], str(b"not numpy"))


if __name__ == "__main__":
    fou.run_tests_main()
