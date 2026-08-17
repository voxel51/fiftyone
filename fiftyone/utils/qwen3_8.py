"""
`Qwen3.8 <https://huggingface.co/Qwen/Qwen3.8-27B>`_ wrapper for the FiftyOne
Model Zoo.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json
import logging
import re
from typing import Any, List, Optional, Sequence, Tuple, Union

import numpy as np

import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

fou.ensure_torch()
import torch

logger = logging.getLogger(__name__)


def _ensure_qwen3_8() -> None:
    # Qwen3.8 reports model_type "qwen3_5"
    fou.ensure_package("transformers>=5.8.0")
    fou.ensure_package("accelerate")
    # 4-bit NF4 loading; the model is 55.6 GB at bf16
    fou.ensure_package("bitsandbytes")


transformers = fou.lazy_import("transformers", callback=_ensure_qwen3_8)

from PIL import Image as PILImage

# Anything fout.to_rgb_pil accepts
ImageLike = Union[str, np.ndarray, torch.Tensor, PILImage.Image]

DEFAULT_QWEN3_8_MODEL = "Qwen/Qwen3.8-27B"

_BBOX_FORMAT_INSTRUCTION = (
    "Report bbox coordinates in JSON format as a list of "
    '{"label": "<class>", "bbox_2d": [x1, y1, x2, y2]} objects, '
    "where coordinates are normalized to 0-1000 with x first."
)
DEFAULT_DETECTION_PROMPT = (
    "Detect all objects in this image. " + _BBOX_FORMAT_INSTRUCTION
)

# Thinking mode is on by default and the generation prompt opens the
# reasoning block, so generated text starts inside it and carries only the
# closing tag. The reasoning holds candidate boxes that were never
# committed, so only text after </think> is an answer.
_THINK_OPEN = "<think>"
_THINK_CLOSE = "</think>"
_THINK_BLOCK = re.compile(
    r"%s.*?%s" % (re.escape(_THINK_OPEN), re.escape(_THINK_CLOSE)),
    flags=re.DOTALL,
)

# Generations are decoded with special tokens retained so the reasoning
# boundary stays visible, which leaves the turn terminator on the answer
_TURN_ENDS = ("<|im_end|>", "<|endoftext|>")

VALID_REASONING_EFFORTS = ("low", "medium", "xhigh")


class Qwen38OutputProcessor(fout.OutputProcessor):
    """Output processor for Qwen3.8 detection models.

    Strips the model's reasoning block, then parses JSON bounding boxes into
    :class:`fiftyone.core.labels.Detections` instances.
    """

    def __call__(
        self,
        output: Sequence[str],
        frame_size: Tuple[int, int],
        confidence_thresh: Optional[float] = None,
        **kwargs: Any,
    ) -> List[fol.Detections]:
        """Processes model output into detections.

        Args:
            output: a list of raw generated strings, decoded with special
                tokens retained so the reasoning block is visible
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

    @staticmethod
    def _extract_answer(raw_output: Optional[str]) -> str:
        """Return the committed answer, or ``""`` when the model never
        closed its reasoning block.

        The generation prompt opens the reasoning block, so generated text
        begins inside it and a missing ``</think>`` means the token budget
        ran out mid-reasoning. That yields no labels: the reasoning
        rehearses candidate boxes that were never committed.
        """
        text = raw_output or ""

        if _THINK_CLOSE not in text:
            return ""

        # Keep only what follows the final closed reasoning block
        answer = _THINK_BLOCK.sub("", text).split(_THINK_CLOSE)[-1]
        return Qwen38OutputProcessor._strip_turn_ends(answer)

    @staticmethod
    def _strip_turn_ends(text: str) -> str:
        for marker in _TURN_ENDS:
            text = text.split(marker)[0]
        return text.strip()

    def _parse_detections(
        self, raw_output: str, frame_size: Tuple[int, int]
    ) -> List[fol.Detection]:
        """Parse an answer payload into Detection objects."""
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

            if not isinstance(bbox, (list, tuple)) or len(bbox) != 4:
                continue

            try:
                x1, y1, x2, y2 = (float(v) for v in bbox)
            except (TypeError, ValueError, OverflowError):
                continue

            # JSON permits NaN and Infinity literals; NaN also passes the
            # positive-area check below
            if not all(np.isfinite(v) for v in (x1, y1, x2, y2)):
                continue

            # Qwen3.8 reports bbox_2d on a 0-1000 normalized scale with x
            # first; convert to 0-1
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


