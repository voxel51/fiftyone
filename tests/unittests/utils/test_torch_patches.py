"""
Tests for fiftyone/utils/torch.py transformed-patch stacking.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import numpy as np
import torch

import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout


class TestStackTransformedPatches:
    def test_tensor_patches(self):
        patches = [torch.zeros(3, 4, 4), torch.ones(3, 4, 4)]
        out = fout._stack_transformed_patches(patches, use_numpy=False)
        assert out.shape == (2, 3, 4, 4)

    def test_numpy_patches(self):
        patches = [np.zeros((4, 4, 3)), np.ones((4, 4, 3))]
        out = fout._stack_transformed_patches(patches, use_numpy=True)
        assert out.shape == (2, 4, 4, 3)

    def test_mapping_patches_merged(self):
        # HF processors return dict-like features per patch (issue #6366);
        # they must merge along the batch dimension, not stack
        patches = [
            {
                "pixel_values": torch.zeros(1, 3, 4, 4),
                "fo_image_size": torch.tensor([[4, 4]]),
            },
            {
                "pixel_values": torch.ones(1, 3, 4, 4),
                "fo_image_size": torch.tensor([[4, 4]]),
            },
        ]
        out = fout._stack_transformed_patches(patches, use_numpy=False)
        assert set(out.keys()) == {"pixel_values", "fo_image_size"}
        assert out["pixel_values"].shape == (2, 3, 4, 4)
        assert out["fo_image_size"].shape == (2, 2)
        assert out["pixel_values"][1].max() == 1


class TestIterSlicesMapping:
    def test_mapping_sliced_per_key(self):
        # dict-like batches slice along the batch dimension (issue #6366)
        batch = {
            "pixel_values": torch.arange(5).reshape(5, 1),
            "fo_image_size": torch.zeros(5, 2),
        }
        chunks = list(fou.iter_slices(batch, 2))
        assert len(chunks) == 3
        assert [len(c["pixel_values"]) for c in chunks] == [2, 2, 1]
        assert chunks[2]["pixel_values"][0][0] == 4

    def test_mapping_none_batch_size_passthrough(self):
        batch = {"pixel_values": torch.zeros(3, 1)}
        chunks = list(fou.iter_slices(batch, None))
        assert len(chunks) == 1
        assert chunks[0] is batch
