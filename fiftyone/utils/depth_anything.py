"""
`Depth Anything V3 <https://github.com/ByteDance-Seed/Depth-Anything-3>`_
wrapper for the FiftyOne Model Zoo.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
import os

import numpy as np

import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
import fiftyone.core.validation as fov
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

fou.ensure_torch()
import torch

logger = logging.getLogger(__name__)


def _ensure_depth_anything_3():
    if not fou.ensure_package("depth-anything-3", error_level=2):
        fou.install_package(
            "git+https://github.com/ByteDance-Seed/depth-anything-3.git"
            "@2c21ea849ceec7b469a3e62ea0c0e270afc3281a"
        )


da3_api = fou.lazy_import(
    "depth_anything_3.api",
    callback=_ensure_depth_anything_3,
)

DEFAULT_DA3_MODEL = "depth-anything/da3-base"


class DepthAnythingV3OutputProcessor(fout.OutputProcessor):
    """Output processor for Depth Anything V3 models.

    Converts raw depth predictions to normalized
    :class:`fiftyone.core.labels.Heatmap` instances with optional confidence.
    """

    def __call__(self, output, frame_size, **kwargs):
        """Processes model output into heatmap labels.

        Args:
            output: a dict containing the model output with a ``"depth"`` key
                and optionally ``"confidence"`` and ``"sky"`` keys
            frame_size: a ``(width, height)`` tuple
            **kwargs: additional keyword arguments

        Returns:
            a list of :class:`fiftyone.core.labels.Heatmap` instances, each
            with optional ``confidence_map``, ``sky_mask``, and ``is_metric``
            attributes
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

        depth_maps = output["depth"]

        if isinstance(depth_maps, torch.Tensor):
            depth_maps = depth_maps.detach().cpu().numpy()

        if len(depth_maps.shape) == 2:
            depth_maps = depth_maps[np.newaxis, ...]

        conf_maps = output.get("confidence")
        if conf_maps is not None:
            if isinstance(conf_maps, torch.Tensor):
                conf_maps = conf_maps.detach().cpu().numpy()
            if len(conf_maps.shape) == 2:
                conf_maps = conf_maps[np.newaxis, ...]

        sky_masks = output.get("sky")
        if sky_masks is not None:
            if isinstance(sky_masks, torch.Tensor):
                sky_masks = sky_masks.detach().cpu().numpy()
            if len(sky_masks.shape) == 2:
                sky_masks = sky_masks[np.newaxis, ...]

        from PIL import Image

        width, height = frame_size
        results = []

        for i, depth in enumerate(depth_maps):
            if width is not None and height is not None:
                if depth.shape[0] != height or depth.shape[1] != width:
                    depth_img = Image.fromarray(depth)
                    depth_img = depth_img.resize(
                        (width, height), Image.Resampling.BILINEAR
                    )
                    depth = np.array(depth_img)

            max_depth = np.max(depth)
            if max_depth > 0:
                depth_normalized = depth / max_depth
            else:
                logger.warning("Depth map has max value of 0, returning zeros")
                depth_normalized = np.zeros_like(depth)

            heatmap = fol.Heatmap(map=depth_normalized.astype(np.float32))

            if conf_maps is not None:
                conf = conf_maps[i]
                if width is not None and height is not None:
                    if conf.shape[0] != height or conf.shape[1] != width:
                        conf_img = Image.fromarray(conf)
                        conf_img = conf_img.resize(
                            (width, height), Image.Resampling.BILINEAR
                        )
                        conf = np.array(conf_img)
                heatmap.confidence_map = conf.astype(np.float32)

            if sky_masks is not None:
                sky = sky_masks[i]
                if width is not None and height is not None:
                    if sky.shape[0] != height or sky.shape[1] != width:
                        sky_img = Image.fromarray(sky.astype(np.uint8) * 255)
                        sky_img = sky_img.resize(
                            (width, height), Image.Resampling.NEAREST
                        )
                        sky = (np.array(sky_img) > 127).astype(np.uint8)
                heatmap.sky_mask = sky.astype(np.uint8)

            heatmap.is_metric = output.get("is_metric", False)

            results.append(heatmap)

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

        self.is_metric = (
            "metric" in self.name_or_path.lower()
            or "nested" in self.name_or_path.lower()
        )

        self.raw_inputs = True

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

    def _download_model(self, config):
        pass

    def _load_model(self, config):
        model = da3_api.DepthAnything3.from_pretrained(config.name_or_path)
        model = model.to(self._device)
        if self.using_half_precision:
            model = model.half()
        model.eval()
        return model

    @property
    def media_type(self):
        return "image"

    def _forward_pass(self, imgs):
        prediction = self._model.inference(imgs)
        output = {"depth": prediction.depth}
        if prediction.conf is not None:
            output["confidence"] = prediction.conf
        if prediction.sky is not None:
            output["sky"] = prediction.sky
        output["is_metric"] = self.config.is_metric
        return output


def compute_3d_exports(
    samples,
    output_dir,
    export_format="glb",
    model_name="depth-anything/da3-large",
    rel_dir=None,
    overwrite=False,
    skip_failures=False,
    progress=None,
):
    """Computes 3D exports (GLB, PLY) for samples using Depth Anything V3.

    Examples::

        import fiftyone as fo
        import fiftyone.utils.depth_anything as fouda
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart", max_samples=5)
        fouda.compute_3d_exports(dataset, "/tmp/exports", export_format="glb")

        for sample in dataset:
            print(sample.da3_export_path)

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        output_dir: directory to write exports
        export_format ("glb"): export format. One of ``"glb"``, ``"gs_ply"``
        model_name ("depth-anything/da3-large"): DA3 model to use
        rel_dir (None): optional relative directory to strip from filepaths
        overwrite (False): whether to overwrite existing exports
        skip_failures (False): whether to gracefully continue on errors
        progress (None): whether to show progress bar
    """
    fov.validate_collection(samples)

    infer_gs = export_format in ("gs_ply", "gs_video")

    model = da3_api.DepthAnything3.from_pretrained(model_name)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = model.to(device)
    model.eval()

    filename_maker = fou.UniqueFilenameMaker(
        output_dir=output_dir, rel_dir=rel_dir, ignore_existing=overwrite
    )

    for sample in samples.iter_samples(autosave=True, progress=progress):
        sample_export_dir = filename_maker.get_output_path(
            sample.filepath, output_ext=""
        )

        try:
            prediction = model.inference(
                [sample.filepath],
                infer_gs=infer_gs,
                export_dir=sample_export_dir,
                export_format=export_format,
            )
        except Exception as e:
            if not skip_failures:
                raise
            logger.warning("Failed to export %s: %s", sample.filepath, e)
            continue

        if export_format == "glb":
            sample["da3_export_path"] = os.path.join(sample_export_dir, "scene.glb")
        elif export_format == "gs_ply":
            sample["da3_export_path"] = os.path.join(
                sample_export_dir, "gs_ply", "0000.ply"
            )
