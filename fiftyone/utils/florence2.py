"""
`Florence-2 <https://huggingface.co/microsoft/Florence-2-large>`_ wrapper for
the FiftyOne Model Zoo.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import itertools
import logging

import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

fou.ensure_torch()
import torch

logger = logging.getLogger(__name__)

# Florence-2 is native to transformers as
# ``Florence2ForConditionalGeneration`` from 4.56
_MIN_TRANSFORMERS = "transformers>=4.56"

DEFAULT_FLORENCE2_MODEL = "florence-community/Florence-2-base"

# Each task maps to its Florence-2 task token, the kind of label it produces,
# and whether it takes a ``text_prompt``
_TASKS = {
    "detection": ("<OD>", "detections", False),
    "dense_region_caption": ("<DENSE_REGION_CAPTION>", "detections", False),
    "region_proposal": ("<REGION_PROPOSAL>", "detections", False),
    "phrase_grounding": ("<CAPTION_TO_PHRASE_GROUNDING>", "detections", True),
    "open_vocabulary_detection": (
        "<OPEN_VOCABULARY_DETECTION>",
        "detections",
        True,
    ),
    "ocr_with_region": ("<OCR_WITH_REGION>", "ocr", False),
    "segmentation": ("<REFERRING_EXPRESSION_SEGMENTATION>", "polylines", True),
    "caption": ("<CAPTION>", "text", False),
    "detailed_caption": ("<DETAILED_CAPTION>", "text", False),
    "more_detailed_caption": ("<MORE_DETAILED_CAPTION>", "text", False),
    "ocr": ("<OCR>", "text", False),
}

# The label given to a region that Florence-2 returns without a name
_DEFAULT_LABEL = "object"


def _ensure_florence2():
    fou.ensure_package(_MIN_TRANSFORMERS)


transformers = fou.lazy_import("transformers", callback=_ensure_florence2)


def _select_dtype(device):
    """float16 on CUDA, as in the reference inference code; CPU inference
    wants float32."""
    return torch.float16 if "cuda" in str(device) else torch.float32


def _normalize_points(coords, width, height):
    """Relative ``(x, y)`` points, clamped to the image, from a flat list of
    pixel coordinates."""
    return [
        (
            min(max(float(x) / width, 0.0), 1.0),
            min(max(float(y) / height, 0.0), 1.0),
        )
        for x, y in zip(coords[0::2], coords[1::2])
    ]


def _to_bounding_box(coords, width, height):
    """The relative ``[x, y, w, h]`` box enclosing a flat list of pixel
    coordinates, or None when the box has no area inside the image."""
    box = fout._polyline_to_bbox([_normalize_points(coords, width, height)])
    return box if box[2] > 0 and box[3] > 0 else None


def _to_detections(parsed, width, height):
    """Detections from a Florence-2 result carrying pixel ``bboxes``."""
    bboxes = parsed.get("bboxes") or []
    labels = parsed.get("labels", parsed.get("bboxes_labels")) or []

    detections = []
    for bbox, label in itertools.zip_longest(bboxes, labels, fillvalue=""):
        if not bbox or len(bbox) != 4:
            continue

        box = _to_bounding_box(bbox, width, height)
        if box is None:
            continue

        detections.append(
            fol.Detection(
                label=str(label).strip() or _DEFAULT_LABEL, bounding_box=box
            )
        )

    return fol.Detections(detections=detections)


def _ocr_to_detections(parsed, width, height):
    """Detections from a Florence-2 OCR result, one per text region, whose
    label is the text and whose box encloses the region's four corners."""
    quads = parsed.get("quad_boxes") or []
    texts = parsed.get("labels") or []

    detections = []
    for quad, text in zip(quads, texts):
        text = str(text).replace("</s>", "").replace("<s>", "").strip()
        if not text or len(quad) != 8:
            continue

        box = _to_bounding_box(quad, width, height)
        if box is None:
            continue

        detections.append(fol.Detection(label=text, bounding_box=box))

    return fol.Detections(detections=detections)


def _to_polylines(parsed, width, height, label):
    """Closed, filled polylines from a Florence-2 segmentation result, one
    per instance, each holding every polygon of that instance."""
    polygons = parsed.get("polygons") or []
    labels = parsed.get("labels") or []

    polylines = []
    for rings, name in itertools.zip_longest(polygons, labels, fillvalue=""):
        points = [
            _normalize_points(ring, width, height)
            for ring in rings or []
            if len(ring) >= 6
        ]

        if points:
            polylines.append(
                fol.Polyline(
                    label=str(name).strip() or label or _DEFAULT_LABEL,
                    points=points,
                    closed=True,
                    filled=True,
                )
            )

    return fol.Polylines(polylines=polylines)


def _to_classification(text):
    text = str(text).strip()
    return fol.Classification(label=text) if text else None


