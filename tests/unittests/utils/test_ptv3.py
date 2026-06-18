"""
Tests for fiftyone/utils/ptv3.py.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import numpy as np
import pytest
import torch

import fiftyone.core.models as fomo
from fiftyone.utils.ptv3 import (
    PointTransformerV3Model,
    PointTransformerV3ModelConfig,
    _load_backbone_state_dict,
)


def _make_model(
    feature_keys=("coord", "strength"),
    grid_size=0.05,
    point_cloud_range=None,
    forward=None,
):
    """Builds a model with the heavy backbone load bypassed and a fake forward."""
    model = PointTransformerV3Model.__new__(PointTransformerV3Model)
    model._device = "cpu"
    model._coord_index = PointTransformerV3Model._build_coord_index(feature_keys)

    cfg = type("Cfg", (), {})()
    cfg.grid_size = grid_size
    cfg.feature_keys = feature_keys
    cfg.point_cloud_range = point_cloud_range
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
        with pytest.raises(ValueError, match="at least 3 columns"):
            model._build_input(np.random.rand(10, 2).astype("float32"))

    def test_rejects_non_2d_input(self):
        model = _make_model()
        with pytest.raises(ValueError, match="2D"):
            model._build_input(np.random.rand(10).astype("float32"))

    def test_rejects_empty_cloud(self):
        model = _make_model()
        with pytest.raises(ValueError, match="empty"):
            model._build_input(np.zeros((0, 4), dtype=np.float32))

    def test_crops_to_point_cloud_range(self):
        model = _make_model(point_cloud_range=[-1, -1, -1, 1, 1, 1])
        cloud = np.array(
            [
                [0.0, 0.0, 0.0, 0.5],   # inside
                [0.5, -0.5, 0.2, 0.1],  # inside
                [10.0, 0.0, 0.0, 0.3],  # outside (x)
                [0.0, 0.0, 5.0, 0.7],   # outside (z)
            ],
            dtype=np.float32,
        )
        point = model._build_input(cloud)
        assert point["coord"].shape[0] == 2  # only the two in-range points

    def test_rejects_when_range_excludes_all(self):
        model = _make_model(point_cloud_range=[100, 100, 100, 200, 200, 200])
        with pytest.raises(ValueError, match="point_cloud_range"):
            model._build_input(np.random.rand(50, 4).astype("float32"))


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

    def test_embed_is_pure_no_stored_state(self):
        # embed() must not depend on or mutate shared instance state
        model = _make_model()
        emb = model.embed(np.random.rand(40, 4).astype("float32"))
        assert emb.shape == (64,)
        assert model._embeddings is None  # embed does not stash state

    def test_predict_all_stores_all_embeddings(self):
        model = _make_model()
        clouds = [np.random.rand(50, 4).astype("float32") for _ in range(3)]
        out = model.predict_all(clouds)
        assert out == [None, None, None]
        assert model.get_embeddings().shape == (3, 64)


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

    def test_raises_when_empty_model_path(self):
        with pytest.raises(ValueError):
            _load_backbone_state_dict("")


class TestConfig:
    def test_default_grid_size_matches_checkpoint(self):
        config = PointTransformerV3ModelConfig({})
        assert config.grid_size == 0.05

    def test_rejects_nonpositive_grid_size(self):
        with pytest.raises(ValueError, match="grid_size"):
            PointTransformerV3ModelConfig({"grid_size": 0})

    def test_rejects_bad_conv_algo(self):
        with pytest.raises(ValueError, match="conv_algo"):
            PointTransformerV3ModelConfig({"conv_algo": "bogus"})

    def test_rejects_bad_point_cloud_range(self):
        with pytest.raises(ValueError, match="point_cloud_range"):
            PointTransformerV3ModelConfig({"point_cloud_range": [0, 0, 0]})

    def test_rejects_unordered_point_cloud_range(self):
        with pytest.raises(ValueError, match="min < max"):
            PointTransformerV3ModelConfig(
                {"point_cloud_range": [1, 1, 1, -1, -1, -1]}
            )

    def test_accepts_optional_params(self):
        config = PointTransformerV3ModelConfig(
            {
                "conv_algo": "native",
                "point_cloud_range": [-1, -1, -1, 1, 1, 1],
            }
        )
        assert config.conv_algo == "native"
        assert len(config.point_cloud_range) == 6

    def test_zoo_deployment_resolves_config_class(self):
        # The eta ModelConfig wrapper resolves the leaf config as
        # "<model-type>Config", so the class must be named
        # PointTransformerV3ModelConfig for foz.load_zoo_model to work
        deployment = {
            "type": "fiftyone.utils.ptv3.PointTransformerV3Model",
            "config": {
                "model_path": "/tmp/ptv3.pth",
                "grid_size": 0.05,
                "feature_keys": ["coord", "strength"],
            },
        }
        model_config = fomo.ModelConfig(deployment)
        assert isinstance(model_config.config, PointTransformerV3ModelConfig)
        assert model_config.config.grid_size == 0.05


class TestLoadSamplePointCloud:
    @staticmethod
    def _patch_reader(monkeypatch, points, colors):
        import fiftyone.utils.utils3d as fou3d

        pc = type("PC", (), {})()
        pc.points = points
        pc.colors = colors

        reader = type("IO", (), {})()
        reader.read_point_cloud = staticmethod(lambda path: pc)

        fake = type("O3d", (), {})()
        fake.io = reader
        monkeypatch.setattr(fou3d, "o3d", fake)

    def test_appends_intensity_from_color_channel(self, monkeypatch):
        from fiftyone.core.models import _load_sample_point_cloud

        xyz = np.random.rand(12, 3)
        rgb = np.random.rand(12, 3)  # FiftyOne stores intensity in R channel
        self._patch_reader(monkeypatch, xyz, rgb)

        sample = type("S", (), {"filepath": "/data/foo.pcd"})()
        points = _load_sample_point_cloud(sample)

        assert points.shape == (12, 4)
        np.testing.assert_allclose(
            points[:, 3], rgb[:, 0].astype("float32"), rtol=1e-6
        )

    def test_xyz_only_when_no_color_channel(self, monkeypatch):
        from fiftyone.core.models import _load_sample_point_cloud

        xyz = np.random.rand(12, 3)
        empty = np.zeros((0, 3))  # Open3D returns no colors for xyz-only PCDs
        self._patch_reader(monkeypatch, xyz, empty)

        sample = type("S", (), {"filepath": "/data/foo.pcd"})()
        points = _load_sample_point_cloud(sample)

        assert points.shape == (12, 3)


class TestGpuRequirement:
    def test_requires_gpu(self, monkeypatch):
        monkeypatch.setattr(torch.cuda, "is_available", lambda: False)
        with pytest.raises(ValueError, match="GPU"):
            PointTransformerV3Model(object())
