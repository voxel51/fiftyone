"""
Tests for fiftyone/utils/sam2.py.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest
from unittest import mock

import pytest

import fiftyone.utils.sam2 as fosam2


class TestSam2ImagePredictDevice(unittest.TestCase):
    """predict() moves the CPU-built prompt tensors onto the model's device
    before the low-level _predict (which, unlike SAM2's public predict,
    assumes they're already there) -- so GPU inference doesn't mismatch cpu
    coords with cuda weights."""

    def _predictor(self, device):
        # bypass __init__ (it builds a real SAM2ImagePredictor); we only
        # exercise predict() against a stub processor.
        p = fosam2._SAM2Predictor.__new__(fosam2._SAM2Predictor)
        p.processor = mock.Mock()
        p.processor.device = device
        p.processor._predict.return_value = ("masks", "iou", "low")
        return p

    def test_prompts_moved_to_device(self):
        p = self._predictor("cuda:0")
        pc, pl, bx = mock.Mock(), mock.Mock(), mock.Mock()
        pc.to.return_value = "pc_cuda"
        pl.to.return_value = "pl_cuda"
        bx.to.return_value = "bx_cuda"

        p.predict(point_coords=pc, point_labels=pl, boxes=bx)

        pc.to.assert_called_once_with("cuda:0")
        pl.to.assert_called_once_with("cuda:0")
        bx.to.assert_called_once_with("cuda:0")
        kw = p.processor._predict.call_args.kwargs
        self.assertEqual(
            (kw["point_coords"], kw["point_labels"], kw["boxes"]),
            ("pc_cuda", "pl_cuda", "bx_cuda"),
        )

    def test_none_prompts_stay_none(self):
        p = self._predictor("cuda:0")
        pc = mock.Mock()
        pc.to.return_value = "pc_cuda"

        p.predict(point_coords=pc, point_labels=None, boxes=None)

        kw = p.processor._predict.call_args.kwargs
        self.assertEqual(kw["point_coords"], "pc_cuda")
        self.assertIsNone(kw["point_labels"])
        self.assertIsNone(kw["boxes"])


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
