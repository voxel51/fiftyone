"""
FiftyOne wrapper for OpenWorldSAM zero-shot instance segmentation.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

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
ADE20K_150_CLASSES = [
    "wall",
    "building",
    "sky",
    "floor",
    "tree",
    "ceiling",
    "road",
    "bed",
    "windowpane",
    "grass",
    "cabinet",
    "sidewalk",
    "person",
    "earth",
    "door",
    "table",
    "mountain",
    "plant",
    "curtain",
    "chair",
    "car",
    "water",
    "painting",
    "sofa",
    "shelf",
    "house",
    "sea",
    "mirror",
    "rug",
    "field",
    "armchair",
    "seat",
    "fence",
    "desk",
    "rock",
    "wardrobe",
    "lamp",
    "bathtub",
    "railing",
    "cushion",
    "base",
    "box",
    "column",
    "signboard",
    "chest of drawers",
    "counter",
    "sand",
    "sink",
    "skyscraper",
    "fireplace",
    "refrigerator",
    "grandstand",
    "path",
    "stairs",
    "runway",
    "case",
    "pool table",
    "pillow",
    "screen door",
    "stairway",
    "river",
    "bridge",
    "bookcase",
    "blind",
    "coffee table",
    "toilet",
    "flower",
    "book",
    "hill",
    "bench",
    "countertop",
    "stove",
    "palm",
    "kitchen island",
    "computer",
    "swivel chair",
    "boat",
    "bar",
    "arcade machine",
    "hovel",
    "bus",
    "towel",
    "light",
    "truck",
    "tower",
    "chandelier",
    "awning",
    "streetlight",
    "booth",
    "television receiver",
    "airplane",
    "dirt track",
    "apparel",
    "pole",
    "land",
    "bannister",
    "escalator",
    "ottoman",
    "bottle",
    "buffet",
    "poster",
    "stage",
    "van",
    "ship",
    "fountain",
    "conveyer belt",
    "canopy",
    "washer",
    "plaything",
    "swimming pool",
    "stool",
    "barrel",
    "basket",
    "waterfall",
    "tent",
    "bag",
    "minibike",
    "cradle",
    "oven",
    "ball",
    "food",
    "step",
    "tank",
    "trade name",
    "microwave",
    "pot",
    "animal",
    "bicycle",
    "lake",
    "dishwasher",
    "screen",
    "blanket",
    "sculpture",
    "hood",
    "sconce",
    "vase",
    "traffic light",
    "tray",
    "ashcan",
    "fan",
    "pier",
    "crt screen",
    "plate",
    "monitor",
    "bulletin board",
    "shower",
    "radiator",
    "glass",
    "clock",
    "flag",
]

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


class OpenWorldSAMModelConfig(fout.TorchImageModelConfig, HasZooModel):
    """Configuration for :class:`OpenWorldSAMModel`.

    Args:
        name_or_path (None): HF repo ID or local path to the OpenWorldSAM model
            uploaded with ``trust_remote_code=True``
        score_threshold (0.5): minimum IoU score to keep an instance
        class_names (None): list of text prompts for zero-shot segmentation.
            Defaults to all 150 ADE20K categories
        nms_threshold (0.2): NMS IoU threshold for duplicate suppression
        top_k (100): maximum instances returned per image
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)
        self.name_or_path = self.parse_string(d, "name_or_path")
        self.score_threshold = self.parse_number(
            d, "score_threshold", default=0.5
        )
        self.class_names = self.parse_array(d, "class_names", default=None)
        self.nms_threshold = self.parse_number(d, "nms_threshold", default=0.2)
        self.top_k = self.parse_int(d, "top_k", default=100)


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
        self._hf_model = None
        fout.TorchImageModel.__init__(self, config)

    def _parse_classes(self, config):
        if config.class_names:
            return list(config.class_names)
        return list(ADE20K_150_CLASSES)

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
            iou_threshold=config.score_threshold,
            detections_per_image=config.top_k,
        )
        self._hf_model = OpenWorldSAMModel.from_pretrained(
            local_dir,
            config=hf_config,
            low_cpu_mem_usage=False,
        )
        self._hf_model.eval()
        return self._hf_model

    @staticmethod
    def _to_uint8(img):
        """Convert any image representation to a HWC uint8 numpy array."""
        if isinstance(img, torch.Tensor):
            if img.ndim == 4:
                img = img[0]
            arr = img.permute(1, 2, 0).cpu().numpy()
            if arr.dtype != np.uint8:
                arr = (arr * 255).clip(0, 255).astype(np.uint8)
            return arr
        if isinstance(img, np.ndarray):
            if img.dtype != np.uint8:
                return (img * 255).clip(0, 255).astype(np.uint8)
            return img
        return np.asarray(img).astype(np.uint8)

    @staticmethod
    def _preprocess_sam(arr):
        """HWC uint8 → CHW float32 tensor normalized for SAM2 (1024×1024)."""
        tensor = torch.as_tensor(
            np.ascontiguousarray(arr.transpose(2, 0, 1))
        ).float()
        tensor = F.interpolate(
            tensor.unsqueeze(0),
            (_SAM_IMAGE_SIZE, _SAM_IMAGE_SIZE),
            mode="bilinear",
            align_corners=False,
        ).squeeze(0)
        mean = _SAM_PIXEL_MEAN.view(-1, 1, 1)
        std = _SAM_PIXEL_STD.view(-1, 1, 1)
        return (tensor - mean) / std

    @staticmethod
    def _preprocess_beit3(arr):
        """HWC uint8 → CHW float32 tensor normalized for BEiT-3 (224×224)."""
        from PIL import Image as PILImage

        pil = PILImage.fromarray(arr)
        return _BEIT_TRANSFORM(pil)

    def _predict_all(self, imgs):
        class_names = self._classes or ADE20K_150_CLASSES
        prompts = list(class_names)
        # Assign sequential integer IDs; class labels in output index into this list
        category_ids = list(range(len(prompts)))

        results = []
        for img in imgs:
            arr = self._to_uint8(img)
            h, w = arr.shape[:2]

            sam_tensor = self._preprocess_sam(arr)
            beit_tensor = self._preprocess_beit3(arr)

            batch_input = [
                {
                    "image": sam_tensor,
                    "evf_image": beit_tensor,
                    "height": h,
                    "width": w,
                    "prompt": prompts,
                    "unique_categories": category_ids,
                }
            ]

            with torch.no_grad():
                outputs = self._hf_model(batch_input)

            detections = []
            if outputs and "instances" in outputs[0]:
                instances = outputs[0]["instances"]
                # Support both detectron2 Instances objects and plain dicts
                if hasattr(instances, "pred_masks"):
                    pred_masks = instances.pred_masks
                    pred_classes = instances.pred_classes
                    scores = instances.scores
                else:
                    pred_masks = instances.get("masks", torch.empty(0))
                    pred_classes = instances.get(
                        "class_ids", torch.empty(0, dtype=torch.long)
                    )
                    scores = instances.get("scores", torch.empty(0))

                for mask_t, cls_id, score in zip(
                    pred_masks, pred_classes, scores
                ):
                    mask = (mask_t > 0).cpu().numpy().astype(bool)
                    if not mask.any():
                        continue
                    idx = int(cls_id)
                    label = (
                        class_names[idx]
                        if idx < len(class_names)
                        else str(idx)
                    )
                    detections.append(
                        fol.Detection.from_mask(
                            mask=mask,
                            label=label,
                            confidence=float(score),
                        )
                    )

            results.append(fol.Detections(detections=detections))

        return results
