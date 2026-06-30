"""
FiftyOne wrapper for OpenWorldSAM zero-shot instance segmentation.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os

import numpy as np
import torch
import torch.nn.functional as F
from torchvision import transforms as T

import fiftyone.core.labels as fol
from fiftyone.zoo.models import HasZooModel
import fiftyone.utils.torch as fout


# SAM2 preprocessing constants (ImageNet-style normalization, 1024×1024 input)
_SAM_PIXEL_MEAN = torch.tensor([123.675, 116.28, 103.53])
_SAM_PIXEL_STD = torch.tensor([58.395, 57.12, 57.375])
_SAM_IMAGE_SIZE = 1024
_BEIT_IMAGE_SIZE = 224

# ADE20K-150 class list (detectron2 ordering) — default vocabulary
def _load_ade20k_classes():
    path = os.path.join(os.path.dirname(__file__), "ade20k_150_classes.txt")
    with open(path) as f:
        return [line.strip() for line in f if line.strip()]


_BEIT_TRANSFORM = T.Compose(
    [
        T.ToTensor(),
        T.Resize(
            (_BEIT_IMAGE_SIZE, _BEIT_IMAGE_SIZE),
            interpolation=3,
            antialias=None,
        ),
        T.Normalize(mean=(0.5, 0.5, 0.5), std=(0.5, 0.5, 0.5)),
    ]
)


class OpenWorldSAMTransform:
    """Dual-branch image transform for OpenWorldSAM.

    Accepts PIL images or HWC uint8 numpy arrays. Returns a dict containing
    the SAM2-preprocessed tensor (1024×1024), the BEiT-3-preprocessed tensor
    (224×224), and the original image dimensions. This dict is the per-image
    unit passed through the DataLoader and into :meth:`OpenWorldSAMModel._predict_all`.

    Args:
        device: the :class:`torch:torch.device` to move tensors to
        using_half_precision (False): whether to cast tensors to fp16
    """

    def __init__(self, device, using_half_precision=False):
        self._device = device
        self._using_half_precision = using_half_precision

    def __call__(self, img):
        from PIL import Image as PILImage

        if isinstance(img, PILImage.Image):
            arr = np.array(img.convert("RGB"))
        else:
            arr = np.asarray(img)

        h, w = arr.shape[:2]

        # SAM2 branch: resize to 1024×1024, ImageNet-style pixel normalization
        sam_tensor = torch.as_tensor(
            np.ascontiguousarray(arr.transpose(2, 0, 1))
        ).float()
        sam_tensor = F.interpolate(
            sam_tensor.unsqueeze(0),
            (_SAM_IMAGE_SIZE, _SAM_IMAGE_SIZE),
            mode="bilinear",
            align_corners=False,
        ).squeeze(0)
        mean = _SAM_PIXEL_MEAN.view(-1, 1, 1)
        std = _SAM_PIXEL_STD.view(-1, 1, 1)
        sam_tensor = (sam_tensor - mean) / std
        sam_tensor = sam_tensor.to(self._device)
        if self._using_half_precision:
            sam_tensor = sam_tensor.half()

        # BEiT-3 branch: resize to 224×224, [0.5, 0.5, 0.5] normalization
        pil = PILImage.fromarray(arr)
        beit_tensor = _BEIT_TRANSFORM(pil)
        beit_tensor = beit_tensor.to(self._device)
        if self._using_half_precision:
            beit_tensor = beit_tensor.half()

        return {
            "image": sam_tensor,
            "evf_image": beit_tensor,
            "height": h,
            "width": w,
        }


class OpenWorldSAMOutputProcessor(fout.OutputProcessor):
    """Output processor for :class:`OpenWorldSAMModel`.

    Parses the HF model's ``List[Dict]`` output into
    :class:`fiftyone.core.labels.Detections`. ``frame_size`` is ignored because
    masks already carry their own spatial dimensions.

    Args:
        classes (None): the list of class labels for the model
    """

    def __init__(self, classes=None, **kwargs):
        if classes is None:
            raise ValueError("This model requires class labels")
        self.classes = classes

    def __call__(
        self,
        output,
        frame_size,
        confidence_thresh=None,
        classes=None,
        **kwargs
    ):
        return [
            fol.Detections(
                detections=self._parse_instances(
                    out, confidence_thresh, classes
                )
            )
            for out in output
        ]

    def _parse_instances(self, output, confidence_thresh, filter_classes):
        if not output or "instances" not in output:
            return []

        instances = output["instances"]
        # Support both detectron2 Instances objects and plain dicts
        if hasattr(instances, "pred_masks"):
            pred_masks = instances.pred_masks
            pred_classes = instances.pred_classes
            scores = instances.scores
        else:
            pred_masks = instances.get(
                "pred_masks", instances.get("masks", torch.empty(0))
            )
            pred_classes = instances.get(
                "pred_classes",
                instances.get("class_ids", torch.empty(0, dtype=torch.long)),
            )
            scores = instances.get("scores", torch.empty(0))

        detections = []
        for mask_t, cls_id, score in zip(pred_masks, pred_classes, scores):
            score = float(score)
            if confidence_thresh is not None and score < confidence_thresh:
                continue
            idx = int(cls_id)
            label = (
                self.classes[idx] if 0 <= idx < len(self.classes) else str(idx)
            )
            if filter_classes is not None and label not in filter_classes:
                continue
            mask = (mask_t > 0).cpu().numpy().astype(bool)
            if not mask.any():
                continue
            detections.append(
                fol.Detection.from_mask(
                    mask=mask, label=label, confidence=score
                )
            )

        return detections


class OpenWorldSAMModelConfig(fout.TorchImageModelConfig, HasZooModel):
    """Configuration for :class:`OpenWorldSAMModel`.

    Args:
        name_or_path (None): HF repo ID or local path to the OpenWorldSAM model
            uploaded with ``trust_remote_code=True``
        iou_threshold (0.5): minimum IoU score to keep an instance
        class_names (None): list of text prompts for zero-shot segmentation.
            Defaults to all 150 ADE20K categories
        nms_threshold (0.2): NMS IoU threshold for duplicate suppression
        top_k (100): maximum instances returned per image
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)
        self.name_or_path = self.parse_string(d, "name_or_path")
        self.iou_threshold = self.parse_number(d, "iou_threshold", default=0.5)
        self.class_names = self.parse_array(d, "class_names", default=None)
        self.nms_threshold = self.parse_number(d, "nms_threshold", default=0.2)
        self.top_k = self.parse_int(d, "top_k", default=100)
        self.raw_inputs = True  # items are dicts, not stackable tensors
        self.validate_config()

    def validate_config(self):
        if self.class_names is not None:
            if not self.class_names:
                raise ValueError(
                    "class_names must contain at least one prompt"
                )
            if any(
                not isinstance(c, str) or not c.strip()
                for c in self.class_names
            ):
                raise ValueError("class_names must contain non-empty strings")
        if not 0 <= self.iou_threshold <= 1:
            raise ValueError("iou_threshold must be in [0, 1]")
        if not 0 <= self.nms_threshold <= 1:
            raise ValueError("nms_threshold must be in [0, 1]")
        if self.top_k < 1:
            raise ValueError("top_k must be >= 1")


