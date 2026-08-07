"""
`PaddleOCR-VL <https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.6>`_ wrapper
for the FiftyOne Model Zoo.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
import re

import numpy as np

import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

fou.ensure_torch()
import torch

logger = logging.getLogger(__name__)

# PaddleOCR-VL is native to transformers as ``AutoModelForImageTextToText``,
# but its config trips the strict dataclass validation in the transformers
# 5.4.x line (``tie_word_embeddings`` typed ``int`` vs the checkpoint's
# ``bool``); 5.13 restored the coercion.
_MIN_TRANSFORMERS = "transformers>=5.13"

DEFAULT_PADDLEOCR_VL_MODEL = "PaddlePaddle/PaddleOCR-VL-1.6"

# Spotting (detection + recognition) is the only task that emits geometry, so
# it is the default; the text/table/formula/chart/seal tasks emit content only.
_TASK_PROMPTS = {
    "spotting": "Spotting:",
    "ocr": "OCR:",
    "table": "Table Recognition:",
    "formula": "Formula Recognition:",
    "chart": "Chart Recognition:",
    "seal": "Seal Recognition:",
}

# Spotting output is a reading-order stream of ``text`` followed by eight
# ``<|LOC_n|>`` tokens (a four-point quad), coordinates normalized to [0, 1000].
_LOC_BINS = 1000
_SPOT_PATTERN = re.compile(r"(.*?)((?:<\|LOC_\d+\|>){8})", re.DOTALL)
_LOC_TOKEN = re.compile(r"<\|LOC_(\d+)\|>")

# The reference spotting pipeline doubles images whose dimensions are both
# under this threshold and raises the processor's pixel budget, so fine text
# survives the resize. Coordinates are normalized, so the upscale does not
# change the returned boxes.
_SPOTTING_UPSCALE_THRESHOLD = 1500
_SPOTTING_MAX_PIXELS = 2048 * 28 * 28
_DEFAULT_MAX_PIXELS = 1280 * 28 * 28
_MIN_PIXELS = 4 * 28 * 28


def _ensure_paddleocr_vl():
    fou.ensure_package(_MIN_TRANSFORMERS)


transformers = fou.lazy_import("transformers", callback=_ensure_paddleocr_vl)

from PIL import Image as PILImage


def _to_pil(img):
    """Converts a raw model input (PIL image, HWC numpy array, or CHW torch
    tensor) to an RGB PIL image, the form PaddleOCR-VL's processor consumes."""
    if isinstance(img, PILImage.Image):
        return img.convert("RGB")

    if isinstance(img, torch.Tensor):
        img = img.detach().cpu().numpy()
        if img.ndim == 3 and img.shape[0] in (1, 3, 4):
            img = np.transpose(img, (1, 2, 0))

    img = np.asarray(img)
    if np.issubdtype(img.dtype, np.floating):
        if img.max() <= 1.0:
            img = img * 255.0
        img = np.clip(img, 0, 255)
    img = img.astype(np.uint8)
    if img.ndim == 2:
        img = np.stack([img] * 3, axis=-1)
    if img.shape[2] == 1:
        img = np.repeat(img, 3, axis=2)
    elif img.shape[2] == 4:
        img = img[:, :, :3]
    return PILImage.fromarray(img).convert("RGB")


def _select_dtype(device) -> "torch.dtype":
    """bfloat16 is a CUDA optimization; CPU inference wants float32."""
    return torch.bfloat16 if "cuda" in str(device) else torch.float32


def _upscale_for_spotting(pil) -> "PILImage.Image":
    """Doubles images whose dimensions are both under 1500 px, matching the
    reference spotting pipeline, which upscales small inputs so fine text
    survives the processor's resize."""
    width, height = pil.size
    if (
        width < _SPOTTING_UPSCALE_THRESHOLD
        and height < _SPOTTING_UPSCALE_THRESHOLD
    ):
        resample = getattr(PILImage, "Resampling", PILImage).LANCZOS
        return pil.resize((width * 2, height * 2), resample)
    return pil


def _parse_spotting(text):
    """Parses PaddleOCR-VL spotting output into text regions.

    The model emits a reading-order stream of ``content`` spans, each followed
    by eight ``<|LOC_n|>`` tokens forming a four-point quad with coordinates
    normalized to ``[0, 1000]``. Returns a list of ``(content, [x, y, w, h])``
    tuples with the box normalized to ``[0, 1]``.
    """
    regions = []
    for match in _SPOT_PATTERN.finditer(text):
        content = match.group(1).strip()
        if not content:
            continue
        locs = [int(v) for v in _LOC_TOKEN.findall(match.group(2))]
        if len(locs) != 8:
            continue
        xs = [locs[i] / _LOC_BINS for i in range(0, 8, 2)]
        ys = [locs[i] / _LOC_BINS for i in range(1, 8, 2)]
        x0 = min(max(min(xs), 0.0), 1.0)
        y0 = min(max(min(ys), 0.0), 1.0)
        xf = min(max(max(xs), 0.0), 1.0)
        yf = min(max(max(ys), 0.0), 1.0)
        w, h = xf - x0, yf - y0
        if w <= 0 or h <= 0:
            continue
        regions.append((content, [x0, y0, w, h]))
    return regions


class PaddleOCRVLModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for running a :class:`PaddleOCRVLModel`.

    Args:
        name_or_path ("PaddlePaddle/PaddleOCR-VL-1.6"): the HuggingFace model to
            load
        task ("spotting"): the recognition task. One of ``"spotting"``,
            ``"ocr"``, ``"table"``, ``"formula"``, ``"chart"``, ``"seal"``.
            Only ``"spotting"`` produces localized text regions
        max_new_tokens (1024): the maximum number of tokens to generate
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)

        self.name_or_path = self.parse_string(
            d, "name_or_path", default=DEFAULT_PADDLEOCR_VL_MODEL
        )
        self.task = self.parse_string(d, "task", default="spotting")
        if self.task not in _TASK_PROMPTS:
            raise ValueError(
                "Unsupported task '%s'. Supported tasks are: %s"
                % (self.task, ", ".join(_TASK_PROMPTS))
            )
        self.max_new_tokens = self.parse_int(d, "max_new_tokens", default=1024)

        # PaddleOCR-VL consumes the raw image via its own processor
        self.raw_inputs = True


class PaddleOCRVLModel(fout.TorchImageModel):
    """FiftyOne wrapper for `PaddleOCR-VL
    <https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.6>`_.

    PaddleOCR-VL is a 0.9B vision-language document parser. Under the default
    ``"spotting"`` task it detects and recognizes text in one pass, returning a
    :class:`fiftyone.core.labels.Detections` per image, one detection per text
    region whose ``label`` is the recognized string and ``bounding_box`` is the
    region. The other tasks (``"ocr"``, ``"table"``, ``"formula"``,
    ``"chart"``, ``"seal"``) recognize content without geometry and return an
    empty :class:`fiftyone.core.labels.Detections`.

    Example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart", max_samples=5)

        model = foz.load_zoo_model("paddle-ocr-vl-torch")
        dataset.apply_model(model, label_field="ocr")

        session = fo.launch_app(dataset)

    Args:
        config: a :class:`PaddleOCRVLModelConfig`
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
        model = transformers.AutoModelForImageTextToText.from_pretrained(
            config.name_or_path, dtype=_select_dtype(self._device)
        ).eval()
        return model.to(self._device)

    @property
    def media_type(self):
        return "image"

    def _predict_all(self, imgs):
        prompt = _TASK_PROMPTS[self.config.task]
        # Only spotting emits geometry; the recognition-only tasks return
        # content without boxes, so they map to empty detections
        is_spotting = self.config.task == "spotting"
        max_pixels = (
            _SPOTTING_MAX_PIXELS if is_spotting else _DEFAULT_MAX_PIXELS
        )
        results = []
        for img in imgs:
            try:
                pil = _to_pil(img)
                if is_spotting:
                    pil = _upscale_for_spotting(pil)
                messages = [
                    {
                        "role": "user",
                        "content": [
                            {"type": "image", "image": pil},
                            {"type": "text", "text": prompt},
                        ],
                    }
                ]
                inputs = self._processor.apply_chat_template(
                    messages,
                    add_generation_prompt=True,
                    tokenize=True,
                    return_dict=True,
                    return_tensors="pt",
                    images_kwargs={
                        "size": {
                            "shortest_edge": getattr(
                                self._processor.image_processor,
                                "min_pixels",
                                None,
                            )
                            or _MIN_PIXELS,
                            "longest_edge": max_pixels,
                        }
                    },
                ).to(self._device)
                with torch.inference_mode():
                    out = self._model.generate(
                        **inputs, max_new_tokens=self.config.max_new_tokens
                    )
                text = self._processor.decode(
                    out[0][inputs["input_ids"].shape[-1] :],
                    skip_special_tokens=False,
                )
            except Exception as e:  # per-image guard
                logger.warning("PaddleOCR-VL failed on an image: %s", e)
                results.append(fol.Detections())
                continue

            if is_spotting:
                detections = [
                    fol.Detection(label=content, bounding_box=box)
                    for content, box in _parse_spotting(text)
                ]
            else:
                detections = []
            results.append(fol.Detections(detections=detections))

        return results
