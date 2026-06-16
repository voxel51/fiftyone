"""
`Point Transformer V3 <https://github.com/Pointcept/PointTransformerV3>`_
wrapper for the FiftyOne Model Zoo.

Point Transformer V3 (PTv3) is a point cloud transformer for 3D perception. This
wrapper exposes a pretrained PTv3 backbone as a FiftyOne embeddings model that
maps a point cloud to a single feature vector, suitable for similarity,
visualization, and deduplication of 3D samples.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import Optional

import numpy as np

import fiftyone.core.config as foc
import fiftyone.core.media as fom
import fiftyone.core.models as fomo
import fiftyone.core.utils as fou
import fiftyone.zoo.models as fozm

fou.ensure_torch()
import torch


# The nuScenes ``PTv3-base`` backbone configuration. These match the upstream
# config the released checkpoint was trained with; see
# https://github.com/Pointcept/Pointcept/blob/main/configs/nuscenes
_PTV3_BASE_CONFIG = {
    "in_channels": 4,
    "order": ["z", "z-trans", "hilbert", "hilbert-trans"],
    "stride": (2, 2, 2, 2),
    "enc_depths": (2, 2, 2, 6, 2),
    "enc_channels": (32, 64, 128, 256, 512),
    "enc_num_head": (2, 4, 8, 16, 32),
    "enc_patch_size": (1024, 1024, 1024, 1024, 1024),
    "dec_depths": (2, 2, 2, 2),
    "dec_channels": (64, 64, 128, 256),
    "dec_num_head": (4, 4, 8, 16),
    "dec_patch_size": (1024, 1024, 1024, 1024),
    "mlp_ratio": 4,
    "qkv_bias": True,
    "enable_flash": False,
    "enable_rpe": False,
    "upcast_attention": False,
    "enc_mode": False,
    # Disable per-call serialization-order shuffling so a given point cloud
    # always produces the same embedding (the upstream default randomizes the
    # order each forward pass, which is meant for train-time augmentation and
    # makes embeddings non-reproducible for similarity/dedup)
    "shuffle_orders": False,
}


class PointTransformerV3ModelConfig(foc.Config, fozm.HasZooModel):
    """Configuration for running a :class:`PointTransformerV3Model`.

    Args:
        model_path (None): the path to the model weights to load. Populated
            automatically when loading from the model zoo
        grid_size (0.05): the voxel grid size, in meters, used to serialize the
            point cloud before inference. Must match the value the checkpoint
            was trained with (0.05 m for the nuScenes ``PTv3-base`` backbone)
        feature_keys (("coord", "strength")): the per-point input features the
            backbone consumes, in order. ``"coord"`` expands to the three xyz
            columns; any other key consumes one column of the input cloud. The
            total width must equal the backbone's ``in_channels``
        device (None): the device to use, e.g. ``"cuda"`` or ``"cpu"``. If not
            provided, GPU is used when available
    """

    def __init__(self, d):
        d = self.init(d)

        self.model_path = self.parse_string(d, "model_path", default=None)
        self.grid_size = self.parse_number(d, "grid_size", default=0.05)
        if self.grid_size <= 0:
            raise ValueError(
                "grid_size must be a positive value, in meters; found %s"
                % (self.grid_size,)
            )
        self.feature_keys = tuple(
            self.parse_array(
                d, "feature_keys", default=["coord", "strength"]
            )
        )
        self.device = self.parse_string(d, "device", default=None)


class PointTransformerV3Model(fomo.Model, fomo.EmbeddingsMixin):
    """FiftyOne embeddings wrapper around a Point Transformer V3 backbone.

    The model maps a point cloud of shape ``(num_points, num_features)`` to a
    single embedding vector by mean-pooling the backbone's per-point features.
    The input columns must match :attr:`PointTransformerV3ModelConfig.feature_keys`,
    e.g. ``(x, y, z, intensity)`` for the default nuScenes checkpoint.

    Inference is GPU-only and peaks near 6 GB of VRAM on a full nuScenes-scale
    sweep (~34k points); at least 8 GB is recommended.

    Example::

        import numpy as np
        import fiftyone.zoo as foz

        model = foz.load_zoo_model("point-transformer-v3-nuscenes-torch")

        cloud = np.random.rand(20000, 4).astype("float32")  # x, y, z, intensity
        embedding = model.embed(cloud)                       # (64,)

    Args:
        config: a :class:`PointTransformerV3ModelConfig`
    """

    def __init__(self, config):
        self.config = config

        self._device = config.device
        if self._device is None:
            self._device = "cuda" if torch.cuda.is_available() else "cpu"

        self._coord_index = self._build_coord_index(config.feature_keys)
        self._model = self._load_model(config)
        self._embeddings = None

    @staticmethod
    def _build_coord_index(feature_keys):
        # Maps each feature key to the column(s) it consumes in the input cloud
        index = []
        col = 0
        for key in feature_keys:
            width = 3 if key == "coord" else 1
            index.append((key, col, col + width))
            col += width

        return index, col

    @property
    def media_type(self):
        return fom.THREE_D

    @property
    def has_embeddings(self):
        return True

    @property
    def ragged_batches(self):
        # Point clouds have varying numbers of points
        return True

    @property
    def transforms(self):
        return None

    @property
    def preprocess(self):
        # Voxelization and serialization are performed inside predict()
        return False

    @preprocess.setter
    def preprocess(self, value):
        pass

    def _load_model(self, config):
        from fiftyone.utils.ptv3_arch import PointTransformerV3

        model = PointTransformerV3(**_PTV3_BASE_CONFIG)

        state_dict = _load_backbone_state_dict(config.model_path)
        missing, unexpected = model.load_state_dict(state_dict, strict=False)
        if missing or unexpected:
            raise ValueError(
                "Failed to cleanly load Point Transformer V3 weights: "
                "%d missing and %d unexpected keys. The checkpoint does not "
                "match the expected backbone architecture"
                % (len(missing), len(unexpected))
            )

        return model.to(self._device).eval()

    def predict(self, arg):
        """Embeds a single point cloud.

        Args:
            arg: a ``(num_points, num_features)`` array whose columns match
                :attr:`PointTransformerV3ModelConfig.feature_keys`

        Returns:
            a :class:`fiftyone.core.labels.Label`-free embedding is stored; use
            :meth:`embed` to retrieve it
        """
        point = self._build_input(arg)
        with torch.inference_mode():
            out = self._model(point)
            per_point = out.feat if hasattr(out, "feat") else out["feat"]
            embedding = per_point.mean(dim=0)

        self._embeddings = embedding.detach().float().cpu().numpy()[np.newaxis]
        return None

    def predict_all(self, args):
        return [self.predict(arg) for arg in args]

    def get_embeddings(self):
        if self._embeddings is None:
            raise ValueError("No embeddings available; call predict() first")

        return self._embeddings

    def embed(self, arg):
        self.predict(arg)
        return self.get_embeddings()[0]

    def embed_all(self, args):
        return np.stack([self.embed(arg) for arg in args])

    def _build_input(self, cloud):
        cloud = np.asarray(cloud, dtype=np.float32)
        if cloud.ndim != 2:
            raise ValueError(
                "Expected a 2D (num_points, num_features) point cloud, but "
                "found shape %s" % (cloud.shape,)
            )

        if cloud.shape[0] == 0:
            raise ValueError("Point cloud is empty; found 0 points")

        _, expected_width = self._coord_index
        if cloud.shape[1] < 3:
            raise ValueError(
                "Point cloud must have at least 3 columns (xyz), but found %d"
                % cloud.shape[1]
            )

        if cloud.shape[1] < expected_width:
            # Zero-fill features the input does not provide, e.g. intensity for
            # an xyz-only point cloud read from a .pcd file
            pad = np.zeros(
                (cloud.shape[0], expected_width - cloud.shape[1]),
                dtype=np.float32,
            )
            cloud = np.concatenate([cloud, pad], axis=1)

        index, _ = self._coord_index
        coord = None
        feats = []
        for key, start, end in index:
            block = cloud[:, start:end]
            if key == "coord":
                coord = block
            feats.append(block)

        if coord is None:
            raise ValueError(
                "feature_keys must include 'coord' to provide xyz coordinates"
            )

        feat = np.concatenate(feats, axis=1)

        grid_size = self.config.grid_size
        grid_coord = np.floor(coord / grid_size).astype(np.int64)

        # One representative point per occupied voxel, shifted to the origin so
        # the space-filling-curve serialization stays within its bit budget
        _, keep = np.unique(grid_coord, axis=0, return_index=True)
        coord, feat, grid_coord = coord[keep], feat[keep], grid_coord[keep]
        grid_coord = grid_coord - grid_coord.min(axis=0, keepdims=True)

        num_points = coord.shape[0]
        return {
            "coord": torch.from_numpy(np.ascontiguousarray(coord)).to(
                self._device
            ),
            "grid_coord": torch.from_numpy(
                np.ascontiguousarray(grid_coord)
            ).to(self._device),
            "feat": torch.from_numpy(np.ascontiguousarray(feat)).to(
                self._device
            ),
            "offset": torch.tensor(
                [num_points], dtype=torch.long, device=self._device
            ),
        }


def _load_backbone_state_dict(model_path: str) -> dict:
    """Loads a PTv3 backbone state dict from ``model_path``.

    Supports both a safetensors file (the shipped, pickle-free format) and a raw
    training checkpoint, from which the ``module.backbone.`` weights are
    extracted.

    Args:
        model_path: the path to the weights file

    Returns:
        a ``{name: tensor}`` state dict for the backbone
    """
    if model_path is None:
        raise ValueError("No model_path provided")

    if model_path.endswith(".safetensors"):
        from safetensors.torch import load_file

        return load_file(model_path)

    state = torch.load(model_path, map_location="cpu", weights_only=False)
    state_dict = state.get("state_dict", state)

    prefix = "module.backbone."
    backbone = {
        key[len(prefix):]: value
        for key, value in state_dict.items()
        if key.startswith(prefix)
    }
    if not backbone:
        raise ValueError(
            "Found no 'module.backbone.' weights in checkpoint '%s'"
            % model_path
        )

    return backbone
