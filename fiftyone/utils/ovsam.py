"""
`Open-Vocabulary SAM <https://github.com/HarborYuan/ovsam>`_ wrapper for the
FiftyOne Model Zoo.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
import os
import sys
import numpy as np

import eta.core.utils as etau

import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.utils.sam as fosam
import fiftyone.zoo.models as fozm

fou.ensure_torch()
import torch
import torch.nn.functional as F

logger = logging.getLogger(__name__)

_OVSAM_SPACE_REPO = "HarborYuan/ovsam"
_OVSAM_WEIGHT_FILES = [
    "models/ovsam_R50x16_lvisnorare.pth",
    "models/sam2clip_vith_rn50.pth",
    "models/R50x16_fpn_lvis_norare_v3det.pth",
    "models/RN50x16_LVISV1Dataset.pth",
]

_LVIS_CLASSES = None  # loaded lazily


# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------


def _get_ovsam_dir(model_path):
    """~/.fiftyone/models/ovsam/ (parent of the models/ subdir)."""
    return os.path.dirname(os.path.dirname(os.path.abspath(model_path)))


def _get_space_dir(model_path):
    """~/.fiftyone/models/ovsam/space/"""
    return os.path.join(_get_ovsam_dir(model_path), "space")


def _get_models_dir(model_path):
    """~/.fiftyone/models/ovsam/models/"""
    return os.path.dirname(os.path.abspath(model_path))


# ---------------------------------------------------------------------------
# Download helpers
# ---------------------------------------------------------------------------


def _ensure_ovsam_space(space_dir):
    """Download the HuggingFace space Python code (no weights) if missing."""
    sentinel = os.path.join(space_dir, "main.py")
    if os.path.isfile(sentinel):
        return

    fou.ensure_package("huggingface_hub")
    from huggingface_hub import snapshot_download

    logger.info("Downloading OV-SAM space code from HuggingFace…")
    snapshot_download(
        repo_id=_OVSAM_SPACE_REPO,
        repo_type="space",
        local_dir=space_dir,
        ignore_patterns=["*.pth", "*.pt", "app/assets/*", ".git/*"],
    )
    logger.info("OV-SAM space code downloaded to %s", space_dir)


def _ensure_ovsam_weights(model_path):
    """Download the four OV-SAM checkpoint files into models/ if missing."""
    ovsam_dir = _get_ovsam_dir(model_path)

    fou.ensure_package("huggingface_hub")
    from huggingface_hub import hf_hub_download

    for rel_path in _OVSAM_WEIGHT_FILES:
        dest = os.path.join(ovsam_dir, rel_path)
        if not os.path.isfile(dest):
            logger.info("Downloading %s…", rel_path)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            hf_hub_download(
                repo_id=_OVSAM_SPACE_REPO,
                repo_type="space",
                filename=rel_path,
                local_dir=ovsam_dir,
                local_dir_use_symlinks=False,
            )


# ---------------------------------------------------------------------------
# Class names
# ---------------------------------------------------------------------------


def _load_lvis_classes(space_dir):
    global _LVIS_CLASSES
    if _LVIS_CLASSES is not None:
        return _LVIS_CLASSES

    _setup_space_imports(space_dir)
    import importlib

    lvis_mod = importlib.import_module("ext.class_names.lvis_list")
    _LVIS_CLASSES = [c.replace("_", " ") for c in lvis_mod.LVIS_CLASSES]
    return _LVIS_CLASSES


# ---------------------------------------------------------------------------
# sys.path helper
# ---------------------------------------------------------------------------


def _setup_space_imports(space_dir):
    if space_dir not in sys.path:
        sys.path.insert(0, space_dir)


# ---------------------------------------------------------------------------
# Picklable transforms (used by build_get_item; closures can't be pickled)
# ---------------------------------------------------------------------------


class _OVSAMImageTransform:
    """Return raw numpy array + original (h, w)."""

    def __call__(self, img):
        if isinstance(img, np.ndarray):
            return img, img.shape[:2]
        arr = np.array(img.convert("RGB"))
        return arr, arr.shape[:2]


class _OVSAMBoxTransform:
    """Scale XYXY pixel boxes from original image space → OV-SAM 1024-px space."""

    def __init__(self, img_size=1024):
        self.img_size = img_size

    def __call__(self, boxes_xyxy, img_hw, resolution=None):
        orig_h, orig_w = img_hw
        scale = self.img_size / max(orig_h, orig_w)
        scaled = np.asarray(boxes_xyxy, dtype=np.float32) * scale
        return torch.tensor(scaled, dtype=torch.float32)


class _OVSAMPointTransform:
    """Scale XY pixel points from original image space → OV-SAM 1024-px space."""

    def __init__(self, img_size=1024):
        self.img_size = img_size

    def __call__(self, points, img_hw, point_labels=None, resolution=None):
        orig_h, orig_w = img_hw
        scale = self.img_size / max(orig_h, orig_w)
        scaled_pts = np.asarray(points, dtype=np.float32) * scale
        pts_tensor = torch.tensor(scaled_pts, dtype=torch.float32)
        if point_labels is not None:
            lbl_tensor = torch.tensor(point_labels, dtype=torch.int)
        else:
            lbl_tensor = torch.ones(len(scaled_pts), dtype=torch.int)
        return pts_tensor, lbl_tensor


# ---------------------------------------------------------------------------
# Output processor
# ---------------------------------------------------------------------------


class OVSAMOutputProcessor(fout.OutputProcessor):
    """Converts OV-SAM predictions to :class:`fiftyone.core.labels.Detections`.

    Args:
        classes (None): list of class names (LVIS 1203-class vocabulary)
        mask_threshold (0.5): sigmoid threshold for binary mask
    """

    def __init__(self, classes=None, mask_threshold=0.5):
        self.classes = classes or []
        self.mask_threshold = mask_threshold

    def __call__(self, output, frame_sizes, **kwargs):
        """
        Args:
            output: list of ``(masks_list, cls_preds_list)`` per image,
                where each mask is a ``bool`` numpy array of shape
                ``(orig_h, orig_w)`` and each cls_pred is a float tensor
                of shape ``(num_classes,)``.
            frame_sizes: list of ``(orig_h, orig_w)`` tuples (ignored here;
                masks are already cropped to original size by the model).

        Returns:
            list of :class:`fiftyone.core.labels.Detections`
        """
        results = []
        for masks_list, cls_preds_list in output:
            detections = []
            for mask, cls_pred in zip(masks_list, cls_preds_list):
                score, class_idx = cls_pred.max(dim=-1)
                score = float(score)
                class_idx = int(class_idx)
                label = (
                    self.classes[class_idx]
                    if class_idx < len(self.classes)
                    else str(class_idx)
                )
                detections.append(
                    fol.Detection.from_mask(
                        mask=mask,
                        label=label,
                        confidence=score,
                    )
                )
            results.append(fol.Detections(detections=detections))
        return results


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------


class OpenVocabularySAMModelConfig(
    fout.TorchImageModelConfig, fozm.HasZooModel
):
    """Configuration for :class:`OpenVocabularySAMModel`.

    See :class:`fiftyone.utils.torch.TorchImageModelConfig` for shared args.

    Args:
        mask_threshold (0.5): sigmoid threshold used to binarise masks
        get_item_cls (None): :class:`GetItem` class string; defaults to
            ``"fiftyone.utils.sam.SegmentAnythingImageGetItem"``
        get_item_args (None): extra kwargs forwarded to the GetItem constructor
        points_mask_index (None): for point prompts, which of the three SAM
            output masks to use (0/1/2); ``None`` picks the highest-IOU mask
    """

    def __init__(self, cfg_dict):
        d = self.init(cfg_dict)
        super().__init__(d)

        self.mask_threshold = self.parse_number(
            d, "mask_threshold", default=0.5
        )
        self.get_item_cls = self.parse_string(
            d,
            "get_item_cls",
            default="fiftyone.utils.sam.SegmentAnythingImageGetItem",
        )
        self.get_item_args = self.parse_dict(d, "get_item_args", default=None)
        self.points_mask_index = self.parse_int(
            d, "points_mask_index", default=None
        )


# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------


class OpenVocabularySAMModel(fout.TorchImageModelWithPrompts):
    """Wrapper for
    `Open-Vocabulary SAM <https://github.com/HarborYuan/ovsam>`_ inference.

    OV-SAM combines a frozen OpenCLIP (RN50x16) backbone with SAM's prompt
    encoder and an open-vocabulary mask decoder, enabling prompted segmentation
    that also predicts an LVIS class label (1 203 categories).

    Box prompt example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart", max_samples=5)

        model = foz.load_zoo_model("open-vocabulary-sam-lvis-torch")

        dataset.apply_model(
            model,
            label_field="ovsam",
            box_prompt_field="ground_truth",
        )

        session = fo.launch_app(dataset)

    Args:
        config: an :class:`OpenVocabularySAMModelConfig`
    """

    # OV-SAM image size (pixels on the long side)
    IMG_SIZE = 1024
    _MEAN = [123.675, 116.28, 103.53]
    _STD = [58.395, 57.12, 57.375]

    def __init__(self, config):
        if config.output_processor_cls is None:
            config.output_processor_cls = (
                "fiftyone.utils.ovsam.OVSAMOutputProcessor"
            )

        fout.TorchImageModelWithPrompts.__init__(self, config)

        # Update output processor with class names
        classes = self._load_classes()
        if self._output_processor is not None and hasattr(
            self._output_processor, "classes"
        ):
            self._output_processor.classes = classes

        self._classes = classes
        self._mean = torch.tensor(self._MEAN, device=self._device)[
            :, None, None
        ]
        self._std = torch.tensor(self._STD, device=self._device)[:, None, None]

    # ------------------------------------------------------------------
    # Zoo model protocol
    # ------------------------------------------------------------------

    def _download_model(self, config):
        space_dir = _get_space_dir(config.model_path)
        _ensure_ovsam_space(space_dir)
        _ensure_ovsam_weights(config.model_path)

    def _load_model(self, config):
        space_dir = _get_space_dir(config.model_path)
        ovsam_dir = _get_ovsam_dir(config.model_path)

        _setup_space_imports(space_dir)

        # mmdet/mmengine required
        fou.ensure_package("mmengine")
        fou.ensure_package("mmdet")
        from mmengine import Config
        from mmdet.registry import MODELS

        config_path = os.path.join(
            space_dir, "app", "configs", "sam_r50x16_fpn.py"
        )

        # The space config uses relative paths like ``./models/…`` which are
        # resolved relative to the current working directory.  We temporarily
        # chdir to ovsam_dir so that ``./models/`` maps to
        # ``{ovsam_dir}/models/``.
        orig_cwd = os.getcwd()
        try:
            os.chdir(ovsam_dir)
            self._patch_sam_checkpoint(space_dir)
            cfg = Config.fromfile(config_path)
            model = MODELS.build(cfg.model)
            model.eval()
            model.init_weights()
        finally:
            os.chdir(orig_cwd)

        return model

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _load_classes(self):
        space_dir = _get_space_dir(self.config.model_path)
        return _load_lvis_classes(space_dir)

    def _patch_sam_checkpoint(self, space_dir):
        """Point checkpoint_dict['vit_h'] at FiftyOne's cached SAM model
        (if present) to avoid a redundant 2.5 GB download."""
        import fiftyone as fo

        sam_h = os.path.join(fo.config.model_zoo_dir, "sam_vit_h_4b8939.pth")
        if not os.path.isfile(sam_h):
            return

        _setup_space_imports(space_dir)
        try:
            import importlib

            mod = importlib.import_module("ext.meta.sam_meta")
            if mod.checkpoint_dict.get("vit_h") != sam_h:
                mod.checkpoint_dict["vit_h"] = sam_h
                logger.debug(
                    "OV-SAM: using FiftyOne SAM ViT-H checkpoint at %s", sam_h
                )
        except Exception:
            pass  # Fall back to mmengine auto-download

    def _preprocess_image(self, img_np):
        """Resize → normalise → pad image to 1024×1024.

        Returns:
            img_tensor: ``(1, 3, 1024, 1024)`` float32 on model device
            orig_hw: ``(orig_h, orig_w)``
            new_hw: ``(new_h, new_w)`` (scaled content area inside the 1024 pad)
        """
        from PIL import Image as PILImage

        orig_h, orig_w = img_np.shape[:2]
        scale = self.IMG_SIZE / max(orig_h, orig_w)
        new_w = int(orig_w * scale)
        new_h = int(orig_h * scale)

        pil = PILImage.fromarray(img_np.astype(np.uint8))
        pil = pil.resize((new_w, new_h), resample=PILImage.Resampling.BILINEAR)
        arr = np.array(pil, dtype=np.float32)

        t = (
            torch.from_numpy(arr)
            .permute(2, 0, 1)
            .unsqueeze(0)
            .to(self._device)
        )
        t = (t - self._mean) / self._std
        t = F.pad(
            t,
            (0, self.IMG_SIZE - new_w, 0, self.IMG_SIZE - new_h),
            "constant",
            0,
        )
        return t, (orig_h, orig_w), (new_h, new_w)

    def _scale_boxes(self, boxes_xyxy_px, orig_hw):
        """Scale XYXY pixel boxes from original image space → 1024 input space."""
        orig_h, orig_w = orig_hw
        scale = self.IMG_SIZE / max(orig_h, orig_w)
        return np.asarray(boxes_xyxy_px, dtype=np.float32) * scale

    def _scale_points(self, points_xy_px, orig_hw):
        """Scale XY pixel points from original image space → 1024 input space."""
        orig_h, orig_w = orig_hw
        scale = self.IMG_SIZE / max(orig_h, orig_w)
        return np.asarray(points_xy_px, dtype=np.float32) * scale

    def _mask_to_orig(self, mask_1024, orig_hw, new_hw):
        """Crop 1024-padded binary mask → original image dimensions.

        Args:
            mask_1024: numpy bool array ``(1024, 1024)``
            orig_hw: ``(orig_h, orig_w)``
            new_hw: ``(new_h, new_w)`` — content area in the 1024 pad
        """
        from PIL import Image as PILImage

        new_h, new_w = new_hw
        orig_h, orig_w = orig_hw

        # Crop to the actual content region
        cropped = mask_1024[:new_h, :new_w]

        # Resize back to original dimensions if needed
        if (new_h, new_w) != (orig_h, orig_w):
            pil = PILImage.fromarray(cropped.astype(np.uint8) * 255, "L")
            pil = pil.resize((orig_w, orig_h), PILImage.Resampling.NEAREST)
            cropped = np.array(pil) > 127

        return cropped

    # ------------------------------------------------------------------
    # GetItem
    # ------------------------------------------------------------------

    def build_get_item(self, field_mapping=None):
        """Build a :class:`~fiftyone.utils.sam.SegmentAnythingImageGetItem`
        wired for OV-SAM's coordinate space."""
        get_item_cls = self.config.get_item_cls
        if get_item_cls is None:
            raise ValueError("get_item_cls is None")

        get_item = etau.get_class(get_item_cls)
        get_item_args = dict(self.config.get_item_args or {})
        field_mapping = {} if field_mapping is None else dict(field_mapping)
        fosam._expand_sam_prompt_field(field_mapping)

        return get_item(
            field_mapping=field_mapping,
            transform=get_item_args.pop("transform", _OVSAMImageTransform()),
            use_numpy=get_item_args.pop("use_numpy", True),
            box_transform=get_item_args.pop(
                "box_transform", _OVSAMBoxTransform(self.IMG_SIZE)
            ),
            point_transform=get_item_args.pop(
                "point_transform", _OVSAMPointTransform(self.IMG_SIZE)
            ),
            **get_item_args,
        )

    # ------------------------------------------------------------------
    # Inference
    # ------------------------------------------------------------------

    @property
    def ragged_batches(self):
        return False

    @property
    def has_collate_fn(self):
        return True

    @staticmethod
    def collate_fn(batch):
        return fosam.SegmentAnythingModel.collate_fn(batch)

    def predict(self, img, sample=None):
        return self.predict_all([img] if not isinstance(img, list) else img)[0]

    def predict_all(self, imgs, samples=None):
        return self._predict_all(imgs)

    def _predict_all(self, args):
        if self._preprocess and self.has_collate_fn:
            if isinstance(args, dict):
                args = [args]
            args = self.collate_fn(args)

        from mmengine.structures import InstanceData

        prompt_type = args["prompt_type"]
        images = args["image"]  # list of numpy arrays (original size)
        original_sizes = args.get("original_size") or [None] * len(images)

        all_outputs = []
        resolved_sizes = []

        for idx, img in enumerate(images):
            orig_hw = original_sizes[idx] if original_sizes else None

            # Ensure we have a numpy array
            if isinstance(img, torch.Tensor):
                img_np = img.numpy()
                if img_np.ndim == 4:
                    img_np = img_np[0]
                if img_np.dtype != np.uint8:
                    img_np = (img_np * 255).clip(0, 255).astype(np.uint8)
            else:
                img_np = np.asarray(img, dtype=np.uint8)
                if img_np.ndim == 4:
                    img_np = img_np[0]

            img_tensor, orig_hw_computed, new_hw = self._preprocess_image(
                img_np
            )
            if orig_hw is None:
                orig_hw = orig_hw_computed
            resolved_sizes.append(orig_hw)

            masks_list = []
            cls_preds_list = []

            with torch.no_grad():
                feat_cache = self._model.extract_feat(img_tensor)
                # Move features to CPU to save VRAM between prompts
                feat_cpu = {
                    k: (
                        tuple(v.cpu() for v in val)
                        if isinstance(val, tuple)
                        else val.cpu()
                        if isinstance(val, torch.Tensor)
                        else val
                    )
                    for k, val in feat_cache.items()
                }

                if prompt_type == "auto":
                    logger.warning(
                        "OV-SAM does not support automatic segmentation "
                        "(no prompts provided)."
                    )

                elif prompt_type in ("box_only", "box_point_combo"):
                    boxes_batch = args.get("boxes") or []
                    img_boxes = (
                        boxes_batch[idx] if idx < len(boxes_batch) else None
                    )
                    if img_boxes is not None:
                        # img_boxes: list of [N, 4] tensors (one per instance)
                        # or a single [N, 4] tensor
                        if isinstance(img_boxes, torch.Tensor):
                            box_list = [
                                img_boxes[i] for i in range(len(img_boxes))
                            ]
                        else:
                            box_list = img_boxes

                        for box in box_list:
                            box_t = (
                                box.to(self._device)
                                if isinstance(box, torch.Tensor)
                                else torch.tensor(
                                    box,
                                    dtype=torch.float32,
                                    device=self._device,
                                )
                            )
                            if box_t.ndim == 1:
                                box_t = box_t.unsqueeze(0)  # [1, 4]
                            prompts = InstanceData(bboxes=box_t)
                            feat_dev = self._feat_to_device(feat_cpu)
                            masks_np, cls_pred = self._model.extract_masks(
                                feat_dev, prompts
                            )
                            # masks_np: [1, 1, 1024, 1024] numpy float32
                            m = masks_np[0, 0] > self.config.mask_threshold
                            m = self._mask_to_orig(m, orig_hw, new_hw)
                            masks_list.append(m)
                            cls_preds_list.append(
                                cls_pred[0][0]
                            )  # [C] from (B=1, N=1, C)

                elif prompt_type == "point_only":
                    points_batch = args.get("point_coords") or []
                    labels_batch = args.get("point_labels") or []
                    img_pts = (
                        points_batch[idx] if idx < len(points_batch) else None
                    )
                    img_lbl = (
                        labels_batch[idx] if idx < len(labels_batch) else None
                    )
                    if img_pts is not None:
                        # img_pts: [B, N, 2] tensor (B prompts, each with N pts)
                        if isinstance(img_pts, torch.Tensor):
                            pts_batches = [
                                img_pts[i] for i in range(len(img_pts))
                            ]
                            lbl_batches = (
                                [img_lbl[i] for i in range(len(img_lbl))]
                                if img_lbl is not None
                                else [None] * len(pts_batches)
                            )
                        else:
                            pts_batches = [img_pts]
                            lbl_batches = [img_lbl]

                        for pts, lbl in zip(pts_batches, lbl_batches):
                            pts_t = (
                                pts.to(self._device)
                                if isinstance(pts, torch.Tensor)
                                else torch.tensor(
                                    pts,
                                    dtype=torch.float32,
                                    device=self._device,
                                )
                            )
                            if pts_t.ndim == 2:
                                pts_t = pts_t.unsqueeze(0)  # [1, N, 2]
                            prompts = InstanceData(point_coords=pts_t)
                            feat_dev = self._feat_to_device(feat_cpu)
                            masks_np, cls_pred = self._model.extract_masks(
                                feat_dev, prompts
                            )
                            m = masks_np[0, 0] > self.config.mask_threshold
                            m = self._mask_to_orig(m, orig_hw, new_hw)
                            masks_list.append(m)
                            cls_preds_list.append(
                                cls_pred[0][0]
                            )  # [C] from (B=1, N=1, C)

            all_outputs.append((masks_list, cls_preds_list))

        if self._output_processor is not None:
            return self._output_processor(all_outputs, resolved_sizes)
        return all_outputs

    def _feat_to_device(self, feat_cpu):
        """Move a feature dict from CPU back to the model device."""
        out = {}
        for k, val in feat_cpu.items():
            if isinstance(val, tuple):
                out[k] = tuple(v.to(self._device) for v in val)
            elif isinstance(val, torch.Tensor):
                out[k] = val.to(self._device)
            else:
                out[k] = val
        return out