class OpenWorldSAMModel(fout.TorchImageModel):
    """FiftyOne wrapper for OpenWorldSAM zero-shot instance segmentation.

    OpenWorldSAM extends SAM2 (Hiera Large) with BEiT-3 language understanding
    to enable open-vocabulary segmentation from arbitrary text prompts. Weights
    are hosted on HuggingFace Hub (``trust_remote_code=True``).

    Returns :class:`fiftyone.core.labels.Detections` with per-instance binary
    masks, labels, and confidence scores for each image.

    Example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart", max_samples=5)
        model = foz.load_zoo_model(
            "openworld-sam-ade20k-torch",
            class_names=["person", "car", "chair", "table"],
        )
        dataset.apply_model(model, label_field="owsam_pred")
        session = fo.launch_app(dataset)

    Args:
        config: an :class:`OpenWorldSAMModelConfig`
    """

    def __init__(self, config):
        fout.TorchImageModel.__init__(self, config)

    def _parse_classes(self, config):
        if config.class_names:
            return list(config.class_names)
        return _load_ade20k_classes()

    def _download_model(self, config):
        pass  # HF Hub handles download automatically on first load

    def _load_model(self, config):
        import sys, importlib
        from huggingface_hub import snapshot_download
        import fiftyone as fo

        # HF trust_remote_code can't resolve nested package imports, so we
        # download the snapshot and import directly via sys.path.
        local_dir = snapshot_download(
            config.name_or_path,
            cache_dir=fo.config.model_zoo_dir,
            ignore_patterns=["*.pt", "*.pth"],
        )

        if local_dir not in sys.path:
            sys.path.insert(0, local_dir)

        OpenWorldSAMConfig = importlib.import_module(
            "configuration_openworld_sam"
        ).OpenWorldSAMConfig
        OpenWorldSAMModel = importlib.import_module(
            "modeling_openworld_sam"
        ).OpenWorldSAMModel

        hf_config = OpenWorldSAMConfig(
            nms_threshold=config.nms_threshold,
            iou_threshold=config.iou_threshold,
            detections_per_image=config.top_k,
        )
        self._hf_model = OpenWorldSAMModel.from_pretrained(
            local_dir,
            config=hf_config,
            low_cpu_mem_usage=False,
        )
        self._hf_model = self._hf_model.to(self._device)
        if self._using_half_precision:
            self._hf_model = self._hf_model.half()
        self._hf_model.eval()
        return self._hf_model

    def _build_transforms(self, config):
        transform = OpenWorldSAMTransform(
            device=self._device,
            using_half_precision=bool(self._using_half_precision),
        )
        # ragged_batches=True: items are dicts, not uniform tensors, so the
        # DataLoader must not attempt to torch.stack them
        return transform, True

    def _build_output_processor(self, config):
        return OpenWorldSAMOutputProcessor(classes=self._classes)

    def _forward_pass(self, imgs):
        # self._classes is always set by _parse_classes before inference
        prompts = list(self._classes)
        # Assign sequential integer IDs; class labels in output index into this list
        category_ids = list(range(len(prompts)))

        batch_input = [
            {**d, "prompt": prompts, "unique_categories": category_ids}
            for d in imgs
        ]
        return self._hf_model(batch_input)
