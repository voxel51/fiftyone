"""
`Hunyuan3D <https://github.com/Tencent-Hunyuan/Hunyuan3D-2>`_
wrapper for the FiftyOne Model Zoo.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
import os
import shutil
import tempfile
import uuid
from typing import Any, List, Optional, Union

import numpy as np
from PIL import Image
import torch

import fiftyone.core.labels as fol
import fiftyone.core.threed as fo3d
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

logger = logging.getLogger(__name__)


def _ensure_hunyuan3d() -> None:
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

SUPPORTED_OUTPUT_FORMATS = ("obj", "stl", "ply", "fbx", "gltf", "glb")

_MESH_TYPES = {
    "obj": fo3d.ObjMesh,
    "stl": fo3d.StlMesh,
    "ply": fo3d.PlyMesh,
    "fbx": fo3d.FbxMesh,
    "gltf": fo3d.GltfMesh,
    "glb": fo3d.GltfMesh,
}


class Hunyuan3DModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for running a :class:`Hunyuan3DModel`.

    See :class:`fiftyone.utils.torch.TorchImageModelConfig` for additional
    arguments.

    Args:
        name_or_path ("tencent/Hunyuan3D-2"): the name or path of the
            Hunyuan3D model to load
        output_dir (None): directory to write generated mesh and scene files.
            If ``None``, a temporary directory is created and a warning is
            logged
        output_format ("obj"): mesh output format. One of
            ``"obj"``, ``"stl"``, ``"ply"``, ``"fbx"``, ``"gltf"``, ``"glb"``
    """

    def __init__(self, d: dict) -> None:
        d = self.init(d)
        super().__init__(d)

        self.name_or_path = self.parse_string(
            d, "name_or_path", default=DEFAULT_HUNYUAN3D_MODEL
        )
        self.output_dir = self.parse_string(d, "output_dir", default=None)
        self.output_format = self.parse_string(
            d, "output_format", default="obj"
        )
        if self.output_format not in SUPPORTED_OUTPUT_FORMATS:
            raise ValueError(
                "Unsupported output_format '%s'; expected one of %s"
                % (self.output_format, ", ".join(SUPPORTED_OUTPUT_FORMATS))
            )

        self.is_v21 = self.name_or_path == "tencent/Hunyuan3D-2.1"

        # Hunyuan3D's pipeline accepts PIL images and string paths directly,
        # so the wrapper bypasses TorchImageModel's tensor-style preprocessing.
        self.raw_inputs = True


class Hunyuan3DModel(fout.TorchImageModel):
    """Wrapper for running
    `Hunyuan3D <https://github.com/Tencent-Hunyuan/Hunyuan3D-2>`_
    inference.

    Hunyuan3D is a large-scale 3D synthesis system that generates
    high-resolution textured 3D assets from a single image.

    When ``output_dir`` is not provided in the config, the wrapper writes
    meshes and scene files to a fresh temporary directory and logs its
    location. Call :meth:`cleanup` (or rely on garbage collection) to remove
    that directory; user-provided ``output_dir`` paths are never deleted.

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

    def __init__(self, config: Hunyuan3DModelConfig) -> None:
        super().__init__(config)
        self._output_dir: Optional[str] = config.output_dir
        self._output_format: str = config.output_format
        self._output_dir_initialized: bool = False
        self._owns_output_dir: bool = False

    def _load_model(self, config: Hunyuan3DModelConfig) -> Any:
        kwargs = {}
        if config.is_v21:
            kwargs["subfolder"] = "hunyuan3d-dit-v2-1"
            kwargs["use_safetensors"] = False

        return hy3dgen_shapegen.Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(
            config.name_or_path, **kwargs
        )

    @property
    def media_type(self) -> str:
        return "image"

    def _ensure_output_dir(self) -> None:
        if self._output_dir_initialized:
            return

        if self._output_dir is None:
            self._output_dir = tempfile.mkdtemp(prefix="hunyuan3d_")
            self._owns_output_dir = True
            logger.warning(
                "No output_dir provided; outputs will be written to "
                "temporary directory '%s'",
                self._output_dir,
            )

        os.makedirs(self._output_dir, exist_ok=True)
        self._output_dir_initialized = True

    def cleanup(self) -> None:
        """Removes the temporary output directory if one was created.

        No-op when the user supplied an explicit ``output_dir``.
        """
        if self._owns_output_dir and self._output_dir:
            shutil.rmtree(self._output_dir, ignore_errors=True)
            self._output_dir_initialized = False
            self._owns_output_dir = False

    def _to_pil(
        self, img: Union[str, Image.Image, np.ndarray, "torch.Tensor"]
    ) -> Union[str, Image.Image]:
        """Converts an input image to a PIL Image.

        The Hunyuan3D pipeline accepts string paths and PIL Images directly;
        numpy arrays and torch tensors are converted to PIL.
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

    def _export_mesh(self, mesh: Any) -> fol.Classification:
        """Writes a mesh and its FO3D scene to disk and returns a label."""
        self._ensure_output_dir()

        mesh_id = uuid.uuid4().hex
        mesh_filename = "mesh_%s.%s" % (mesh_id, self._output_format)
        mesh_path = os.path.join(self._output_dir, mesh_filename)
        mesh.export(mesh_path)

        mesh_cls = _MESH_TYPES[self._output_format]
        scene = fo3d.Scene()
        scene.add(mesh_cls("mesh", mesh_filename))
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

    def _predict_all(self, imgs: Any) -> List[Optional[fol.Classification]]:
        if not isinstance(imgs, list):
            imgs = [imgs]

        if len(imgs) == 0:
            return []

        outputs: List[Optional[fol.Classification]] = []
        for i, img in enumerate(imgs):
            try:
                pil_img = self._to_pil(img)
                mesh = self._model(image=pil_img)[0]
                outputs.append(self._export_mesh(mesh))
            except (OSError, RuntimeError, ValueError) as e:
                logger.warning(
                    "Hunyuan3D inference failed for image %d: %s",
                    i, e, exc_info=True,
                )
                outputs.append(None)

        return outputs