class Florence2ModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for running a :class:`Florence2Model`.

    Args:
        name_or_path ("florence-community/Florence-2-base"): the HuggingFace
            model to load
        task ("detection"): the task to run. One of ``"detection"``,
            ``"dense_region_caption"``, ``"region_proposal"``,
            ``"phrase_grounding"``, ``"open_vocabulary_detection"``,
            ``"ocr_with_region"``, ``"segmentation"``, ``"caption"``,
            ``"detailed_caption"``, ``"more_detailed_caption"`` or ``"ocr"``
        text_prompt (None): the text the ``"phrase_grounding"`` (a caption
            whose phrases are located), ``"open_vocabulary_detection"`` (the
            object to find) and ``"segmentation"`` (the expression to segment)
            tasks run on. Ignored by the other tasks
        max_new_tokens (1024): the maximum number of tokens to generate
        num_beams (3): the number of beams of the beam search
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)

        self.name_or_path = self.parse_string(
            d, "name_or_path", default=DEFAULT_FLORENCE2_MODEL
        )
        self.task = self.parse_string(d, "task", default="detection")
        if self.task not in _TASKS:
            raise ValueError(
                "Unsupported task '%s'. Supported tasks are: %s"
                % (self.task, ", ".join(_TASKS))
            )
        self.text_prompt = self.parse_string(d, "text_prompt", default=None)
        if _TASKS[self.task][2] and not self.text_prompt:
            raise ValueError("The '%s' task needs a text_prompt" % self.task)
        self.max_new_tokens = self.parse_int(d, "max_new_tokens", default=1024)
        if self.max_new_tokens <= 0:
            raise ValueError(
                "max_new_tokens must be positive; got %s" % self.max_new_tokens
            )
        self.num_beams = self.parse_int(d, "num_beams", default=3)
        if self.num_beams < 1:
            raise ValueError(
                "num_beams must be positive; got %s" % self.num_beams
            )

        # Florence-2 consumes the raw image via its own processor
        self.raw_inputs = True


class Florence2Model(fout.TorchImageModel):
    """FiftyOne wrapper for `Florence-2
    <https://huggingface.co/microsoft/Florence-2-large>`_.

    Florence-2 is a 0.23B (base) or 0.77B (large) sequence-to-sequence vision
    model that runs one task per prompt, released pretrained and fine-tuned on
    a collection of downstream tasks (``-ft``). The task decides the label
    type:
    ``"detection"``, ``"dense_region_caption"``, ``"region_proposal"``,
    ``"phrase_grounding"`` and ``"open_vocabulary_detection"`` return
    :class:`fiftyone.core.labels.Detections`; ``"ocr_with_region"`` returns
    :class:`fiftyone.core.labels.Detections` whose labels are the recognized
    text; ``"segmentation"`` returns :class:`fiftyone.core.labels.Polylines`;
    and the caption tasks and ``"ocr"`` return a
    :class:`fiftyone.core.labels.Classification` whose label is the text.

    Example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart", max_samples=5)

        model = foz.load_zoo_model("florence-2-base-torch")
        dataset.apply_model(model, label_field="florence_detections")

        model = foz.load_zoo_model(
            "florence-2-base-torch", task="detailed_caption"
        )
        dataset.apply_model(model, label_field="caption")

        model = foz.load_zoo_model(
            "florence-2-base-torch",
            task="phrase_grounding",
            text_prompt="a person holding a carrot",
        )
        dataset.apply_model(model, label_field="grounding")

        session = fo.launch_app(dataset)

    Args:
        config: a :class:`Florence2ModelConfig`
    """

    def __init__(self, config):
        self._processor = None
        super().__init__(config)

    def _download_model(self, config):
        pass  # transformers downloads the model on first load

    def _load_model(self, config):
        self._processor = transformers.AutoProcessor.from_pretrained(
            config.name_or_path
        )
        model = transformers.Florence2ForConditionalGeneration.from_pretrained(
            config.name_or_path, dtype=_select_dtype(self._device)
        ).eval()
        return model.to(self._device)

    @property
    def media_type(self):
        return "image"

    @property
    def ragged_batches(self):
        return False

    @property
    def has_collate_fn(self):
        return True

    @staticmethod
    def collate_fn(batch):
        # Keep the raw images as a list; the processor resizes each one
        return batch

    def _prompt(self):
        token, _, takes_text = _TASKS[self.config.task]
        return token + self.config.text_prompt if takes_text else token

    def _generate(self, images):
        """The decoded generation for each image, run as one batch."""
        inputs = self._processor(
            text=[self._prompt()] * len(images),
            images=images,
            return_tensors="pt",
        ).to(self._device, _select_dtype(self._device))
        with torch.inference_mode():
            ids = self._model.generate(
                **inputs,
                max_new_tokens=self.config.max_new_tokens,
                num_beams=self.config.num_beams,
                do_sample=False,
            )

        return self._processor.batch_decode(ids, skip_special_tokens=False)

    def _to_label(self, text, image_size):
        token, kind, _ = _TASKS[self.config.task]
        parsed = self._processor.post_process_generation(
            text, task=token, image_size=image_size
        )[token]
        width, height = image_size

        if kind == "text":
            return _to_classification(parsed)

        if kind == "detections":
            return _to_detections(parsed, width, height)

        if kind == "ocr":
            return _ocr_to_detections(parsed, width, height)

        return _to_polylines(parsed, width, height, self.config.text_prompt)

    def _predict_all(self, imgs):
        images, sizes = fout.imgs_to_rgb_pil(imgs)

        try:
            texts = self._generate(images)
        except Exception as e:
            if len(images) == 1:
                logger.warning("Florence-2 failed on an image: %s", e)
                texts = [None]
            else:
                # One bad image fails the whole batch, so each is run alone
                texts = []
                for image in images:
                    try:
                        texts.extend(self._generate([image]))
                    except Exception as err:  # per-image guard
                        logger.warning(
                            "Florence-2 failed on an image: %s", err
                        )
                        texts.append(None)

        return [
            None if text is None else self._to_label(text, size)
            for text, size in zip(texts, sizes)
        ]
