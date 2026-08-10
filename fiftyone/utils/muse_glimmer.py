"""
`Muse Glimmer <https://huggingface.co/meta-models/Muse-Glimmer-30B>`_
wrapper for the FiftyOne Model Zoo.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json
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


def _ensure_muse_glimmer():
    fou.ensure_package("transformers>=5.15.0")
    fou.ensure_package("accelerate")
    # 4-bit NF4 loading; the model is 59.6 GB at bf16
    fou.ensure_package("bitsandbytes")


transformers = fou.lazy_import("transformers", callback=_ensure_muse_glimmer)

from PIL import Image as PILImage

DEFAULT_MUSE_GLIMMER_MODEL = "meta-models/Muse-Glimmer-30B"
DEFAULT_DETECTION_PROMPT = (
    "Detect all objects in this image. "
    "Report bbox coordinates in JSON format as a list of "
    '{"label": "<class>", "bbox_2d": [x1, y1, x2, y2]} objects, '
    "where coordinates are normalized to 0-1000 with x first."
)

# Muse Glimmer emits reasoning on a `to=self` channel closed by `<|eom|>`
# before answering on a `to=user` channel closed by `<|eot|>`. Only the
# `to=user` channel is a committed answer; the reasoning channel rehearses
# candidate outputs that must never be parsed as labels.
_CHANNEL_START = "<|start|>"
_CHANNEL_MESSAGE = "<|message|>"
_CHANNEL_ENDS = ("<|eot|>", "<|eom|>", "<|end|>")
_ANSWER_HEADER = re.compile(r"\s*assistant\s+to=user\s*$")
_REASONING_HEADER = re.compile(r"\bto=self\b")


class MuseGlimmerOutputProcessor(fout.OutputProcessor):
    """Output processor for Muse Glimmer detection models.

    Extracts the model's answer channel from its channelized output,
    then parses JSON bounding boxes into
    :class:`fiftyone.core.labels.Detections` instances.
    """

    def __call__(self, output, frame_size, confidence_thresh=None, **kwargs):
        """Processes model output into detections.

        Args:
            output: a list of raw generated strings, decoded with special
                tokens retained so channel boundaries are visible
            frame_size: a ``(width, height)`` tuple
            confidence_thresh: optional confidence threshold (unused for VLM)
            **kwargs: additional keyword arguments

        Returns:
            a list of :class:`fiftyone.core.labels.Detections` instances
        """
        results = []
        for raw_output in output:
            answer = self._extract_answer(raw_output)
            detections = self._parse_detections(answer, frame_size)
            results.append(fol.Detections(detections=detections))
        return results

    def _extract_answer(self, raw_output):
        """Return the ``to=user`` answer channel, or ``""`` when the model
        never reached one.

        The generation prompt opens the assistant turn, so the first
        generated channel may arrive without its leading ``<|start|>``;
        the text is normalized before splitting. A generation that
        truncates inside the reasoning channel yields no answer channel,
        and must yield no labels: the reasoning rehearses candidate
        boxes that were never committed.
        """
        text = raw_output or ""

        if _CHANNEL_MESSAGE not in text:
            # No channel structure at all: only safe to treat as an answer
            # when there is also no evidence of a reasoning channel
            if _REASONING_HEADER.search(text) is None:
                return self._strip_end_markers(text)
            return ""

        if not text.lstrip().startswith(_CHANNEL_START):
            # Re-attach the header the generation prompt opened
            text = _CHANNEL_START + "assistant" + text

        answer = ""
        for segment in text.split(_CHANNEL_START):
            if _CHANNEL_MESSAGE not in segment:
                continue
            header, _, body = segment.partition(_CHANNEL_MESSAGE)
            if _ANSWER_HEADER.search(header) is None:
                continue
            answer = self._strip_end_markers(body)

        return answer

    @staticmethod
    def _strip_end_markers(text):
        for marker in _CHANNEL_ENDS:
            text = text.split(marker)[0]
        return text.strip()

    def _parse_detections(self, raw_output, frame_size):
        """Parse an answer-channel payload into Detection objects."""
        detections = []

        json_str = raw_output.strip()

        if not json_str or json_str.lower() in (
            "there are none.",
            "none",
            "no objects detected",
            "[]",
        ):
            return detections

        try:
            # Model wraps JSON output in markdown code blocks
            if json_str.startswith("```json"):
                json_str = json_str[7:]
            if json_str.startswith("```"):
                json_str = json_str[3:]
            if json_str.endswith("```"):
                json_str = json_str[:-3]
            json_str = json_str.strip()

            if not (json_str.startswith("[") or json_str.startswith("{")):
                return detections

            parsed = json.loads(json_str)
            if not isinstance(parsed, list):
                parsed = [parsed]

        except (json.JSONDecodeError, ValueError) as e:
            logger.debug("Could not parse model output: %s", e)
            return detections

        for obj in parsed:
            if not isinstance(obj, dict):
                continue

            label = obj.get("label", "object")
            bbox = obj.get("bbox_2d")

            if bbox is None or len(bbox) != 4:
                continue

            x1, y1, x2, y2 = bbox
            # Muse Glimmer reports bbox_2d on a 0-1000 normalized scale
            # with x first; convert to 0-1
            x1 = float(np.clip(x1 / 1000.0, 0.0, 1.0))
            y1 = float(np.clip(y1 / 1000.0, 0.0, 1.0))
            x2 = float(np.clip(x2 / 1000.0, 0.0, 1.0))
            y2 = float(np.clip(y2 / 1000.0, 0.0, 1.0))

            w = x2 - x1
            h = y2 - y1

            if w <= 0 or h <= 0:
                continue

            detections.append(
                fol.Detection(
                    label=str(label),
                    bounding_box=[x1, y1, w, h],
                )
            )

        return detections


class MuseGlimmerModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for running a :class:`MuseGlimmerModel`.

    Args:
        name_or_path ("meta-models/Muse-Glimmer-30B"): the HuggingFace
            model path
        prompt (None): the detection prompt; if None, uses default
        classes (None): list of classes to detect; if provided, added to
            prompt
        max_new_tokens (4096): maximum tokens to generate. The model
            reasons before answering and the reasoning cannot be disabled,
            so the budget covers both channels
        load_in_4bit (True): whether to load the language model with
            4-bit NF4 quantization on GPU; the vision encoder stays
            bf16. The full bf16 weights are 59.6 GB; 4-bit loading fits
            24 GB cards. Set to False to load bf16 on hardware that can
            hold it
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)

        self.name_or_path = self.parse_string(
            d, "name_or_path", default=DEFAULT_MUSE_GLIMMER_MODEL
        )
        self.prompt = self.parse_string(d, "prompt", default=None)
        self.classes = self.parse_array(d, "classes", default=None)
        self.max_new_tokens = self.parse_int(d, "max_new_tokens", default=4096)
        self.load_in_4bit = self.parse_bool(d, "load_in_4bit", default=True)

        self.raw_inputs = True


class MuseGlimmerModel(fout.TorchImageModel):
    """Wrapper for running inference with Muse Glimmer models.

    Muse Glimmer is an agentic vision-language model that detects objects
    by emitting bounding box coordinates via 2D grounding.

    Detection example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset(
            "quickstart", max_samples=5, shuffle=True, seed=51
        )

        model = foz.load_zoo_model("muse-glimmer-30b-torch")

        dataset.apply_model(model, label_field="glimmer_detections")

        session = fo.launch_app(dataset)

    Detect specific classes::

        model = foz.load_zoo_model(
            "muse-glimmer-30b-torch",
            classes=["person", "car", "dog"],
        )

    Args:
        config: a :class:`MuseGlimmerModelConfig`
    """

    def __init__(self, config):
        self._processor = None
        super().__init__(config)

    def _download_model(self, config):
        pass

    def _load_model(self, config):
        model_cls = transformers.AutoModelForMultimodalLM

        kwargs = {"torch_dtype": torch.bfloat16}

        if self._using_gpu and config.load_in_4bit:
            # bitsandbytes dispatches through accelerate, so quantized
            # loads always use a device map. The vision tower stays bf16:
            # its forward casts pixels to its own weight dtype, which 4-bit
            # packing stores as uint8. The skip entry must be the fully
            # qualified module path from the model root
            kwargs["quantization_config"] = transformers.BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=torch.bfloat16,
                bnb_4bit_use_double_quant=True,
                llm_int8_skip_modules=["model.vision_tower"],
            )
            kwargs["device_map"] = (
                "auto" if config.device is None else {"": config.device}
            )
        elif self._using_gpu:
            kwargs["device_map"] = "auto" if config.device is None else None

        model = model_cls.from_pretrained(config.name_or_path, **kwargs)

        if kwargs.get("device_map") is None and self._using_gpu:
            model = model.to(self._device)
        model.eval()

        self._processor = transformers.AutoProcessor.from_pretrained(
            config.name_or_path
        )

        return model

    def _get_prompt(self):
        if self.config.prompt is not None:
            return self.config.prompt

        if self.config.classes is not None:
            classes_str = ", ".join(self.config.classes)
            return (
                f"Detect all instances of: {classes_str}. "
                "Report bbox coordinates in JSON format as a list of "
                '{"label": "<class>", "bbox_2d": [x1, y1, x2, y2]} objects, '
                "where coordinates are normalized to 0-1000 with x first."
            )

        return DEFAULT_DETECTION_PROMPT

    def _forward_pass(self, imgs):
        prompt = self._get_prompt()
        results = []

        for img in imgs:
            img = self._prepare_image(img)

            messages = [
                {
                    "role": "user",
                    "content": [
                        {"type": "image", "image": img},
                        {"type": "text", "text": prompt},
                    ],
                }
            ]

            inputs = self._processor.apply_chat_template(
                messages,
                tokenize=True,
                add_generation_prompt=True,
                return_dict=True,
                return_tensors="pt",
            )
            inputs = inputs.to(self._model.device)

            generated_ids = self._model.generate(
                **inputs,
                max_new_tokens=self.config.max_new_tokens,
                do_sample=False,
            )

            generated_ids_trimmed = [
                out_ids[len(in_ids) :]
                for in_ids, out_ids in zip(inputs["input_ids"], generated_ids)
            ]

            # Special tokens are retained so the output processor can see
            # the channel boundaries separating reasoning from the answer
            text = self._processor.batch_decode(
                generated_ids_trimmed,
                skip_special_tokens=False,
                clean_up_tokenization_spaces=False,
            )[0]

            results.append(text)

        return results

    def _prepare_image(self, img):
        """Convert image to PIL format for processor."""
        if isinstance(img, torch.Tensor):
            img = img.cpu().numpy()
            # Transpose CHW to HWC if first dim is channels and last dim is not
            if img.shape[0] in (1, 3, 4) and img.shape[2] not in (1, 3, 4):
                img = np.transpose(img, (1, 2, 0))

        if isinstance(img, np.ndarray) and np.issubdtype(
            img.dtype, np.floating
        ):
            if img.max() <= 1.0:
                img = img * 255.0
            img = np.clip(img, 0, 255).astype(np.uint8)

        if isinstance(img, np.ndarray):
            img = PILImage.fromarray(img)

        return img
