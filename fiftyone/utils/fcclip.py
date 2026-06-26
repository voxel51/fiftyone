"""
`FC-CLIP <https://github.com/bytedance/fc-clip>`_ wrapper for the
FiftyOne Model Zoo.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
import os
import sys
import urllib.request
import zipfile

import numpy as np

import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

fou.ensure_torch()
import torch

logger = logging.getLogger(__name__)

_FCCLIP_REPO_URL = (
    "https://github.com/bytedance/fc-clip/archive/refs/heads/main.zip"
)
# Google Drive file ID for the ConvNeXt-Large COCO panoptic checkpoint
_FCCLIP_GDRIVE_ID = "1-91PIns86vyNaL3CzMmDD39zKGnPMtvj"


# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------


def _get_fcclip_dir(model_path):
    """Return ``~/.fiftyone/models/fcclip/`` (parent of the models/ subdir)."""
    return os.path.dirname(os.path.dirname(os.path.abspath(model_path)))


def _get_repo_dir(model_path):
    """Return ``~/.fiftyone/models/fcclip/repo/``."""
    return os.path.join(_get_fcclip_dir(model_path), "repo")


# ---------------------------------------------------------------------------
# Download helpers
# ---------------------------------------------------------------------------


def _ensure_fcclip_code(repo_dir):
    """Download & extract the FC-CLIP GitHub repo if not already present."""
    sentinel = os.path.join(repo_dir, "setup.py")
    if os.path.isfile(sentinel):
        return

    os.makedirs(repo_dir, exist_ok=True)

    import tempfile

    logger.info("Downloading FC-CLIP source code from GitHub…")
    with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        urllib.request.urlretrieve(_FCCLIP_REPO_URL, tmp_path)
        prefix = "fc-clip-main/"
        with zipfile.ZipFile(tmp_path, "r") as zf:
            for member in zf.infolist():
                if not member.filename.startswith(prefix):
                    continue
                rel = member.filename[len(prefix) :]
                if not rel:
                    continue
                dest = os.path.join(repo_dir, rel)
                if member.is_dir():
                    os.makedirs(dest, exist_ok=True)
                else:
                    os.makedirs(os.path.dirname(dest), exist_ok=True)
                    with zf.open(member) as src, open(dest, "wb") as dst:
                        dst.write(src.read())
    finally:
        os.unlink(tmp_path)

    logger.info("FC-CLIP code extracted to %s", repo_dir)


def _ensure_fcclip_weights(model_path):
    """Download the FC-CLIP ConvNeXt-Large checkpoint via gdown."""
    if os.path.isfile(model_path):
        return

    fou.ensure_package("gdown")
    import gdown

    os.makedirs(os.path.dirname(model_path), exist_ok=True)
    logger.info("Downloading FC-CLIP weights (ConvNeXt-Large, ~500 MB)…")
    gdown.download(
        id=_FCCLIP_GDRIVE_ID, output=model_path, quiet=False, fuzzy=True
    )


def _setup_fcclip_imports(repo_dir):
    """Add the FC-CLIP repo root to ``sys.path`` for runtime imports."""
    if repo_dir not in sys.path:
        sys.path.insert(0, repo_dir)


def _patch_msda_for_cpu():
    """Inject a stub MultiScaleDeformableAttention module.

    FC-CLIP's pixel decoder raises ``ModuleNotFoundError`` if the compiled
    MSDA CUDA ops are missing.  Injecting this stub makes the import succeed;
    at inference time ``MSDeformAttn.forward`` falls back to its bare-except
    clause which calls ``ms_deform_attn_core_pytorch`` (pure PyTorch).
    """
    import types

    if "MultiScaleDeformableAttention" in sys.modules:
        return

    stub = types.ModuleType("MultiScaleDeformableAttention")

    def _raise_not_compiled(*args, **kwargs):
        raise RuntimeError(
            "MultiScaleDeformableAttention CUDA ops are not compiled; "
            "using pure-PyTorch CPU fallback"
        )

    stub.ms_deform_attn_forward = _raise_not_compiled
    stub.ms_deform_attn_backward = _raise_not_compiled
    sys.modules["MultiScaleDeformableAttention"] = stub


def _patch_encode_text_batch_first():
    """Fix FC-CLIP's encode_text for open_clip >= 2.20 (batch_first=True).

    open_clip >= 2.20 creates Transformer with ``batch_first=True`` and does
    not transpose internally, so expects [N, L, D] input/output.  FC-CLIP's
    encode_text was written for the old convention and permutes NLD→LND
    before calling the transformer, causing a shape mismatch in the attention
    mask.  This patch removes those permutes when batch_first=True.
    """
    try:
        import open_clip
        import torch.nn.functional as F

        _t = open_clip.transformer.Transformer(width=64, layers=1, heads=1)
        if not getattr(_t, "batch_first", False):
            return  # old open_clip; no fix needed

        import importlib

        fcclip_mod = importlib.import_module("fcclip")
        FCCLIPBackbone = fcclip_mod.modeling.backbone.clip.CLIP

        def _encode_text_fixed(self, text, normalize: bool = False):
            cast_dtype = self.clip_model.transformer.get_cast_dtype()
            x = self.clip_model.token_embedding(text).to(
                cast_dtype
            )  # [N, L, D]
            x = x + self.clip_model.positional_embedding.to(cast_dtype)
            # batch_first=True: transformer expects [N, L, D]; no permute needed
            x = self.clip_model.transformer(
                x, attn_mask=self.clip_model.attn_mask
            )
            x = self.clip_model.ln_final(x)
            x = (
                x[torch.arange(x.shape[0]), text.argmax(dim=-1)]
                @ self.clip_model.text_projection
            )
            return F.normalize(x, dim=-1) if normalize else x

        FCCLIPBackbone.encode_text = _encode_text_fixed
        logger.info(
            "Patched FC-CLIP encode_text for open_clip batch_first=True"
        )
    except Exception as e:
        logger.warning("Could not patch FC-CLIP encode_text: %s", e)


# ---------------------------------------------------------------------------
# Picklable image transform (for DataLoader workers)
# ---------------------------------------------------------------------------


class _FCCLIPBGRTransform:
    """Convert RGB numpy image to BGR for detectron2's DefaultPredictor."""

    def __call__(self, img):
        if not isinstance(img, np.ndarray):
            img = np.array(img.convert("RGB"))
        return img[:, :, ::-1].copy()


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------


class FCCLIPModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for :class:`FCCLIPModel`.

    Args:
        score_threshold (0.5): minimum instance confidence to keep
        config_name (None): YAML filename inside the FC-CLIP repo's
            ``configs/coco/panoptic-segmentation/fcclip/`` directory.
            Defaults to ``"fcclip_convnext_large_eval_ade20k.yaml"``
    """

    def __init__(self, cfg_dict):
        d = self.init(cfg_dict)
        super().__init__(d)

        self.score_threshold = self.parse_number(
            d, "score_threshold", default=0.5
        )
        self.config_name = self.parse_string(
            d,
            "config_name",
            default="fcclip_convnext_large_eval_ade20k.yaml",
        )


# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------


class FCCLIPModel(fout.TorchImageModel):
    """Wrapper for
    `FC-CLIP <https://github.com/bytedance/fc-clip>`_ inference.

    FC-CLIP is an open-vocabulary panoptic/instance/semantic segmentation
    model that combines a frozen CLIP backbone (ConvNeXt-Large) with a
    Mask2Former-style transformer decoder.

    This wrapper runs instance segmentation and returns detections with
    binary masks and class labels drawn from the test-dataset vocabulary
    (ADE20K 150 classes by default).

    Example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart", max_samples=5)

        model = foz.load_zoo_model("fc-clip-coco-torch")

        dataset.apply_model(model, label_field="fcclip_pred")

        session = fo.launch_app(dataset)

    Args:
        config: an :class:`FCCLIPModelConfig`
    """

    def __init__(self, config):
        self._classes = None  # populated in _load_model
        fout.TorchImageModel.__init__(self, config)
        # Note: TorchImageModel.__init__ calls _parse_classes() which would
        # normally overwrite self._classes; we override it below to preserve
        # the value set by _load_model.

    def _parse_classes(self, config):
        # Return whatever _load_model already set (detectron2 metadata classes)
        return getattr(self, "_classes", None)

    # ------------------------------------------------------------------
    # Zoo model protocol
    # ------------------------------------------------------------------

    def _download_model(self, config):
        repo_dir = _get_repo_dir(config.model_path)
        _ensure_fcclip_code(repo_dir)
        _ensure_fcclip_weights(config.model_path)

    def _load_model(self, config):
        repo_dir = _get_repo_dir(config.model_path)
        _setup_fcclip_imports(repo_dir)

        fou.ensure_package("detectron2")
        from detectron2.config import get_cfg
        from detectron2.data import MetadataCatalog
        from detectron2.projects.deeplab import add_deeplab_config
        import importlib

        # Provide a stub MSDA module so the CPU fallback path is reachable
        # without compiling the CUDA ops.
        _patch_msda_for_cpu()

        # FC-CLIP source uses open('./fcclip/...') relative paths during
        # import, so chdir to the repo root for the initial module load.
        orig_cwd = os.getcwd()
        try:
            os.chdir(repo_dir)
            fcclip = importlib.import_module("fcclip")
            demo = importlib.import_module("demo.predictor")
        finally:
            os.chdir(orig_cwd)

        # Fix encode_text() for open_clip >= 2.20 which uses batch_first=True
        _patch_encode_text_batch_first()

        cfg = get_cfg()
        add_deeplab_config(cfg)
        fcclip.add_maskformer2_config(cfg)
        fcclip.add_fcclip_config(cfg)

        config_yaml = os.path.join(
            repo_dir,
            "configs",
            "coco",
            "panoptic-segmentation",
            "fcclip",
            config.config_name,
        )
        cfg.merge_from_file(config_yaml)
        cfg.MODEL.WEIGHTS = config.model_path
        cfg.MODEL.DEVICE = str(self._device)
        # Panoptic mode: instance_inference has a class-count mismatch bug when
        # stuff_classes != thing_classes (ADE20K).  Panoptic inference is
        # self-consistent and returns all segments (things + stuff).
        cfg.MODEL.MASK_FORMER.TEST.SEMANTIC_ON = False
        cfg.MODEL.MASK_FORMER.TEST.INSTANCE_ON = False
        cfg.MODEL.MASK_FORMER.TEST.PANOPTIC_ON = True
        cfg.freeze()

        # Pull class names from detectron2 metadata for the configured dataset.
        # Panoptic uses stuff_classes (thing+stuff); fall back to thing_classes.
        # ADE20K stores comma-separated synonyms per class; keep the first.
        try:
            meta = MetadataCatalog.get(cfg.DATASETS.TEST[0])
            raw = list(
                meta.stuff_classes
                if hasattr(meta, "stuff_classes")
                else meta.thing_classes
            )
            self._classes = [c.split(",")[0].strip() for c in raw]
        except Exception:
            self._classes = []

        self._predictor = demo.DefaultPredictor(cfg)

        # Return a dummy module; TorchImageModel stores it as self._model
        # but we use self._predictor for actual inference
        return torch.nn.Identity()

    # ------------------------------------------------------------------
    # GetItem — load images as BGR numpy for detectron2
    # ------------------------------------------------------------------

    def build_get_item(self, field_mapping=None):
        return fout.ImageGetItem(
            field_mapping=field_mapping,
            transform=_FCCLIPBGRTransform(),
            raw_inputs=True,
            use_numpy=True,
        )

    # ------------------------------------------------------------------
    # Inference
    # ------------------------------------------------------------------

    def _predict_all(self, imgs):
        """Run FC-CLIP on a batch of BGR numpy images.

        With ``raw_inputs=True`` and ``ragged_batches=True``, the
        DataLoader always delivers ``batch_size=1``, so ``imgs`` is a
        one-element list containing a single BGR numpy array.
        """
        results = []
        for img in imgs:
            if isinstance(img, torch.Tensor):
                img = img.numpy()
            with torch.no_grad():
                preds = self._predictor(img)
            panoptic_seg, segments_info = preds["panoptic_seg"]
            panoptic_seg = panoptic_seg.cpu()
            results.append(
                fol.Detections(
                    detections=self._to_detections(panoptic_seg, segments_info)
                )
            )
        return results

    def _to_detections(self, panoptic_seg, segments_info):
        """Convert a panoptic map + segments_info to :class:`fo.Detection` list."""
        detections = []
        for seg in segments_info:
            seg_id = seg["id"]
            cat_id = seg["category_id"]
            mask = (panoptic_seg == seg_id).numpy().astype(bool)
            if not mask.any():
                continue
            label = (
                self._classes[cat_id]
                if self._classes and cat_id < len(self._classes)
                else str(cat_id)
            )
            detections.append(fol.Detection.from_mask(mask=mask, label=label))
        return detections
