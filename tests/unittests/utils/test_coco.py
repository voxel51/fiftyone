"""
Tests for fiftyone/utils/coco.py.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import numpy as np
import pycocotools.mask as mask_utils

import fiftyone.utils.coco as fouc


def test_coco_segmentation_to_mask_does_not_retain_frame():
    frame = np.zeros((1080, 1920), dtype=np.uint8, order="F")
    frame[100:110, 200:204] = 1
    rle = mask_utils.encode(frame)

    mask = fouc._coco_segmentation_to_mask(
        rle, [200, 100, 4, 10], (1920, 1080)
    )

    assert mask.shape == (10, 4)
    assert mask.all()
    assert mask.base is None
