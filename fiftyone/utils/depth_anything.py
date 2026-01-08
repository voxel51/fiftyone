"""
`Depth Anything V3 <https://github.com/ByteDance-Seed/Depth-Anything-3>`_
wrapper for the FiftyOne Model Zoo.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging

import numpy as np

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
            "@2c21ea849ceec7b469a3e62ea0c0e270afc3281a"
        )


da3_api = fou.lazy_import(
    "depth_anything_3.api",
    callback=_ensure_depth_anything_3,
)

DEFAULT_DA3_MODEL = "depth-anything/da3-base"


def _normalize_float_to_uint8(img_array):
    """Converts a float image array to uint8.

    Arrays with max value <= 1.0 are assumed to be in [0, 1] range and are
    scaled to [0, 255].

    Args:
        img_array: a numpy array

    Returns:
        a ``uint8`` numpy array with values in [0, 255]
    """
    if img_array.dtype == np.uint8:
        return img_array
    if img_array.max() <= 1.0:
        img_array = img_array * 255
    return np.clip(img_array, 0, 255).astype(np.uint8)


class DepthAnythingV3OutputProcessor(fout.OutputProcessor):
    """Output processor for Depth Anything V3 models.

    Converts raw depth predictions to normalized
    :class:`fiftyone.core.labels.Heatmap` instances.
    """

    def __call__(self, output, image_sizes, **kwargs):
        """Processes model output into heatmap labels.

        Args:
            output: a dict containing the model output with a ``"depth"`` key
            image_sizes: a list of ``(height, width)`` tuples
            **kwargs: additional keyword arguments

        Returns:
            a list of :class:`fiftyone.core.labels.Heatmap` instances
        """
        depth_maps = output["depth"]

        if isinstance(depth_maps, torch.Tensor):
            depth_maps = depth_maps.detach().cpu().numpy()

        if len(depth_maps.shape) == 2:
            depth_maps = depth_maps[np.newaxis, ...]

        if len(depth_maps) != len(image_sizes):
            raise ValueError(
                "Length mismatch: got %d depth maps but %d image sizes"
                % (len(depth_maps), len(image_sizes))
            )

        results = []
        for i, depth in enumerate(depth_maps):
            orig_h, orig_w = image_sizes[i]

            if depth.shape[0] != orig_h or depth.shape[1] != orig_w:
                from PIL import Image

                depth_img = Image.fromarray(depth)
                depth_img = depth_img.resize(
                    (orig_w, orig_h), Image.Resampling.BILINEAR
                )
                depth = np.array(depth_img)

            max_depth = np.max(depth)
            if max_depth > 0:
                depth_normalized = depth / max_depth
            else:
                logger.warning("Depth map has max value of 0, returning zeros")
                depth_normalized = np.zeros_like(depth)

            results.append(fol.Heatmap(map=depth_normalized.astype(np.float32)))

        return results


class DepthAnythingV3ModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for running a :class:`DepthAnythingV3Model`.

    See :class:`fiftyone.utils.torch.TorchImageModelConfig` for additional
    arguments.

    Args:
        name_or_path ("depth-anything/da3-base"): the name or path to the
            Depth Anything V3 model
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)

        self.name_or_path = self.parse_string(
            d, "name_or_path", default=DEFAULT_DA3_MODEL
        )

        if self.output_processor_cls is None:
            self.output_processor_cls = (
                "fiftyone.utils.depth_anything.DepthAnythingV3OutputProcessor"
            )


class DepthAnythingV3Model(fout.TorchImageModel):
    """Wrapper for running inference with
    `Depth Anything V3 <https://github.com/ByteDance-Seed/Depth-Anything-3>`_.

    Depth Anything V3 is a foundation model for monocular depth estimation.

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
        self._image_sizes = None

    def _download_model(self, config):
        pass

    def _load_model(self, config):
        model = da3_api.DepthAnything3.from_pretrained(config.name_or_path)
        model = model.to(self._device)
        model.eval()
        return model

    def _build_transforms(self, config):
        return _DepthAnythingV3Transforms(), True

    @property
    def media_type(self):
        """The media type processed by this model."""
        return "image"

    def _predict_all(self, imgs):
        if self._preprocess:
            processed = [self._transforms(img) for img in imgs]
            images = [p[0] for p in processed]
            self._image_sizes = [p[1] for p in processed]
        else:
            images = imgs
            self._image_sizes = [self._get_image_size(img) for img in imgs]

        output = self._forward_pass(images)

        if self._output_processor is not None:
            return self._output_processor(
                output,
                self._image_sizes,
                confidence_thresh=self.config.confidence_thresh,
            )

        return output

    def _get_image_size(self, img):
        from PIL import Image as PILImage

        if isinstance(img, str):
            with PILImage.open(img) as pil_img:
                return (pil_img.height, pil_img.width)
        elif isinstance(img, PILImage.Image):
            return (img.height, img.width)
        elif isinstance(img, np.ndarray):
            return (img.shape[0], img.shape[1])
        elif isinstance(img, torch.Tensor):
            if img.dim() == 3 and img.shape[0] in (1, 3, 4):
                return (img.shape[1], img.shape[2])
            return (img.shape[0], img.shape[1])
        else:
            raise TypeError("Unsupported image type: %s" % type(img))

    def _forward_pass(self, images):
        with torch.no_grad():
            prediction = self._model.inference(images)
        return {"depth": prediction.depth}


class _DepthAnythingV3Transforms:
    """Input transforms for Depth Anything V3.

    Converts various image input types (file paths, PIL Images, torch Tensors,
    and numpy arrays) to numpy arrays and tracks original sizes for the output
    processor.
    """

    def __call__(self, img):
        """Transforms an image to the format expected by the model.

        Args:
            img: an image, which can be a filepath string,
                :class:`PIL.Image.Image`, torch Tensor, or numpy array

        Returns:
            a tuple of ``(img_array, original_size)``
        """
        from PIL import Image as PILImage

        if isinstance(img, str):
            import os

            if not os.path.isfile(img):
                raise ValueError("Image file not found: %s" % img)
            img_array = np.array(PILImage.open(img).convert("RGB"))
        elif isinstance(img, PILImage.Image):
            img_array = np.array(img.convert("RGB"))
        elif isinstance(img, torch.Tensor):
            if img.dim() == 4 and img.size(0) == 1:
                img = img.squeeze(0)
            elif img.dim() == 4:
                raise ValueError(
                    "Batch size > 1 not supported, got shape %s"
                    % (tuple(img.shape),)
                )
            if img.dim() == 3 and img.shape[0] in (1, 3, 4):
                img = img.permute(1, 2, 0)
            if img.shape[2] == 1:
                img = img.expand(-1, -1, 3)
            elif img.shape[2] == 4:
                img = img[:, :, :3]
            img_array = img.cpu().numpy()
            if img_array.dtype in (np.float32, np.float64):
                img_array = _normalize_float_to_uint8(img_array)
        elif isinstance(img, np.ndarray):
            if img.ndim != 3 or img.shape[2] != 3:
                raise ValueError(
                    "Expected image with shape (H, W, 3), got %s" % (img.shape,)
                )
            if img.dtype in (np.float32, np.float64):
                img = _normalize_float_to_uint8(img)
            img_array = img
        else:
            raise TypeError(
                "Unsupported image type %s. Supported types are: str, "
                "PIL.Image, torch.Tensor, np.ndarray" % type(img)
            )

        original_size = (img_array.shape[0], img_array.shape[1])
        return img_array, original_size
