"""
`Argus <https://huggingface.co/phanerozoic/argus>`_ wrapper for the FiftyOne
Model Zoo.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging

import numpy as np

import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

fou.ensure_torch()
import torch

logger = logging.getLogger(__name__)

# Argus loads its model code from the model repository through transformers
_REQUIREMENT = "transformers"

DEFAULT_ARGUS_MODEL = "phanerozoic/argus"

_TASKS = ("classification", "segmentation", "depth", "detection")

# Argus's own detection score threshold
_DEFAULT_SCORE_THRESH = 0.05

# The ADE20K classes of the segmentation head, in the order of its outputs
_ADE20K_CLASSES = (
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
)


def _ensure_argus():
    fou.ensure_package(_REQUIREMENT)


transformers = fou.lazy_import("transformers", callback=_ensure_argus)


def _to_classification(result):
    """A classification from an Argus top-1 result, labeled with the first
    name of its ImageNet class."""
    name = str(result["class_name"]).split(",")[0].strip()
    return fol.Classification(label=name, confidence=float(result["score"]))


def _to_segmentation(mask):
    """A segmentation from an Argus map of ADE20K class indices."""
    if torch.is_tensor(mask):
        mask = mask.detach().cpu().numpy()

    return fol.Segmentation(mask=np.asarray(mask).astype(np.uint8))


def _to_heatmap(depth):
    """A heatmap from an Argus metric depth map, normalized by its maximum,
    with the maximum depth in meters in ``max_depth``."""
    if torch.is_tensor(depth):
        depth = depth.detach().cpu().numpy()

    depth = np.asarray(depth, dtype=np.float32)
    max_depth = float(depth.max()) if depth.size else 0.0
    if max_depth > 0:
        depth = depth / max_depth
    else:
        depth = np.zeros_like(depth)

    heatmap = fol.Heatmap(map=depth)
    heatmap.is_metric = True
    heatmap.max_depth = max_depth
    return heatmap


def _to_detections(results, width, height):
    """Detections from Argus results carrying pixel ``[x1, y1, x2, y2]``
    boxes."""
    detections = []
    for result in results:
        x1, y1, x2, y2 = (float(v) for v in result["box"])
        x1, x2 = max(x1, 0.0) / width, min(x2, width) / width
        y1, y2 = max(y1, 0.0) / height, min(y2, height) / height
        if x2 <= x1 or y2 <= y1:
            continue

        detections.append(
            fol.Detection(
                label=str(result["class_name"]),
                bounding_box=[x1, y1, x2 - x1, y2 - y1],
                confidence=float(result["score"]),
            )
        )

    return fol.Detections(detections=detections)


class ArgusModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for running an :class:`ArgusModel`.

    Args:
        name_or_path ("phanerozoic/argus"): the HuggingFace model to load
        revision (None): the revision of the model repository to load, which
            pins the model code that is loaded with ``trust_remote_code``
        task ("detection"): the task to run. One of ``"classification"``,
            ``"segmentation"``, ``"depth"`` or ``"detection"``
        resolution (None): the square resolution at which to run the
            ``"segmentation"``, ``"depth"`` and ``"detection"`` tasks. By
            default, each runs at the resolution its head was trained at:
            512, 416 and 768, respectively. ``"classification"`` always runs
            at 224
        nms_thresh (0.5): the IoU threshold of the non-maximum suppression
            applied to detections
        max_detections (100): the maximum number of detections per image
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)

        self.name_or_path = self.parse_string(
            d, "name_or_path", default=DEFAULT_ARGUS_MODEL
        )
        self.revision = self.parse_string(d, "revision", default=None)
        self.task = self.parse_string(d, "task", default="detection")
        if self.task not in _TASKS:
            raise ValueError(
                "Unsupported task '%s'. Supported tasks are: %s"
                % (self.task, ", ".join(_TASKS))
            )
        self.resolution = self.parse_int(d, "resolution", default=None)
        if self.resolution is not None and self.resolution <= 0:
            raise ValueError(
                "resolution must be positive; got %s" % self.resolution
            )
        self.nms_thresh = self.parse_number(d, "nms_thresh", default=0.5)
        self.max_detections = self.parse_int(d, "max_detections", default=100)
        if self.max_detections <= 0:
            raise ValueError(
                "max_detections must be positive; got %s" % self.max_detections
            )

        # Argus preprocesses the raw images itself
        self.raw_inputs = True


class ArgusModel(fout.TorchImageModel):
    """FiftyOne wrapper for `Argus <https://huggingface.co/phanerozoic/argus>`_.

    Argus attaches task heads to a frozen EUPE-ViT-B backbone. The ``task``
    decides the label type: ``"classification"`` returns a
    :class:`fiftyone.core.labels.Classification` over the 1,000 ImageNet
    classes, ``"segmentation"`` returns a
    :class:`fiftyone.core.labels.Segmentation` over the 150 ADE20K classes,
    named by :attr:`mask_targets`, ``"depth"`` returns a
    :class:`fiftyone.core.labels.Heatmap` of metric depth, normalized by its
    maximum with the maximum in meters in ``max_depth``, and ``"detection"``
    returns :class:`fiftyone.core.labels.Detections` over the 80 COCO
    classes.

    Example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart", max_samples=5)

        model = foz.load_zoo_model("argus-torch")
        dataset.apply_model(model, label_field="argus_detections")

        model = foz.load_zoo_model("argus-torch", task="segmentation")
        dataset.apply_model(model, label_field="argus_segmentation")
        dataset.mask_targets["argus_segmentation"] = model.mask_targets
        dataset.save()

        session = fo.launch_app(dataset)

    Args:
        config: an :class:`ArgusModelConfig`
    """

    def _download_model(self, config):
        pass  # transformers downloads the model on first load

    def _load_model(self, config):
        model = transformers.AutoModel.from_pretrained(
            config.name_or_path,
            revision=config.revision,
            trust_remote_code=True,
        ).eval()
        return model.to(self._device)

    @property
    def media_type(self):
        return "image"

    @property
    def mask_targets(self):
        if self.config.task == "segmentation":
            return dict(enumerate(_ADE20K_CLASSES))

        return None

    @property
    def ragged_batches(self):
        return False

    @property
    def has_collate_fn(self):
        return True

    @staticmethod
    def collate_fn(batch):
        # Keep the raw images as a list; Argus resizes each one
        return batch

    def _run(self, images, sizes):
        """The labels for a batch of RGB PIL images of the given sizes."""
        task = self.config.task
        kwargs = {}
        if self.config.resolution is not None and task != "classification":
            kwargs["resolution"] = self.config.resolution

        if task == "classification":
            results = self._model.classify(images, top_k=1)
            return [_to_classification(r[0]) for r in results]

        if task == "segmentation":
            masks = self._model.segment(images, **kwargs)
            return [_to_segmentation(m) for m in masks]

        if task == "depth":
            depths = self._model.depth(images, **kwargs)
            return [_to_heatmap(d) for d in depths]

        score_thresh = self.config.confidence_thresh
        if score_thresh is None:
            score_thresh = _DEFAULT_SCORE_THRESH

        results = self._model.detect(
            images,
            score_thresh=score_thresh,
            nms_thresh=self.config.nms_thresh,
            max_per_image=self.config.max_detections,
            **kwargs,
        )
        return [_to_detections(r, w, h) for r, (w, h) in zip(results, sizes)]

    def _predict_all(self, imgs):
        images, sizes = fout.imgs_to_rgb_pil(imgs)

        try:
            return self._run(images, sizes)
        except Exception as e:
            if len(images) == 1:
                logger.warning("Argus failed on an image: %s", e)
                return [None]

        # One bad image fails the whole batch, so each is run alone
        labels = []
        for image, size in zip(images, sizes):
            try:
                labels.extend(self._run([image], [size]))
            except Exception as err:  # per-image guard
                logger.warning("Argus failed on an image: %s", err)
                labels.append(None)

        return labels
