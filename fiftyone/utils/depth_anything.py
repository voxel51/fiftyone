"""
`Depth Anything V3 <https://github.com/ByteDance-Seed/depth-anything-3>`_
wrapper for the FiftyOne Model Zoo.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
import os

import cv2
import numpy as np
from PIL import Image

import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

fou.ensure_torch()
import torch

logger = logging.getLogger(__name__)


def _ensure_depth_anything_3():
    try:
        fou.ensure_package("depth-anything-3")
    except ImportError:
        logger.info("Installing depth-anything-3 from GitHub...")
        fou.install_package(
            "git+https://github.com/ByteDance-Seed/depth-anything-3.git"
        )
        fou.ensure_import("depth_anything_3")


da3_api = fou.lazy_import(
    "depth_anything_3.api",
    callback=_ensure_depth_anything_3,
)

DEFAULT_DA3_MODEL = "depth-anything/da3-large"


class DepthAnythingV3ModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for running a :class:`DepthAnythingV3Model`.

    See :class:`fiftyone.utils.torch.TorchImageModelConfig` for additional
    arguments.

    Args:
        name_or_path ("depth-anything/da3-large"): the name or path to the
            Depth Anything V3 model
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)

        self.name_or_path = self.parse_string(
            d, "name_or_path", default=DEFAULT_DA3_MODEL
        )


class DepthAnythingV3Model(fout.TorchImageModel):
    """Wrapper for running
    `Depth Anything V3 <https://github.com/ByteDance-Seed/depth-anything-3>`_
    inference.

    Depth Anything V3 is a foundation model for monocular depth estimation
    that uses a plain Vision Transformer backbone and produces metric depth
    predictions along with camera intrinsics and extrinsics.

    Example usage::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset(
            "quickstart", max_samples=5, shuffle=True, seed=51
        )

        model = foz.load_zoo_model("depth-anything-v3-large-torch")

        dataset.apply_model(model, label_field="depth")

        session = fo.launch_app(dataset)

    Args:
        config: a :class:`DepthAnythingV3ModelConfig`
    """

    def __init__(self, config):
        super().__init__(config)

    def _download_model(self, config):
        pass

    def _load_model(self, config):
        model = da3_api.DepthAnything3.from_pretrained(config.name_or_path)
        model = model.to(self._device)
        model.eval()
        return model

    @property
    def media_type(self):
        return "image"

    def _get_image_and_size(self, img):
        if isinstance(img, str):
            if not os.path.isfile(img):
                raise ValueError("Image file not found: %s" % img)
            img_array = cv2.imread(img)
            if img_array is None:
                raise ValueError("Failed to read image file: %s" % img)
            img_array = cv2.cvtColor(img_array, cv2.COLOR_BGR2RGB)
            return img_array, (img_array.shape[1], img_array.shape[0])
        elif isinstance(img, Image.Image):
            img_array = np.array(img.convert("RGB"))
            return img_array, (img_array.shape[1], img_array.shape[0])
        elif isinstance(img, torch.Tensor):
            if img.dim() == 4 and img.size(0) == 1:
                img = img.squeeze(0)
            elif img.dim() == 4:
                raise ValueError(
                    "Batch size > 1 not supported, got shape %s"
                    % (tuple(img.shape),)
                )
            if img.dim() == 3 and img.shape[0] == 3:
                img = img.permute(1, 2, 0)
            img_array = img.cpu().numpy()
            if img_array.dtype in (np.float32, np.float64):
                if img_array.max() <= 1.0:
                    img_array = img_array * 255
                img_array = np.clip(img_array, 0, 255).astype(np.uint8)
            return img_array, (img_array.shape[1], img_array.shape[0])
        elif isinstance(img, np.ndarray):
            if img.ndim != 3 or img.shape[2] != 3:
                raise ValueError(
                    "Expected image with shape (H, W, 3), got %s" % (img.shape,)
                )
            if img.dtype in (np.float32, np.float64):
                if img.max() <= 1.0:
                    img = img * 255
                img = np.clip(img, 0, 255).astype(np.uint8)
            return img, (img.shape[1], img.shape[0])
        else:
            raise TypeError(
                "Unsupported image type %s. Supported types are: str, "
                "PIL.Image, torch.Tensor, np.ndarray" % type(img)
            )

    def _predict_all(self, imgs):
        if not isinstance(imgs, list):
            imgs = [imgs]

        if len(imgs) == 0:
            return []

        images = []
        original_sizes = []
        for img in imgs:
            img_array, size = self._get_image_and_size(img)
            images.append(img_array)
            original_sizes.append(size)

        try:
            with torch.no_grad():
                prediction = self._model.inference(images)
        except Exception as e:
            raise RuntimeError("Depth Anything V3 inference failed: %s" % e) from e

        outputs = []
        depth_maps = prediction.depth

        if len(depth_maps.shape) == 2:
            depth_maps = depth_maps[np.newaxis, ...]

        for i in range(len(depth_maps)):
            depth = depth_maps[i]
            orig_w, orig_h = original_sizes[i]

            if depth.shape[0] != orig_h or depth.shape[1] != orig_w:
                depth = cv2.resize(
                    depth, (orig_w, orig_h), interpolation=cv2.INTER_LINEAR
                )

            max_depth = np.max(depth)
            if max_depth > 0:
                depth_normalized = depth / max_depth
            else:
                logger.warning("Depth map has max value of 0, returning zeros")
                depth_normalized = np.zeros_like(depth)

            outputs.append(fol.Heatmap(map=depth_normalized))

        return outputs

    def predict(self, img):
        predictions = self._predict_all([img])
        return predictions[0] if predictions else None
