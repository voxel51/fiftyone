"""
`Qwen3-VL <https://huggingface.co/collections/Qwen/qwen3-vl>`_
wrapper for the FiftyOne Model Zoo.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json
import logging

import numpy as np

import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

fou.ensure_torch()
import torch

logger = logging.getLogger(__name__)


def _ensure_qwen3_vl():
    fou.ensure_package("transformers>=4.51.0")
    fou.ensure_package("accelerate")
    fou.ensure_package("qwen-vl-utils")


transformers = fou.lazy_import("transformers", callback=_ensure_qwen3_vl)


DEFAULT_QWEN3_VL_MODEL = "Qwen/Qwen3-VL-2B-Instruct"
DEFAULT_DETECTION_PROMPT = (
    "Detect all objects in this image. "
    "Report bbox coordinates in JSON format as a list of "
    '{"label": "<class>", "bbox_2d": [x1, y1, x2, y2]} objects.'
)


class Qwen3VLOutputProcessor(fout.OutputProcessor):
    """Output processor for Qwen3-VL detection models.

    Parses JSON bounding box output and converts to
    :class:`fiftyone.core.labels.Detections` instances.
    """

    def __call__(self, output, frame_size, confidence_thresh=None, **kwargs):
        """Processes model output into detections.

        Args:
            output: a list of raw model output strings (JSON with bbox_2d)
            frame_size: a ``(width, height)`` tuple
            confidence_thresh: optional confidence threshold (unused for VLM)
            **kwargs: additional keyword arguments

        Returns:
            a list of :class:`fiftyone.core.labels.Detections` instances
        """
        results = []
        for raw_output in output:
            detections = self._parse_detections(raw_output, frame_size)
            results.append(fol.Detections(detections=detections))
        return results

    def _parse_detections(self, raw_output, frame_size):
        """Parse raw model output into Detection objects."""
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


class Qwen3VLModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for running a :class:`Qwen3VLModel`.

    Args:
        name_or_path ("Qwen/Qwen3-VL-2B-Instruct"): the HuggingFace model path
        prompt (None): the detection prompt; if None, uses default
        classes (None): list of classes to detect; if provided, added to prompt
        max_new_tokens (4096): maximum tokens to generate
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)

        self.name_or_path = self.parse_string(
            d, "name_or_path", default=DEFAULT_QWEN3_VL_MODEL
        )
        self.prompt = self.parse_string(d, "prompt", default=None)
        self.classes = self.parse_array(d, "classes", default=None)
        self.max_new_tokens = self.parse_int(d, "max_new_tokens", default=4096)

        self.raw_inputs = True

        if self.output_processor_cls is None:
            self.output_processor_cls = (
                "fiftyone.utils.qwen3_vl.Qwen3VLOutputProcessor"
            )


class Qwen3VLModel(fout.TorchImageModel):
    """Wrapper for running inference with Qwen3-VL for object detection.

    Qwen3-VL is a vision-language model with 2D grounding capabilities
    that can detect objects and return bounding box coordinates.

    Example usage::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset(
            "quickstart", max_samples=5, shuffle=True, seed=51
        )

        model = foz.load_zoo_model("qwen3-vl-2b-instruct-torch")

        dataset.apply_model(model, label_field="qwen_detections")

        session = fo.launch_app(dataset)

    Detect specific classes::

        model = foz.load_zoo_model(
            "qwen3-vl-2b-instruct-torch",
            classes=["person", "car", "dog"],
        )

    Args:
        config: a :class:`Qwen3VLModelConfig`
    """

    def __init__(self, config):
        self._processor = None
        super().__init__(config)

    def _download_model(self, config):
        pass

    def _load_model(self, config):
        model_cls = transformers.Qwen3VLForConditionalGeneration
        dtype = torch.bfloat16 if self._using_gpu else torch.float32

        model = model_cls.from_pretrained(
            config.name_or_path,
            torch_dtype=dtype,
            device_map="auto" if self._using_gpu else None,
        )
        model.eval()

        self._processor = transformers.AutoProcessor.from_pretrained(
            config.name_or_path
        )

        return model

    @property
    def media_type(self):
        return "image"

    def _get_prompt(self):
        if self.config.prompt is not None:
            return self.config.prompt

        if self.config.classes is not None:
            classes_str = ", ".join(self.config.classes)
            return (
                f"Detect all instances of: {classes_str}. "
                "Report bbox coordinates in JSON format as a list of "
                '{"label": "<class>", "bbox_2d": [x1, y1, x2, y2]} objects.'
            )

        return DEFAULT_DETECTION_PROMPT

    def _forward_pass(self, imgs):
        from PIL import Image as PILImage

        prompt = self._get_prompt()
        results = []

        for img in imgs:
            if isinstance(img, torch.Tensor):
                img = img.cpu().numpy()
                if img.shape[0] in (1, 3, 4):
                    img = np.transpose(img, (1, 2, 0))

            if isinstance(img, np.ndarray) and np.issubdtype(img.dtype, np.floating):
                if img.max() <= 1.0:
                    img = img * 255.0
                img = np.clip(img, 0, 255).astype(np.uint8)

            if isinstance(img, np.ndarray):
                img = PILImage.fromarray(img)

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
                out_ids[len(in_ids):]
                for in_ids, out_ids in zip(inputs["input_ids"], generated_ids)
            ]

            text = self._processor.batch_decode(
                generated_ids_trimmed,
                skip_special_tokens=True,
                clean_up_tokenization_spaces=False,
            )[0]

            results.append(text)

        return results
