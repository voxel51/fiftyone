"""
Tests for fiftyone/utils/ptv3.py.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import numpy as np
import pytest
import torch

from fiftyone.utils.ptv3 import (
    PointTransformerV3Model,
    _load_backbone_state_dict,
)


def _make_model(feature_keys=("coord", "strength"), grid_size=0.025, forward=None):
    """Builds a model with the heavy backbone load bypassed and a fake forward."""
    model = PointTransformerV3Model.__new__(PointTransformerV3Model)
    model._device = "cpu"
    model._coord_index = PointTransformerV3Model._build_coord_index(feature_keys)

    cfg = type("Cfg", (), {})()
    cfg.grid_size = grid_size
    cfg.feature_keys = feature_keys
    model.config = cfg

    if forward is None:

        def forward(point):
            n = point["coord"].shape[0]
            feat = torch.arange(n * 64, dtype=torch.float32).reshape(n, 64)
            return type("Out", (), {"feat": feat})()

    model._model = forward
    model._embeddings = None
    return model


class TestCoordIndex:
    def test_coord_strength_index(self):
        index, width = PointTransformerV3Model._build_coord_index(
            ("coord", "strength")
        )
        assert width == 4
        assert index == [("coord", 0, 3), ("strength", 3, 4)]

    def test_coord_only_index(self):
        index, width = PointTransformerV3Model._build_coord_index(("coord",))
        assert width == 3
        assert index == [("coord", 0, 3)]


class TestBuildInput:
    def test_voxelizes_dedups_and_shifts_to_origin(self):
        model = _make_model()
        cloud = np.array(
            [
                [-10.0, -10.0, -10.0, 0.5],
                [-10.0, -10.0, -10.0, 0.7],  # same voxel as the first point
                [5.0, 5.0, 5.0, 0.1],
            ],
            dtype=np.float32,
        )
        point = model._build_input(cloud)

        gc = point["grid_coord"].cpu().numpy()
        assert gc.min() >= 0  # serialization requires non-negative coords
        assert point["coord"].shape[0] == 2  # the duplicate voxel was merged
        assert point["feat"].shape[1] == 4
        assert int(point["offset"][0]) == point["coord"].shape[0]

    def test_pads_missing_intensity_with_zeros(self):
        model = _make_model()
        cloud = np.random.rand(50, 3).astype("float32")  # xyz only
        point = model._build_input(cloud)

        assert point["feat"].shape[1] == 4
        assert torch.count_nonzero(point["feat"][:, 3]) == 0

    def test_rejects_too_few_columns(self):
        model = _make_model()
        with pytest.raises(ValueError):
            model._build_input(np.random.rand(10, 2).astype("float32"))

    def test_rejects_non_2d_input(self):
        model = _make_model()
        with pytest.raises(ValueError):
            model._build_input(np.random.rand(10).astype("float32"))


class TestEmbed:
    def test_embed_returns_mean_pooled_vector(self):
        model = _make_model()
        emb = model.embed(np.random.rand(100, 4).astype("float32"))
        assert emb.shape == (64,)
        assert emb.dtype == np.float32

    def test_get_embeddings_has_batch_axis(self):
        model = _make_model()
        model.predict(np.random.rand(100, 4).astype("float32"))
        assert model.get_embeddings().shape == (1, 64)

    def test_get_embeddings_before_predict_raises(self):
        model = _make_model()
        with pytest.raises(ValueError):
            model.get_embeddings()

    def test_embed_all_stacks_along_axis0(self):
        model = _make_model()
        clouds = [np.random.rand(50, 4).astype("float32") for _ in range(3)]
        assert model.embed_all(clouds).shape == (3, 64)


class TestProperties:
    def test_model_properties(self):
        model = _make_model()
        assert model.media_type == "3d"
        assert model.has_embeddings is True
        assert model.ragged_batches is True
        assert model.transforms is None
        assert model.preprocess is False


class TestStateDictLoading:
    def test_strips_module_backbone_prefix(self, tmp_path):
        sd = {
            "module.backbone.embedding.stem.conv.weight": torch.zeros(3),
            "module.backbone.enc.enc0.block0.norm.bias": torch.zeros(2),
            "module.criteria.0.weight": torch.zeros(1),  # not a backbone weight
        }
        path = str(tmp_path / "ckpt.pth")
        torch.save({"state_dict": sd}, path)

        out = _load_backbone_state_dict(path)
        assert set(out.keys()) == {
            "embedding.stem.conv.weight",
            "enc.enc0.block0.norm.bias",
        }

    def test_raises_when_no_backbone_weights(self, tmp_path):
        path = str(tmp_path / "ckpt.pth")
        torch.save({"state_dict": {"head.weight": torch.zeros(1)}}, path)
        with pytest.raises(ValueError):
            _load_backbone_state_dict(path)

    def test_loads_safetensors_directly(self, tmp_path):
        pytest.importorskip("safetensors")
        from safetensors.torch import save_file

        path = str(tmp_path / "weights.safetensors")
        save_file({"embedding.stem.conv.weight": torch.zeros(3)}, path)

        out = _load_backbone_state_dict(path)
        assert "embedding.stem.conv.weight" in out

    def test_raises_when_no_model_path(self):
        with pytest.raises(ValueError):
            _load_backbone_state_dict(None)
