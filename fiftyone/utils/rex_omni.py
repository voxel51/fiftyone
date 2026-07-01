"""
`Rex-Omni <https://huggingface.co/IDEA-Research/Rex-Omni>`_ wrapper for the
FiftyOne Model Zoo.

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


def _ensure_rex_omni():
    # Rex-Omni is a Qwen2.5-VL checkpoint; Qwen2.5-VL support landed in
    # transformers 4.49.0.
    fou.ensure_package("transformers>=4.49.0")
    fou.ensure_package("accelerate")


transformers = fou.lazy_import("transformers", callback=_ensure_rex_omni)

from PIL import Image as PILImage


DEFAULT_REX_OMNI_MODEL = "IDEA-Research/Rex-Omni"

# Rex-Omni was trained with this system prompt; keep it for parity with the
# reference implementation.
DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant"

# The detection prompt template used by the reference implementation. ``{}`` is
# filled with a comma-separated category list.
DETECTION_PROMPT_TEMPLATE = (
    "Detect {}. Output the bounding box coordinates in [x0, y0, x1, y1] format."
)

# Image preprocessing bounds (in pixels), expressed in units of 28x28 patches,
# matching the reference implementation's defaults.
DEFAULT_MIN_PIXELS = 16 * 28 * 28
DEFAULT_MAX_PIXELS = 2560 * 28 * 28

# Rex-Omni emits boxes as ``<|object_ref_start|>label<|object_ref_end|>``
# followed by ``<|box_start|> <x0><y0><x1><y1>, ... <|box_end|>`` where each
# coordinate is an integer token in ``[0, 999]``.
_OBJECT_PATTERN = re.compile(
    r"<\|object_ref_start\|>\s*([^<]+?)\s*<\|object_ref_end\|>"
    r"\s*<\|box_start\|>(.*?)<\|box_end\|>"
)
_COORD_PATTERN = re.compile(r"<(\d+)>")

# Coordinate tokens are quantized into this many bins; bin ``b`` maps to the
# normalized coordinate ``b / (NUM_COORD_BINS - 1)``.
NUM_COORD_BINS = 1000


class RexOmniOutputProcessor(fout.OutputProcessor):
    """Output processor for Rex-Omni detection output.

    Parses the model's coordinate-token text into
    :class:`fiftyone.core.labels.Detections`. Rex-Omni does not emit
    confidence scores, so detections have no confidence.
    """

    def __call__(self, output, frame_size, confidence_thresh=None, **kwargs):
        """Processes model output into detections.

        Args:
            output: a list of raw model output strings
            frame_size: a ``(width, height)`` tuple (unused; boxes are parsed
                directly in normalized coordinates)
            confidence_thresh: unused; Rex-Omni emits no confidence scores
            **kwargs: additional keyword arguments

        Returns:
            a list of :class:`fiftyone.core.labels.Detections` instances
        """
        return [fol.Detections(detections=self._parse(o)) for o in output]

    def _parse(self, text):
        # Drop anything after the turn terminator, then ensure the final box
        # group is closed so a generation that hit the token cap still parses.
        text = text.split("<|im_end|>")[0]
        if "<|box_start|>" in text and not text.rstrip().endswith("<|box_end|>"):
            text = text + "<|box_end|>"

        detections = []
        for label, coords_text in _OBJECT_PATTERN.findall(text):
            label = label.strip()
            # Multiple boxes for one label are comma-separated.
            for group in coords_text.split(","):
                bins = _COORD_PATTERN.findall(group)
                if len(bins) != 4:
                    continue
                x0, y0, x1, y1 = (int(b) / (NUM_COORD_BINS - 1) for b in bins)
                x0, x1 = sorted((x0, x1))
                y0, y1 = sorted((y0, y1))
                x0 = min(max(x0, 0.0), 1.0)
                y0 = min(max(y0, 0.0), 1.0)
                w = min(max(x1, 0.0), 1.0) - x0
                h = min(max(y1, 0.0), 1.0) - y0
                if w <= 0 or h <= 0:
                    continue
                detections.append(
                    fol.Detection(
                        label=label, bounding_box=[x0, y0, w, h]
                    )
                )

        return detections


class RexOmniModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for running a :class:`RexOmniModel`.

    Args:
        name_or_path ("IDEA-Research/Rex-Omni"): the HuggingFace model path
        classes (None): a list of categories to detect. If provided, they are
            inserted into the detection prompt
        prompt (None): a custom detection prompt. Overrides ``classes`` when set
        system_prompt ("You are a helpful assistant"): the system prompt
        max_new_tokens (2048): the maximum number of tokens to generate
        min_pixels (12544): the minimum image size in pixels
        max_pixels (2007040): the maximum image size in pixels
        repetition_penalty (1.05): the generation repetition penalty
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)

        self.name_or_path = self.parse_string(
            d, "name_or_path", default=DEFAULT_REX_OMNI_MODEL
        )
        self.classes = self.parse_array(d, "classes", default=None)
        self.prompt = self.parse_string(d, "prompt", default=None)
        self.system_prompt = self.parse_string(
            d, "system_prompt", default=DEFAULT_SYSTEM_PROMPT
        )
        self.max_new_tokens = self.parse_int(d, "max_new_tokens", default=2048)
        self.min_pixels = self.parse_int(
            d, "min_pixels", default=DEFAULT_MIN_PIXELS
        )
        self.max_pixels = self.parse_int(
            d, "max_pixels", default=DEFAULT_MAX_PIXELS
        )
        self.repetition_penalty = self.parse_number(
            d, "repetition_penalty", default=1.05
        )

        # Pass raw PIL images through to the processor rather than a
        # pre-transformed tensor batch.
        self.raw_inputs = True


class RexOmniModel(fout.TorchImageModel):
    """Wrapper for running `Rex-Omni
    <https://huggingface.co/IDEA-Research/Rex-Omni>`_ object detection.

    Rex-Omni is a Qwen2.5-VL-based vision-language model that performs object
    detection as next-token prediction, emitting quantized coordinate tokens
    that are decoded into bounding boxes. Prompt it with a fixed set of
    categories via ``classes``, or leave it open to detect any object.

    Detection example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset(
            "quickstart", max_samples=5, shuffle=True, seed=51
        )

        model = foz.load_zoo_model(
            "rex-omni-torch", classes=["person", "car", "dog"]
        )

        dataset.apply_model(model, label_field="rex_detections")

        session = fo.launch_app(dataset)

    Args:
        config: a :class:`RexOmniModelConfig`
    """

    def __init__(self, config):
        self._processor = None
        super().__init__(config)

    def _download_model(self, config):
        pass

    def _load_model(self, config):
        dtype = torch.bfloat16 if self._using_gpu else torch.float32

        # Honor an explicit device if requested; otherwise let HuggingFace
        # place the model. This avoids silently binding to a fixed GPU.
        device_map = None
        if self._using_gpu:
            device_map = "auto" if config.device is None else None

        model = transformers.Qwen2_5_VLForConditionalGeneration.from_pretrained(
            config.name_or_path,
            torch_dtype=dtype,
            device_map=device_map,
        )

        if device_map is None:
            model = model.to(self._device)
        model.eval()

        self._processor = transformers.AutoProcessor.from_pretrained(
            config.name_or_path,
            min_pixels=config.min_pixels,
            max_pixels=config.max_pixels,
            use_fast=False,
        )

        return model

    @property
    def media_type(self):
        return "image"

    def _get_prompt(self):
        if self.config.prompt is not None:
            return self.config.prompt

        if self.config.classes:
            categories = ", ".join(self.config.classes)
        else:
            categories = "objects"

        return DETECTION_PROMPT_TEMPLATE.format(categories)

    def _forward_pass(self, imgs):
        prompt = self._get_prompt()
        results = []

        for img in imgs:
            img = self._prepare_image(img)

            messages = [
                {"role": "system", "content": self.config.system_prompt},
                {
                    "role": "user",
                    "content": [
                        {"type": "image", "image": img},
                        {"type": "text", "text": prompt},
                    ],
                },
            ]

            text = self._processor.apply_chat_template(
                messages, tokenize=False, add_generation_prompt=True
            )
            inputs = self._processor(
                text=[text],
                images=[img],
                padding=True,
                return_tensors="pt",
            ).to(self._model.device)

            generated_ids = self._model.generate(
                **inputs,
                max_new_tokens=self.config.max_new_tokens,
                do_sample=False,
                repetition_penalty=self.config.repetition_penalty,
                pad_token_id=self._processor.tokenizer.eos_token_id,
            )

            generated_ids_trimmed = [
                out_ids[len(in_ids) :]
                for in_ids, out_ids in zip(inputs["input_ids"], generated_ids)
            ]

            # skip_special_tokens=False is required: the box markers
            # (<|object_ref_start|>, <|box_start|>, <|box_end|>) are special
            # tokens that the parser relies on.
            text_out = self._processor.batch_decode(
                generated_ids_trimmed,
                skip_special_tokens=False,
                clean_up_tokenization_spaces=False,
            )[0]

            results.append(text_out)

        return results

    def _prepare_image(self, img):
        """Convert an input image to a PIL image for the processor."""
        if isinstance(img, torch.Tensor):
            img = img.cpu().numpy()
            if img.shape[0] in (1, 3, 4) and img.shape[2] not in (1, 3, 4):
                img = np.transpose(img, (1, 2, 0))

        if isinstance(img, np.ndarray):
            if np.issubdtype(img.dtype, np.floating):
                if img.max() <= 1.0:
                    img = img * 255.0
                img = np.clip(img, 0, 255).astype(np.uint8)
            img = PILImage.fromarray(img)

        return img.convert("RGB")
