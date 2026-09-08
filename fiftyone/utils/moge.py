"""
`MoGe-3 <https://github.com/microsoft/MoGe>`_ wrapper for the FiftyOne
Model Zoo.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
import os
import numpy as np
from PIL import Image

import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

fou.ensure_torch()
import torch

logger = logging.getLogger(__name__)

MOGE_COMMIT = "74fbce054ebed49800de42d0ad0e83495065719a"


def _ensure_moge():
    if not fou.ensure_package("moge", error_level=2):
        fou.install_package(
            "git+https://github.com/microsoft/MoGe.git@" + MOGE_COMMIT
        )


moge_v3 = fou.lazy_import("moge.model.v3", callback=_ensure_moge)

DEFAULT_MOGE_MODEL = "Ruicheng/moge-3-vitl"


def _to_arrays(value):
    """Converts a batch of per-image outputs to a list of numpy arrays."""
    if value is None:
        return None

    if isinstance(value, torch.Tensor):
        value = value.detach().float().cpu().numpy()

    if isinstance(value, np.ndarray):
        return (
            [value]
            if value.ndim in (2, 3) and _is_single(value)
            else list(value)
        )

    return [
        (
            v.detach().float().cpu().numpy()
            if isinstance(v, torch.Tensor)
            else np.asarray(v)
        )
        for v in value
    ]


def _is_single(value):
    """Whether an array holds one image's output rather than a batch."""
    return value.ndim == 2 or (value.ndim == 3 and value.shape[-1] in (1, 3))


def _resize(array, size, nearest):
    """Resizes a 2D or HxWxC float array to ``(width, height)``."""
    resample = (
        Image.Resampling.NEAREST if nearest else Image.Resampling.BILINEAR
    )
    if array.ndim == 2:
        return np.array(
            Image.fromarray(array.astype(np.float32)).resize(size, resample)
        )

    channels = [
        np.array(
            Image.fromarray(array[..., c].astype(np.float32)).resize(
                size, resample
            )
        )
        for c in range(array.shape[-1])
    ]
    return np.stack(channels, axis=-1)


class MoGeOutputProcessor(fout.OutputProcessor):
    """Output processor for MoGe-3 models.

    Converts metric depth predictions to :class:`fiftyone.core.labels.Heatmap`
    instances. Each ``map`` is the depth divided by its maximum, which is kept
    in ``max_depth`` so metres are recoverable, and ``is_metric`` is set. The
    predicted valid-pixel mask and the normalized camera intrinsics are
    attached as ``valid_mask`` and ``intrinsics``; ``normal_map`` and
    ``point_map`` are attached when the model was configured to return them.
    """

    def __call__(
        self,
        output,
        frame_size,
        confidence_thresh=None,
        classes=None,
        **kwargs,
    ):
        """Processes model output into heatmap labels.

        Args:
            output: a dict with a ``"depth"`` key holding one depth map per
                image and optional ``"mask"``, ``"intrinsics"``,
                ``"normal"`` and ``"points"`` keys
            frame_size: a ``(width, height)`` tuple
            **kwargs: additional keyword arguments

        Returns:
            a list of :class:`fiftyone.core.labels.Heatmap` instances
        """
        if not isinstance(output, dict):
            raise TypeError(
                "Expected dict output, got %s" % type(output).__name__
            )

        if "depth" not in output:
            raise KeyError(
                "Model output missing 'depth' key. Available: %s"
                % list(output.keys())
            )

        depths = _to_arrays(output["depth"])
        if not depths:
            raise ValueError("Model output 'depth' is empty")

        masks = _to_arrays(output.get("mask"))
        normals = _to_arrays(output.get("normal"))
        points = _to_arrays(output.get("points"))
        intrinsics = output.get("intrinsics")
        is_metric = output.get("is_metric", True)

        width, height = frame_size
        size = (
            (width, height)
            if width is not None and height is not None
            else None
        )

        results = []
        for i, depth in enumerate(depths):
            depth = np.asarray(depth, dtype=np.float32)
            if depth.ndim == 3:
                depth = depth[..., 0]

            mask = masks[i] if masks is not None and i < len(masks) else None
            if mask is not None:
                mask = np.asarray(mask) > 0

            if not np.all(np.isfinite(depth)):
                depth = np.where(np.isfinite(depth), depth, 0)

            if mask is not None and mask.shape == depth.shape:
                depth = np.where(mask, depth, 0)

            if size is not None and depth.shape[:2] != (height, width):
                depth = _resize(depth, size, nearest=False)
                if mask is not None:
                    mask = (
                        _resize(mask.astype(np.float32), size, nearest=True)
                        > 0.5
                    )

            max_depth = float(np.max(depth)) if depth.size else 0.0
            if max_depth > 0:
                normalized = depth / max_depth
            else:
                logger.warning("Depth map has max value of 0, returning zeros")
                normalized = np.zeros_like(depth)

            heatmap = fol.Heatmap(map=normalized.astype(np.float32))
            heatmap.is_metric = bool(is_metric)
            if is_metric:
                heatmap.max_depth = max_depth

            if mask is not None:
                heatmap.valid_mask = mask.astype(np.uint8)

            if intrinsics is not None and i < len(intrinsics):
                k = intrinsics[i]
                if isinstance(k, torch.Tensor):
                    k = k.detach().float().cpu().numpy()
                heatmap.intrinsics = np.asarray(k, dtype=np.float32).tolist()

            if normals is not None and i < len(normals):
                normal = np.asarray(normals[i], dtype=np.float32)
                if size is not None and normal.shape[:2] != (height, width):
                    normal = _resize(normal, size, nearest=False)
                heatmap.normal_map = normal

            if points is not None and i < len(points):
                point_map = np.asarray(points[i], dtype=np.float32)
                if size is not None and point_map.shape[:2] != (height, width):
                    point_map = _resize(point_map, size, nearest=False)
                heatmap.point_map = point_map

            results.append(heatmap)

        return results


class MoGeModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for running a :class:`MoGeModel`.

    See :class:`fiftyone.utils.torch.TorchImageModelConfig` for additional
    arguments.

    Args:
        name_or_path ("Ruicheng/moge-3-vitl"): the Hugging Face repo of the
            MoGe-3 checkpoint, or a path to a local ``model.pt``
        resolution_level (9): the inference resolution level, 0 to 9. Higher
            levels use more ViT tokens and keep finer detail
        num_tokens (None): an explicit number of ViT tokens, which overrides
            ``resolution_level``
        refine_steps (3): the number of sparse volumetric refinement steps.
            Refinement needs a CUDA device; on CPU it is skipped
        fov_x (None): the horizontal field of view in degrees, when the camera
            is known. Otherwise it is estimated from the prediction
        use_fp16 (False): whether to run the encoder in mixed precision
        include_normals (False): whether to attach the predicted surface
            normal map to each heatmap
        include_points (False): whether to attach the camera-space point map
            to each heatmap
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)

        self.name_or_path = self.parse_string(
            d, "name_or_path", default=DEFAULT_MOGE_MODEL
        )
        self.resolution_level = self.parse_int(
            d, "resolution_level", default=9
        )
        self.num_tokens = self.parse_int(d, "num_tokens", default=None)
        self.refine_steps = self.parse_int(d, "refine_steps", default=3)
        self.fov_x = self.parse_number(d, "fov_x", default=None)
        self.use_fp16 = self.parse_bool(d, "use_fp16", default=False)
        self.include_normals = self.parse_bool(
            d, "include_normals", default=False
        )
        self.include_points = self.parse_bool(
            d, "include_points", default=False
        )

        self.raw_inputs = True

        if self.output_processor_cls is None:
            self.output_processor_cls = (
                "fiftyone.utils.moge.MoGeOutputProcessor"
            )


class MoGeModel(fout.TorchImageModel):
    """Wrapper for running inference with
    `MoGe-3 <https://github.com/microsoft/MoGe>`_.

    MoGe-3 predicts metric-scale monocular geometry from a single image: a
    depth map, a camera-space point map, surface normals, a valid-pixel mask
    and the camera intrinsics, with a sparse volumetric refinement stage that
    preserves thin structures and small objects.

    Example usage::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset(
            "quickstart", max_samples=5, shuffle=True, seed=51
        )

        model = foz.load_zoo_model("moge-3-vitl-torch")

        dataset.apply_model(model, label_field="depth")

        session = fo.launch_app(dataset)

    Args:
        config: a :class:`MoGeModelConfig`
    """

    def _download_model(self, config):
        if os.path.exists(config.name_or_path):
            return

        from huggingface_hub import hf_hub_download

        hf_hub_download(repo_id=config.name_or_path, filename="model.pt")

    def _load_model(self, config):
        model = moge_v3.MoGeModel.from_pretrained(config.name_or_path)
        model = model.to(self._device)
        model.eval()
        return model

    @property
    def media_type(self):
        return "image"

    def _forward_pass(self, imgs):
        refine_steps = self.config.refine_steps
        if refine_steps > 0 and self._device.type != "cuda":
            logger.warning(
                "MoGe-3 refinement needs a CUDA device; running without "
                "refinement on %s",
                self._device,
            )
            refine_steps = 0

        depths, masks, normals, points, intrinsics = [], [], [], [], []
        for img in imgs:
            if isinstance(img, torch.Tensor):
                tensor = img.to(self._device).float()
                if tensor.ndim == 3 and tensor.shape[-1] in (3, 4):
                    tensor = tensor[..., :3].permute(2, 0, 1)
                if tensor.max() > 1.0:
                    tensor = tensor / 255
            else:
                array = np.array(img)
                if array.ndim == 2:
                    array = np.stack([array] * 3, axis=-1)
                elif array.shape[-1] == 4:
                    array = array[..., :3]

                tensor = (
                    torch.from_numpy(np.ascontiguousarray(array))
                    .to(self._device)
                    .permute(2, 0, 1)
                    .float()
                    .div_(255)
                )

            output = self._model.infer(
                tensor,
                num_tokens=self.config.num_tokens,
                resolution_level=self.config.resolution_level,
                fov_x=self.config.fov_x,
                refine_steps=refine_steps,
                use_fp16=bool(
                    self.config.use_fp16 or self.using_half_precision
                ),
            )

            depths.append(output["depth"].detach().float().cpu().numpy())
            mask = output.get("mask")
            masks.append(
                mask.detach().cpu().numpy() if mask is not None else None
            )
            k = output.get("intrinsics")
            intrinsics.append(
                k.detach().float().cpu().numpy() if k is not None else None
            )
            if (
                self.config.include_normals
                and output.get("normal") is not None
            ):
                normals.append(output["normal"].detach().float().cpu().numpy())
            if self.config.include_points and output.get("points") is not None:
                points.append(output["points"].detach().float().cpu().numpy())

        result = {
            "depth": depths,
            "mask": masks,
            "intrinsics": intrinsics,
            "is_metric": True,
        }
        if normals:
            result["normal"] = normals
        if points:
            result["points"] = points

        return result
