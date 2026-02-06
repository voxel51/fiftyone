"""
`MapAnything <https://github.com/facebookresearch/map-anything>`_
wrapper for the FiftyOne Model Zoo.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
import os
import tempfile

import numpy as np
from PIL import Image

import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

logger = logging.getLogger(__name__)

DEFAULT_MAPANYTHING_MODEL = "facebook/map-anything-apache"


def _ensure_mapanything():
    if not fou.ensure_package("mapanything", error_level=2):
        fou.install_package(
            "git+https://github.com/facebookresearch/map-anything.git"
        )


mapanything_models = fou.lazy_import(
    "mapanything.models.mapanything", callback=_ensure_mapanything
)
mapanything_image = fou.lazy_import(
    "mapanything.utils.image", callback=_ensure_mapanything
)
mapanything_geometry = fou.lazy_import(
    "mapanything.utils.geometry", callback=_ensure_mapanything
)


class MapAnythingModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for running a :class:`MapAnythingModel`.

    See :class:`fiftyone.utils.torch.TorchImageModelConfig` for additional
    arguments.

    Args:
        hf_repo (None): the HuggingFace model repo to load. Defaults to
            ``"facebook/map-anything-apache"``
        output_type ("depth"): the output type. Supported values are
            ``"depth"`` (normalized depth heatmaps) and ``"pointcloud"``
            (per-pixel 3D point maps stored as numpy arrays)
        use_amp (True): whether to use automatic mixed precision
        amp_dtype ("bf16"): the AMP dtype. ``"bf16"``, ``"fp16"``, or
            ``"fp32"``
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)

        self.hf_repo = self.parse_string(
            d, "hf_repo", default=DEFAULT_MAPANYTHING_MODEL
        )
        self.output_type = self.parse_string(
            d, "output_type", default="depth"
        )
        self.use_amp = self.parse_bool(d, "use_amp", default=True)
        self.amp_dtype = self.parse_string(d, "amp_dtype", default="bf16")


class MapAnythingModel(fout.TorchImageModel):
    """Wrapper for running
    `MapAnything <https://github.com/facebookresearch/map-anything>`_
    inference.

    MapAnything is a universal feed-forward transformer for metric 3D
    reconstruction.  Given one or more images it predicts depth maps,
    camera intrinsics, camera poses, 3D point clouds, and confidence masks.

    The wrapper exposes two output modes:

    -   ``output_type="depth"`` (default): stores a normalized depth
        :class:`fiftyone.core.labels.Heatmap` per sample.
    -   ``output_type="pointcloud"``: stores a
        :class:`fiftyone.core.labels.Classification` with the world-frame
        point cloud attached as a numpy array in the ``points3d`` attribute.

    Example usage::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset(
            "quickstart", max_samples=5, shuffle=True, seed=51
        )

        # Depth heatmaps
        model = foz.load_zoo_model("map-anything-apache-torch")
        dataset.apply_model(model, label_field="ma_depth")

        # 3D point clouds
        model = foz.load_zoo_model(
            "map-anything-apache-torch", output_type="pointcloud"
        )
        dataset.apply_model(model, label_field="ma_points")

        session = fo.launch_app(dataset)

    Args:
        config: a :class:`MapAnythingModelConfig`
    """

    def __init__(self, config):
        config.raw_inputs = True
        super().__init__(config)
        self._hf_repo = config.hf_repo
        self._output_type = config.output_type
        self._use_amp = config.use_amp
        self._amp_dtype = config.amp_dtype

    def _load_model(self, config):
        """Load the MapAnything model from HuggingFace."""
        fou.ensure_torch()
        import torch

        if config.device is not None:
            device = torch.device(config.device)
        elif torch.cuda.is_available():
            device = torch.device("cuda")
        else:
            device = torch.device("cpu")

        model = mapanything_models.MapAnything.from_pretrained(
            config.hf_repo
        ).to(device)
        model.eval()
        return model

    @property
    def media_type(self):
        return "image"

    def _to_pil(self, img):
        """Convert any image input to PIL RGB."""
        if isinstance(img, str):
            return Image.open(img).convert("RGB")

        if isinstance(img, Image.Image):
            return img.convert("RGB")

        if isinstance(img, np.ndarray):
            return Image.fromarray(img).convert("RGB")

        pil_img = fout.ToPILImage()(img)
        return pil_img.convert("RGB")

    def _predict_all(self, imgs):
        """Run MapAnything inference on a list of images."""
        fou.ensure_torch()
        import torch

        if not isinstance(imgs, list):
            imgs = [imgs]

        if len(imgs) == 0:
            return []

        outputs = []
        with torch.no_grad():
            for img in imgs:
                pil_img = self._to_pil(img)

                tmp = tempfile.NamedTemporaryFile(
                    suffix=".png", delete=False
                )
                pil_img.save(tmp.name)
                tmp.close()

                try:
                    views = mapanything_image.load_images([tmp.name])
                finally:
                    os.unlink(tmp.name)

                preds = self._model.infer(
                    views,
                    memory_efficient_inference=True,
                    minibatch_size=1,
                    use_amp=self._use_amp,
                    amp_dtype=self._amp_dtype,
                    apply_mask=True,
                    mask_edges=True,
                )

                pred = preds[0]

                if self._output_type == "depth":
                    depth = (
                        pred["depth_z"][0].squeeze(-1).cpu().numpy()
                    )
                    depth_max = depth.max()
                    if depth_max > 0:
                        depth_norm = depth / depth_max
                    else:
                        depth_norm = depth
                    outputs.append(fol.Heatmap(map=depth_norm))

                elif self._output_type == "pointcloud":
                    depth_z = pred["depth_z"][0].squeeze(-1)
                    intrinsics = pred["intrinsics"][0]
                    camera_pose = pred["camera_poses"][0]

                    pts3d, valid = (
                        mapanything_geometry.depthmap_to_world_frame(
                            depth_z, intrinsics, camera_pose
                        )
                    )
                    mask = (
                        pred["mask"][0]
                        .squeeze(-1)
                        .cpu()
                        .numpy()
                        .astype(bool)
                        & valid.cpu().numpy()
                    )
                    pts3d_np = pts3d.cpu().numpy()

                    outputs.append(
                        fol.Classification(
                            label="3d_pointcloud",
                            points3d=pts3d_np[mask].tolist(),
                        )
                    )
                else:
                    raise ValueError(
                        "output_type must be 'depth' or 'pointcloud', "
                        "got '%s'" % self._output_type
                    )

        return outputs
