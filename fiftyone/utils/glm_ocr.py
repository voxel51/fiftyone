"""
`GLM-OCR <https://huggingface.co/zai-org/GLM-OCR>`_ wrapper for the FiftyOne
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

# GLM-OCR is native to transformers as ``AutoModelForImageTextToText``; the
# ``glm_ocr`` model type first ships in 5.14.
_MIN_TRANSFORMERS = "transformers>=5.14"

DEFAULT_GLM_OCR_MODEL = "zai-org/GLM-OCR"

# GLM-OCR is prompt-driven; each recognition task has a fixed prompt.
_TASK_PROMPTS = {
    "text": "Text Recognition:",
    "formula": "Formula Recognition:",
    "table": "Table Recognition:",
}


def _ensure_glm_ocr():
    fou.ensure_package(_MIN_TRANSFORMERS)


transformers = fou.lazy_import("transformers", callback=_ensure_glm_ocr)

from PIL import Image as PILImage


def _to_pil(img):
    """Converts a raw model input (PIL image, HWC numpy array, or CHW torch
    tensor) to an RGB PIL image, the form GLM-OCR's processor consumes."""
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
    return PILImage.fromarray(img)


def _select_dtype(device):
    """bfloat16 is a CUDA optimization; CPU inference wants float32."""
    return torch.bfloat16 if "cuda" in str(device) else torch.float32


class GLMOCRModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for running a :class:`GLMOCRModel`.

    Args:
        name_or_path ("zai-org/GLM-OCR"): the HuggingFace model to load
        task ("text"): the recognition task. One of ``"text"``, ``"formula"``,
            ``"table"``. Ignored when ``prompt`` is set
        prompt (None): an explicit prompt to use instead of the ``task``
            prompt, e.g. a JSON schema for structured information extraction
        max_new_tokens (8192): the maximum number of tokens to generate
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)

        self.name_or_path = self.parse_string(
            d, "name_or_path", default=DEFAULT_GLM_OCR_MODEL
        )
        self.task = self.parse_string(d, "task", default="text")
        if self.task not in _TASK_PROMPTS:
            raise ValueError(
                "Unsupported task '%s'. Supported tasks are: %s"
                % (self.task, ", ".join(_TASK_PROMPTS))
            )
        self.prompt = self.parse_string(d, "prompt", default=None)
        self.max_new_tokens = self.parse_int(d, "max_new_tokens", default=8192)

        # GLM-OCR consumes the raw image via its own processor
        self.raw_inputs = True


class GLMOCRModel(fout.TorchImageModel):
    """FiftyOne wrapper for `GLM-OCR <https://huggingface.co/zai-org/GLM-OCR>`_.

    GLM-OCR is a 0.9B vision-language OCR model that transcribes a document
    image into text. It recognizes content without geometry, so this wrapper
    returns a :class:`fiftyone.core.labels.Classification` per image whose
    ``label`` is the recognized text (markdown for the ``"text"`` task, LaTeX
    for ``"formula"``, HTML for ``"table"``). Set ``prompt`` to a JSON schema
    to run structured information extraction instead.

    Example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart", max_samples=5)

        model = foz.load_zoo_model("glm-ocr-torch")
        dataset.apply_model(model, label_field="ocr")

        session = fo.launch_app(dataset)

    Args:
        config: a :class:`GLMOCRModelConfig`
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
        prompt = self.config.prompt or _TASK_PROMPTS[self.config.task]
        results = []
        for img in imgs:
            try:
                pil = _to_pil(img)
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
                ).to(self._device)
                inputs.pop("token_type_ids", None)
                with torch.inference_mode():
                    out = self._model.generate(
                        **inputs, max_new_tokens=self.config.max_new_tokens
                    )
                text = self._processor.decode(
                    out[0][inputs["input_ids"].shape[1] :],
                    skip_special_tokens=True,
                ).strip()
            except Exception as e:  # per-image guard
                logger.warning("GLM-OCR failed on an image: %s", e)
                results.append(None)
                continue

            results.append(fol.Classification(label=text) if text else None)

        return results
