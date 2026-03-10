"""
`Apple SHARP <https://github.com/apple/ml-sharp>`_
wrapper for the FiftyOne Model Zoo.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
import os
import tempfile
import uuid

import numpy as np
from PIL import Image

import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

logger = logging.getLogger(__name__)

DEFAULT_SHARP_MODEL_URL = (
    "https://ml-site.cdn-apple.com/models/sharp/sharp_2572gikvuh.pt"
)
DEFAULT_FOCAL_LENGTH = 26.0
_FULL_FRAME_SENSOR_WIDTH_MM = 36.0

_SHARP_REQ = (
    "sharp @ git+https://github.com/apple/ml-sharp.git"
    "@1eaa046834b81852261262b41b0919f5c1efdd2e"
)


def _ensure_sharp():
    if not fou.ensure_package(_SHARP_REQ, error_level=2):
        fou.install_package(_SHARP_REQ)


sharp_models = fou.lazy_import("sharp.models", callback=_ensure_sharp)
sharp_utils = fou.lazy_import("sharp.utils.gaussians", callback=_ensure_sharp)


class AppleSharpModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for running a :class:`AppleSharpModel`.

    See :class:`fiftyone.utils.torch.TorchImageModelConfig` for additional
    arguments.

    Args:
        focal_length_mm (26.0): the focal length in mm (35mm equivalent).
            Used to compute disparity factor. Most smartphone photos use
            26-28mm
        output_dir (None): directory to save output .ply files. If None,
            uses a temporary directory
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)

        self.focal_length_mm = self.parse_number(
            d, "focal_length_mm", default=DEFAULT_FOCAL_LENGTH
        )
        if self.focal_length_mm <= 0:
            raise ValueError("focal_length_mm must be positive")
        self.output_dir = self.parse_string(d, "output_dir", default=None)


class AppleSharpModel(fout.TorchImageModel):
    """Wrapper for running
    `Apple SHARP <https://github.com/apple/ml-sharp>`_ inference.

    SHARP (SHarp monoculAR sPlatting) generates photorealistic 3D Gaussian
    representations from a single image in under one second.

    Example usage::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset(
            "quickstart", max_samples=3, shuffle=True, seed=51
        )

        model = foz.load_zoo_model("apple-sharp-torch")

        dataset.apply_model(model, label_field="gaussians_3d")

        session = fo.launch_app(dataset)

    Args:
        config: a :class:`AppleSharpModelConfig`
    """

    def __init__(self, config):
        config.raw_inputs = True
        super().__init__(config)
        self._output_dir = config.output_dir
        self._focal_length_mm = config.focal_length_mm
        self._output_dir_initialized = False

    def _load_model(self, config):
        """Load the SHARP model."""
        fou.ensure_torch()
        import torch

        state_dict = torch.hub.load_state_dict_from_url(
            DEFAULT_SHARP_MODEL_URL, progress=True, map_location=self._device
        )
        predictor = sharp_models.create_predictor(
            sharp_models.PredictorParams()
        )
        predictor.load_state_dict(state_dict)
        predictor.eval()
        predictor = predictor.to(self._device)
        return predictor

    @property
    def media_type(self):
        return "image"

    def _ensure_output_dir(self):
        """Ensure the output directory exists, creating a temp dir if needed."""
        if not self._output_dir_initialized:
            if self._output_dir is None:
                self._output_dir = tempfile.mkdtemp(prefix="sharp_")
            os.makedirs(self._output_dir, exist_ok=True)
            self._output_dir_initialized = True

    def _to_numpy(self, img):
        """Convert input to numpy uint8 HWC array."""
        if isinstance(img, str):
            return fout._load_image(img, use_numpy=True, force_rgb=True)

        if isinstance(img, Image.Image):
            return np.array(img.convert("RGB"))

        if isinstance(img, np.ndarray):
            if img.ndim == 3 and img.shape[-1] == 3 and img.dtype == np.uint8:
                return img

            pil_img = fout.ToPILImage()(img)
            return np.array(pil_img.convert("RGB"))

        pil_img = fout.ToPILImage()(img)
        return np.array(pil_img.convert("RGB"))

    def focal_length_to_fpx(self, width):
        """Convert 35mm-equivalent focal length in mm to focal length in px."""
        return self._focal_length_mm * width / _FULL_FRAME_SENSOR_WIDTH_MM

    def disparity_factor(self, width):
        """Compute the SHARP disparity factor for an image width."""
        fou.ensure_torch()
        import torch

        f_px = self.focal_length_to_fpx(width)
        return torch.tensor(
            [f_px / width], dtype=torch.float32, device=self._device
        )

    def compute_intrinsics(self, height, width, f_px):
        """Build the 4x4 intrinsics matrix for the input image."""
        fou.ensure_torch()
        import torch

        return torch.tensor(
            [
                [f_px, 0, width / 2, 0],
                [0, f_px, height / 2, 0],
                [0, 0, 1, 0],
                [0, 0, 0, 1],
            ],
            dtype=torch.float32,
            device=self._device,
        )

    def resize_intrinsics(self, intrinsics, internal_shape, height, width):
        """Scale intrinsics for the resized SHARP inference shape."""
        intrinsics_resized = intrinsics.clone()
        intrinsics_resized[0] *= internal_shape[1] / width
        intrinsics_resized[1] *= internal_shape[0] / height
        return intrinsics_resized

    def _export_gaussians(self, gaussians, f_px, height, width):
        """Export gaussians to a PLY file and return a Classification label."""
        self._ensure_output_dir()
        splat_id = uuid.uuid4().hex[:12]
        splat_path = os.path.join(
            self._output_dir, f"splat_{splat_id}.ply"
        )
        sharp_utils.save_ply(gaussians, f_px, (height, width), splat_path)
        return fol.Classification(label="3d_gaussians", splat_path=splat_path)

    def _predict_all(self, imgs):
        """Run SHARP inference on a list of images and return Classifications."""
        fou.ensure_torch()
        import torch
        import torch.nn.functional as F

        if isinstance(imgs, torch.Tensor):
            if imgs.ndim == 3:
                imgs = [imgs]
            elif imgs.ndim == 4:
                imgs = list(imgs)
            else:
                raise ValueError("Expected CHW or NCHW torch tensor input")
        elif isinstance(imgs, np.ndarray):
            if imgs.ndim == 3:
                imgs = [imgs]
            elif imgs.ndim == 4:
                imgs = list(imgs)
            else:
                raise ValueError("Expected HWC or NHWC numpy array input")
        elif not isinstance(imgs, list):
            imgs = [imgs]

        if len(imgs) == 0:
            return []

        outputs = []
        with torch.no_grad():
            for img in imgs:
                img_np = self._to_numpy(img)
                height, width = img_np.shape[:2]

                f_px = self.focal_length_to_fpx(width)
                disparity_factor = self.disparity_factor(width)

                img_pt = torch.from_numpy(img_np.copy()).float().to(self._device)
                img_pt = img_pt.permute(2, 0, 1) / 255.0

                internal_shape = (1536, 1536)
                img_resized = F.interpolate(
                    img_pt[None],
                    size=internal_shape,
                    mode="bilinear",
                    align_corners=True,
                )

                gaussians_ndc = self._model(img_resized, disparity_factor)

                intrinsics = self.compute_intrinsics(height, width, f_px)
                intrinsics_resized = self.resize_intrinsics(
                    intrinsics, internal_shape, height, width
                )

                gaussians = sharp_utils.unproject_gaussians(
                    gaussians_ndc,
                    torch.eye(4).to(self._device),
                    intrinsics_resized,
                    internal_shape,
                )

                outputs.append(
                    self._export_gaussians(gaussians, f_px, height, width)
                )

        return outputs
