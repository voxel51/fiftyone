"""
FiftyOne VQA evaluation unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

import fiftyone as fo
from fiftyone import ViewField as F
from fiftyone.utils.eval.vqa import _normalize_answer

from decorators import drop_datasets


class VQANormalizerTests(unittest.TestCase):
    def test_normalize_answer(self):
        # golden cases pinned to the official VQAv2 normalizer
        # (github.com/GT-Vision-Lab/VQA vqaEval.py)
        cases = [
            ("1,000", "1000"),  # comma removed, no space inserted
            ("4.5", "4.5"),  # decimal point preserved
            ("5.", "5"),  # trailing period stripped
            ("The cat", "cat"),  # article dropped + lowercased
            ("black and white", "black and white"),  # "and" retained
            ("Two", "2"),  # number-word mapped
            ("dont know", "don't know"),  # contraction expanded
            ("yes!", "yes"),  # punct replaced with space, then split
            ("a man's hat", "man's hat"),  # apostrophe untouched
        ]
        for in_answer, expected in cases:
            self.assertEqual(_normalize_answer(in_answer), expected)


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