class Qwen38ModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for running a :class:`Qwen38Model`.

    Args:
        name_or_path ("Qwen/Qwen3.8-27B"): the HuggingFace model path
        prompt (None): the detection prompt; if None, uses default
        classes (None): list of classes to detect; if provided, added to
            prompt
        max_new_tokens (4096): maximum tokens to generate. The model reasons
            before answering, so the budget covers both the reasoning block
            and the answer
        reasoning_effort ("low"): how long the model reasons before
            answering, one of ``"low"``, ``"medium"`` or ``"xhigh"``. The
            chat template turns this into a system instruction rather than a
            hard limit. The model's own default is ``"xhigh"``; detection
            needs no extended deliberation, and brief reasoning leaves more
            of ``max_new_tokens`` for the answer
        load_in_4bit (True): whether to load the language model with 4-bit
            NF4 quantization on GPU; the vision encoder stays bf16. The full
            bf16 weights are 55.6 GB. Set to False to load bf16 on hardware
            that can hold it
    """

    def __init__(self, d: dict) -> None:
        d = self.init(d)
        super().__init__(d)

        self.name_or_path = self.parse_string(
            d, "name_or_path", default=DEFAULT_QWEN3_8_MODEL
        )
        self.prompt = self.parse_string(d, "prompt", default=None)
        self.classes = self.parse_array(d, "classes", default=None)
        self.max_new_tokens = self.parse_int(d, "max_new_tokens", default=4096)
        self.reasoning_effort = self.parse_string(
            d, "reasoning_effort", default="low"
        )
        if self.reasoning_effort not in VALID_REASONING_EFFORTS:
            raise ValueError(
                "reasoning_effort must be one of %s; got %r"
                % (", ".join(VALID_REASONING_EFFORTS), self.reasoning_effort)
            )
        self.load_in_4bit = self.parse_bool(d, "load_in_4bit", default=True)

        # Detection is the only mode, so the processor is not optional
        if self.output_processor is None and self.output_processor_cls is None:
            self.output_processor_cls = Qwen38OutputProcessor

        self.raw_inputs = True


class Qwen38Model(fout.TorchImageModel):
    """Wrapper for running inference with Qwen3.8 models.

    Qwen3.8 is a vision-language model that detects objects by emitting
    bounding box coordinates via 2D grounding. It reasons before answering,
    and the wrapper returns only the committed answer.

    Detection example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset(
            "quickstart", max_samples=5, shuffle=True, seed=51
        )

        model = foz.load_zoo_model("qwen3.8-27b-torch")

        dataset.apply_model(model, label_field="qwen_detections")

        session = fo.launch_app(dataset)

    Detect specific classes::

        model = foz.load_zoo_model(
            "qwen3.8-27b-torch",
            classes=["person", "car", "dog"],
        )

    Args:
        config: a :class:`Qwen38ModelConfig`
    """

    def __init__(self, config: "Qwen38ModelConfig") -> None:
        self._processor = None
        super().__init__(config)

    def _download_model(self, config: "Qwen38ModelConfig") -> None:
        pass

    def _load_model(self, config: "Qwen38ModelConfig") -> torch.nn.Module:
        model_cls = transformers.AutoModelForMultimodalLM

        kwargs = {"dtype": torch.bfloat16}

        if self._using_gpu and config.load_in_4bit:
            # bitsandbytes dispatches through accelerate, so quantized loads
            # always use a device map. The vision tower stays bf16: its
            # forward casts pixels to its own weight dtype, which 4-bit
            # packing stores as uint8. Skip entries are fully qualified
            # module paths.
            kwargs["quantization_config"] = transformers.BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=torch.bfloat16,
                bnb_4bit_use_double_quant=True,
                llm_int8_skip_modules=["model.visual"],
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

    def _get_prompt(self) -> str:
        if self.config.prompt is not None:
            return self.config.prompt

        if self.config.classes is not None:
            classes_str = ", ".join(self.config.classes)
            return (
                f"Detect all instances of: {classes_str}. "
                + _BBOX_FORMAT_INSTRUCTION
            )

        return DEFAULT_DETECTION_PROMPT

    def _forward_pass(self, imgs: Sequence[Any]) -> List[str]:
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
                reasoning_effort=self.config.reasoning_effort,
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

            # Special tokens are retained so the output processor can see the
            # reasoning block boundaries
            text = self._processor.batch_decode(
                generated_ids_trimmed,
                skip_special_tokens=False,
                clean_up_tokenization_spaces=False,
            )[0]

            results.append(text)

        return results

    def _prepare_image(self, img: ImageLike) -> PILImage.Image:
        """Converts image-like input to an RGB PIL image for the processor.

        ``fout.to_rgb_pil`` reads float arrays as 0-1 and wraps anything
        above that range, so floats are scaled and clipped to uint8 first.
        """
        if isinstance(img, np.ndarray) and np.issubdtype(
            img.dtype, np.floating
        ):
            scale = 255.0 if img.max() <= 1.0 else 1.0
            img = np.clip(img * scale, 0, 255).astype(np.uint8)

        return fout.to_rgb_pil(img)
