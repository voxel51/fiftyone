"""
`Unlimited-OCR <https://huggingface.co/baidu/Unlimited-OCR>`_ wrapper for the
FiftyOne Model Zoo.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import ast
import logging
import re
import tempfile

import fiftyone.core.labels as fol
import fiftyone.core.models as fom
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

fou.ensure_torch()
import torch

logger = logging.getLogger(__name__)

DEFAULT_UNLIMITED_OCR_MODEL = "baidu/Unlimited-OCR"

# The default prompt runs full document parsing (layout + text + tables). The
# ``<image>`` token is where the image is inserted, and must be present.
DEFAULT_PROMPT = "<image>document parsing."

# Unlimited-OCR's custom modeling code targets transformers 4.x.
_MIN_TRANSFORMERS = "transformers>=4.49,<5"

# Coordinate tokens are emitted as integers in ``[0, 999]``.
_NUM_COORD_BINS = 1000

# Layout elements are emitted as ``<|det|>type [x0,y0,x1,y1]<|/det|>content``.
_DET_PATTERN = re.compile(
    r"<\|det\|>\s*([A-Za-z_][\w-]*)\s*(\[[\d,\s\[\]]*\])\s*<\|/det\|>",
    re.DOTALL,
)


def _ensure_unlimited_ocr():
    fou.ensure_package(_MIN_TRANSFORMERS)
    for pkg in ("easydict", "einops", "addict"):
        fou.ensure_package(pkg)


transformers = fou.lazy_import("transformers", callback=_ensure_unlimited_ocr)


def _parse_layout(text):
    """Parses Unlimited-OCR document-parsing output into layout elements.

    The model emits a reading-order stream of
    ``<|det|>type [x0,y0,x1,y1]<|/det|>content`` spans, where coordinates are
    integers in ``[0, 999]`` and ``content`` is the recognized text (or HTML
    for tables). Returns a list of ``dict``\\s with ``type``, ``text``, and a
    normalized ``[x, y, w, h]`` ``box``.
    """
    elements = []
    matches = list(_DET_PATTERN.finditer(text))
    for i, match in enumerate(matches):
        etype = match.group(1)
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        content = text[start:end].strip()

        try:
            coords = ast.literal_eval(match.group(2))
        except (ValueError, SyntaxError):
            continue

        if coords and isinstance(coords[0], (int, float)):
            coords = [coords]

        for box in coords:
            if len(box) != 4:
                continue

            x1, y1, x2, y2 = (float(v) / (_NUM_COORD_BINS - 1) for v in box)
            x0 = min(max(min(x1, x2), 0.0), 1.0)
            y0 = min(max(min(y1, y2), 0.0), 1.0)
            xf = min(max(x1, x2, 0.0), 1.0)
            yf = min(max(y1, y2, 0.0), 1.0)
            w, h = xf - x0, yf - y0
            if w <= 0 or h <= 0:
                continue

            elements.append(
                {"type": etype, "text": content, "box": [x0, y0, w, h]}
            )

    return elements


class UnlimitedOCRGetItem(fout.GetItem):
    """Passes the image filepath through to :class:`UnlimitedOCRModel`.

    Unlimited-OCR runs its own tiling pipeline on the full-resolution image,
    so the wrapper feeds it the filepath rather than a pre-transformed tensor.
    """

    @property
    def required_keys(self):
        return ["filepath"]

    def __call__(self, d):
        return {"filepath": d["filepath"]}


class UnlimitedOCRModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for running a :class:`UnlimitedOCRModel`.

    Args:
        name_or_path ("baidu/Unlimited-OCR"): the HuggingFace model to load
        prompt ("<image>document parsing."): the task prompt. Must contain the
            ``<image>`` token
        base_size (1024): the global-view size in pixels
        crop_size (640): the local-view (crop) size in pixels
        crop_mode (True): whether to tile large images into local views
        max_length (32768): the maximum number of tokens to generate
        no_repeat_ngram_size (35): n-gram size for the anti-repetition
            constraint used on long documents
        ngram_window (128): sliding-window size for the anti-repetition
            constraint
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)

        self.name_or_path = self.parse_string(
            d, "name_or_path", default=DEFAULT_UNLIMITED_OCR_MODEL
        )
        self.prompt = self.parse_string(d, "prompt", default=DEFAULT_PROMPT)
        self.base_size = self.parse_int(d, "base_size", default=1024)
        self.crop_size = self.parse_int(d, "crop_size", default=640)
        self.crop_mode = self.parse_bool(d, "crop_mode", default=True)
        self.max_length = self.parse_int(d, "max_length", default=32768)
        self.no_repeat_ngram_size = self.parse_int(
            d, "no_repeat_ngram_size", default=35
        )
        self.ngram_window = self.parse_int(d, "ngram_window", default=128)

        # Unlimited-OCR consumes the raw image filepath via its own pipeline
        self.raw_inputs = True


class UnlimitedOCRModel(fout.TorchImageModel, fom.SupportsGetItem):
    """Wrapper for `Unlimited-OCR
    <https://huggingface.co/baidu/Unlimited-OCR>`_ document parsing.

    Unlimited-OCR is a DeepSeek-VL2-based vision-language model that parses a
    document image into a reading-order stream of layout elements (titles,
    paragraphs, tables, figures) with their recognized text. This wrapper
    returns a :class:`fiftyone.core.labels.Detections` per image, one detection
    per layout element whose ``label`` is the element type, ``bounding_box`` is
    the element region, and ``text`` attribute is the recognized content (HTML
    for tables).

    Example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart", max_samples=5)

        model = foz.load_zoo_model("unlimited-ocr-torch")
        dataset.apply_model(model, label_field="ocr")

        session = fo.launch_app(dataset)

    Args:
        config: an :class:`UnlimitedOCRModelConfig`
    """

    def __init__(self, config):
        self._tokenizer = None
        super().__init__(config)

    def _download_model(self, config):
        pass  # transformers downloads the model on first load

    def _load_model(self, config):
        self._tokenizer = transformers.AutoTokenizer.from_pretrained(
            config.name_or_path, trust_remote_code=True
        )
        model = transformers.AutoModel.from_pretrained(
            config.name_or_path,
            trust_remote_code=True,
            use_safetensors=True,
            torch_dtype=torch.bfloat16,
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
        # Keep raw per-sample dicts as a list; the model tiles each image
        return batch

    def build_get_item(self, field_mapping=None):
        return UnlimitedOCRGetItem(field_mapping=field_mapping)

    def _predict_all(self, imgs):
        results = []
        for item in imgs:
            try:
                # ``infer`` creates ``output_path`` even in ``eval_mode`` (which
                # returns the parsed string rather than writing to disk), so we
                # give it a scratch dir that is discarded
                with tempfile.TemporaryDirectory() as scratch:
                    raw = self._model.infer(
                        self._tokenizer,
                        prompt=self.config.prompt,
                        image_file=item["filepath"],
                        output_path=scratch,
                        eval_mode=True,
                        base_size=self.config.base_size,
                        image_size=self.config.crop_size,
                        crop_mode=self.config.crop_mode,
                        max_length=self.config.max_length,
                        no_repeat_ngram_size=self.config.no_repeat_ngram_size,
                        ngram_window=self.config.ngram_window,
                    )
            except Exception as e:  # per-image guard
                logger.warning("Unlimited-OCR failed on an image: %s", e)
                results.append(fol.Detections())
                continue

            detections = [
                fol.Detection(
                    label=el["type"],
                    bounding_box=el["box"],
                    text=el["text"],
                )
                for el in _parse_layout(raw)
            ]
            results.append(fol.Detections(detections=detections))

        return results
