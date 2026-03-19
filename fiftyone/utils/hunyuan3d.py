"""
`Hunyuan3D <https://github.com/Tencent-Hunyuan/Hunyuan3D-2>`_
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
import torch

import fiftyone.core.labels as fol
import fiftyone.core.threed as fo3d
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

logger = logging.getLogger(__name__)


def _ensure_hunyuan3d():
    if not fou.ensure_package("hy3dgen", error_level=2):
        fou.install_package(
            "git+https://github.com/Tencent-Hunyuan/Hunyuan3D-2.git"
            "@f8db63096c8282cb27354314d896feba5ba6ff8a"
        )


hy3dgen_shapegen = fou.lazy_import(
    "hy3dgen.shapegen",
    callback=_ensure_hunyuan3d,
)

DEFAULT_HUNYUAN3D_MODEL = "tencent/Hunyuan3D-2"


class Hunyuan3DModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for running a :class:`Hunyuan3DModel`.

    See :class:`fiftyone.utils.torch.TorchImageModelConfig` for additional
    arguments.

    Args:
        name_or_path (None): the name or path of the Hunyuan3D model to use.
            Defaults to ``"tencent/Hunyuan3D-2"``
        output_dir (None): directory to save output mesh files. If None,
            uses a temporary directory
        output_format (None): output mesh format. Defaults to ``"obj"``
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)

        self.name_or_path = self.parse_string(
            d, "name_or_path", default=DEFAULT_HUNYUAN3D_MODEL
        )
        self.output_dir = self.parse_string(d, "output_dir", default=None)
        self.output_format = self.parse_string(d, "output_format", default="obj")


class Hunyuan3DModel(fout.TorchImageModel):
    """Wrapper for running
    `Hunyuan3D <https://github.com/Tencent-Hunyuan/Hunyuan3D-2>`_
    inference.

    Hunyuan3D is a large-scale 3D synthesis system that generates high-resolution
    textured 3D assets from a single image.

    Example usage::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset(
            "quickstart", max_samples=3, shuffle=True, seed=51
        )

        model = foz.load_zoo_model("hunyuan3d-v2-torch")

        dataset.apply_model(model, label_field="mesh_3d")

        session = fo.launch_app(dataset)

    Args:
        config: a :class:`Hunyuan3DModelConfig`
    """

    def __init__(self, config):
        super().__init__(config)
        self.config.raw_inputs = True
        self._output_dir = config.output_dir
        self._output_format = config.output_format
        self._output_dir_initialized = False

    def _load_model(self, config):
        kwargs = {}
        if "2.1" in config.name_or_path:
            kwargs["subfolder"] = "hunyuan3d-dit-v2-1"
            kwargs["use_safetensors"] = False

        pipeline = hy3dgen_shapegen.Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(
            config.name_or_path, **kwargs
        )
        return pipeline

    @property
    def media_type(self):
        return "image"

    def _ensure_output_dir(self):
        if not self._output_dir_initialized:
            if self._output_dir is None:
                self._output_dir = tempfile.mkdtemp(prefix="hunyuan3d_")
                self._owns_output_dir = True
                logger.warning(
                    "No output_dir provided; outputs will be written to "
                    "temporary directory '%s'",
                    self._output_dir,
                )
            else:
                self._owns_output_dir = False
            os.makedirs(self._output_dir, exist_ok=True)
            self._output_dir_initialized = True

    def cleanup(self):
        """Remove the temporary output directory if one was created."""
        if getattr(self, "_owns_output_dir", False) and self._output_dir:
            import shutil
            shutil.rmtree(self._output_dir, ignore_errors=True)
            self._output_dir_initialized = False

    def __del__(self):
        self.cleanup()

    def _to_pil(self, img):
        """Convert input to PIL Image if needed.

        The Hunyuan3D pipeline accepts str paths or PIL Images directly.
        """
        if isinstance(img, (str, Image.Image)):
            return img

        if isinstance(img, torch.Tensor):
            if img.dim() == 4 and img.size(0) == 1:
                img = img.squeeze(0)
            if img.dim() == 3 and img.shape[0] in (1, 3, 4):
                img = img.permute(1, 2, 0)
            img = img.cpu().numpy()

        if isinstance(img, np.ndarray):
            if img.dtype in (np.float32, np.float64):
                img_min, img_max = img.min(), img.max()
                if img_min >= 0.0 and img_max <= 1.0:
                    img = img * 255
                elif img_min >= -1.0 and img_max <= 1.0:
                    img = (img + 1.0) * 127.5
                # Floats already in [0, 255] fall through unscaled
                img = np.clip(img, 0, 255).astype(np.uint8)
            if img.ndim == 3 and img.shape[2] == 1:
                img = img.squeeze(2)
            return Image.fromarray(img)

        raise TypeError("Unsupported image type: %s" % type(img).__name__)

    def _export_mesh(self, mesh):
        """Export mesh to disk and return a Classification with viewable scene."""
        self._ensure_output_dir()

        mesh_id = uuid.uuid4().hex[:12]
        mesh_path = os.path.join(
            self._output_dir, "mesh_%s.%s" % (mesh_id, self._output_format)
        )
        mesh.export(mesh_path)

        mesh_filename = "mesh_%s.%s" % (mesh_id, self._output_format)
        _mesh_types = {
            "obj": fo3d.ObjMesh,
            "stl": fo3d.StlMesh,
            "ply": fo3d.PlyMesh,
            "fbx": fo3d.FbxMesh,
            "gltf": fo3d.GltfMesh,
            "glb": fo3d.GltfMesh,
        }
        mesh_cls = _mesh_types.get(self._output_format, fo3d.ObjMesh)
        scene = fo3d.Scene()
        scene.add(mesh_cls(
            "mesh",
            mesh_filename,
        ))
        scene_path = os.path.join(
            self._output_dir, "scene_%s.fo3d" % mesh_id
        )
        scene.write(scene_path)

        return fol.Classification(
            label="3d_mesh",
            mesh_path=mesh_path,
            scene_path=scene_path,
            vertices=mesh.vertices.shape[0],
            faces=mesh.faces.shape[0],
        )

    def _predict_all(self, imgs):
        if not isinstance(imgs, list):
            imgs = [imgs]

        if len(imgs) == 0:
            return []

        outputs = []
        for i, img in enumerate(imgs):
            try:
                pil_img = self._to_pil(img)
                mesh = self._model(image=pil_img)[0]
                outputs.append(self._export_mesh(mesh))
            except (
                OSError, ValueError, RuntimeError,
                IndexError, AttributeError, TypeError,
            ) as e:
                logger.warning(
                    "Hunyuan3D inference failed for image %d: %s",
                    i, e, exc_info=True,
                )
                outputs.append(None)

        return outputs
