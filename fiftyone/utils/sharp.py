"""
`Apple SHARP <https://github.com/apple/ml-sharp>`_
wrapper for the FiftyOne Model Zoo.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
import os
import struct
import tempfile
import uuid

import numpy as np
from PIL import Image

import fiftyone.core.labels as fol
import fiftyone.core.threed as fo3d
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

logger = logging.getLogger(__name__)

DEFAULT_SHARP_MODEL_URL = (
    "https://ml-site.cdn-apple.com/models/sharp/sharp_2572gikvuh.pt"
)
DEFAULT_FOCAL_LENGTH = 26.0
_FULL_FRAME_SENSOR_WIDTH_MM = 36.0
_SH_C0 = 0.28209479177387814  # 1 / (2 * sqrt(pi))
_MAX_PREVIEW_POINTS = 50000

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
                logger.warning(
                    "No output_dir provided; outputs will be written to "
                    "temporary directory '%s'",
                    self._output_dir,
                )
            os.makedirs(self._output_dir, exist_ok=True)
            self._output_dir_initialized = True

    @staticmethod
    def _focal_length_from_exif(img):
        """Extract 35mm-equivalent focal length from EXIF data.

        Args:
            img: a filepath string or PIL Image

        Returns:
            focal length in mm, or None if unavailable
        """
        try:
            if isinstance(img, str):
                with Image.open(img) as _img:
                    exif = _img.getexif()
            elif isinstance(img, Image.Image):
                exif = img.getexif()
            else:
                return None

            ifd = exif.get_ifd(0x8769)  # ExifIFD
            fl_35 = ifd.get(41989)  # FocalLengthIn35mmFilm
            if fl_35 and fl_35 > 0:
                return float(fl_35)
        except (OSError, ValueError, TypeError, KeyError) as e:
            logger.debug("Could not read EXIF focal length: %s", e)

        return None

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

    def _splat_to_pointcloud(self, splat_path, pc_path):
        """Convert a Gaussian splat PLY to a downsampled RGB point cloud PLY.

        Reads the splat PLY, converts zeroth-order spherical harmonic
        coefficients (``f_dc_0/1/2``) to RGB, applies sigmoid to opacity,
        filters transparent points, and downsamples to at most
        ``_MAX_PREVIEW_POINTS`` by keeping the highest-opacity points.
        """
        with open(splat_path, "rb") as f:
            n_verts = 0
            while True:
                raw = f.readline()
                if not raw:
                    raise ValueError(
                        "Malformed PLY header in '%s'" % splat_path
                    )
                line = raw.decode("ascii").strip()
                if line.startswith("element vertex"):
                    n_verts = int(line.split()[-1])
                if line == "end_header":
                    break

            # x y z f_dc_0 f_dc_1 f_dc_2 opacity scale_0..2 rot_0..3
            vertex_data = np.frombuffer(
                f.read(n_verts * 14 * 4), dtype=np.float32
            ).reshape(n_verts, 14)

        xyz = vertex_data[:, 0:3]
        f_dc = vertex_data[:, 3:6]
        opacity_raw = vertex_data[:, 6]

        rgb = np.clip(0.5 + _SH_C0 * f_dc, 0.0, 1.0)
        rgb = (rgb * 255).astype(np.uint8)

        opacity = 1.0 / (1.0 + np.exp(-opacity_raw))

        mask = opacity > 0.2
        xyz, rgb, opacity = xyz[mask], rgb[mask], opacity[mask]

        if len(xyz) > _MAX_PREVIEW_POINTS:
            top_idx = np.argsort(opacity)[-_MAX_PREVIEW_POINTS:]
            xyz, rgb = xyz[top_idx], rgb[top_idx]

        n_out = xyz.shape[0]
        with open(pc_path, "wb") as f:
            header = (
                "ply\n"
                "format binary_little_endian 1.0\n"
                f"element vertex {n_out}\n"
                "property float x\n"
                "property float y\n"
                "property float z\n"
                "property uchar red\n"
                "property uchar green\n"
                "property uchar blue\n"
                "end_header\n"
            )
            f.write(header.encode("ascii"))
            for i in range(n_out):
                f.write(struct.pack(
                    "<fffBBB",
                    xyz[i, 0], xyz[i, 1], xyz[i, 2],
                    rgb[i, 0], rgb[i, 1], rgb[i, 2],
                ))

        return n_out

    def _export_gaussians(self, gaussians, f_px, height, width):
        """Export gaussians to PLY and a viewable ``.fo3d`` scene.

        Returns a :class:`fiftyone.core.labels.Classification` with
        ``splat_path`` (raw Gaussian splat PLY) and ``scene_path``
        (``.fo3d`` file viewable in the FiftyOne App).
        """
        self._ensure_output_dir()
        splat_id = uuid.uuid4().hex[:12]

        splat_path = os.path.join(
            self._output_dir, f"splat_{splat_id}.ply"
        )
        sharp_utils.save_ply(gaussians, f_px, (height, width), splat_path)

        pc_name = f"pc_{splat_id}.ply"
        pc_path = os.path.join(self._output_dir, pc_name)
        self._splat_to_pointcloud(splat_path, pc_path)

        scene = fo3d.Scene()
        scene.add(fo3d.PlyMesh(
            "gaussians",
            pc_name,  # relative to .fo3d location
            is_point_cloud=True,
            center_geometry=True,
        ))
        scene_path = os.path.join(
            self._output_dir, f"scene_{splat_id}.fo3d"
        )
        scene.write(scene_path)

        return fol.Classification(
            label="3d_gaussians",
            splat_path=splat_path,
            scene_path=scene_path,
        )

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
                exif_fl = self._focal_length_from_exif(img)
                img_np = self._to_numpy(img)
                height, width = img_np.shape[:2]

                fl_mm = exif_fl if exif_fl is not None else self._focal_length_mm
                f_px = fl_mm * width / _FULL_FRAME_SENSOR_WIDTH_MM
                disparity_factor = torch.tensor(
                    [f_px / width], dtype=torch.float32, device=self._device
                )

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
