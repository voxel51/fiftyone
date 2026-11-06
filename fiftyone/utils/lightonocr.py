"""
`LightOnOCR-3 <https://huggingface.co/lightonai/LightOnOCR-3-4B>`_ wrapper for
the FiftyOne Model Zoo.

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


def _ensure_transformers():
    """Ensures the package that loads the checkpoints is installed."""
    fou.ensure_package("transformers>=5.17")


transformers = fou.lazy_import("transformers", callback=_ensure_transformers)

DEFAULT_LIGHTONOCR_MODEL = "lightonai/LightOnOCR-3-4B"

# The two prompts the models were trained with: "grounding" returns every
# block of the page with its label and box, and the empty prompt returns the
# page's text as markdown
MODES = {"grounding": "grounding", "transcription": ""}

_IMAGE_TOKEN = "<|image_pad|>"

# Grounding output gives coordinates normalized to 0-1000
_COORD_SCALE = 1000.0

# Each block opens with ``![label](x1,y1,x2,y2)`` at the start of a line, and
# a label ending in ``+`` continues the block before it
_NUMBER = r"\s*(-?\d+(?:\.\d+)?)\s*"
_BLOCK = re.compile(
    r"^!\[([A-Za-z_]+)(\+?)\]\(%s,%s,%s,%s\)" % ((_NUMBER,) * 4),
    re.MULTILINE,
)


def _parse_blocks(text):
    """Parses grounding output into blocks.

    Args:
        text: the decoded output of a grounding prompt

    Returns:
        a list of dicts with the block's ``label``, whether it is a
        ``continuation``, its ``[x, y, w, h]`` ``box`` relative to the image
        and its ``text``, in reading order; blocks whose box is empty after
        clipping to the image are skipped
    """
    blocks = []
    matches = list(_BLOCK.finditer(text))
    for i, match in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        x1, y1, x2, y2 = (
            float(v) / _COORD_SCALE for v in match.group(3, 4, 5, 6)
        )
        x0, xf = max(min(x1, x2), 0.0), min(max(x1, x2), 1.0)
        y0, yf = max(min(y1, y2), 0.0), min(max(y1, y2), 1.0)
        if xf <= x0 or yf <= y0:
            continue

        blocks.append(
            {
                "label": match.group(1),
                "continuation": bool(match.group(2)),
                "box": [x0, y0, xf - x0, yf - y0],
                "text": text[match.end() : end].strip(),
            }
        )

    return blocks


def _prepare_image(img):
    """Converts image-like input to an RGB PIL image.

    ``fout.to_rgb_pil`` expects channel-last layout and reads float arrays as
    0-1, wrapping anything above it, so tensors are converted and
    channel-first or 0-255 float input is normalized first.
    """
    if isinstance(img, torch.Tensor):
        img = img.detach().cpu().numpy()

    if isinstance(img, np.ndarray):
        # Transpose CHW to HWC when the first dim is channels and the last
        # cannot be
        if (
            img.ndim == 3
            and img.shape[0] in (1, 3, 4)
            and img.shape[2] not in (1, 3, 4)
        ):
            img = np.transpose(img, (1, 2, 0))

        if np.issubdtype(img.dtype, np.floating):
            scale = 255.0 if img.max() <= 1.0 else 1.0
            img = np.clip(img * scale, 0, 255).astype(np.uint8)

    return fout.to_rgb_pil(img)


class LightOnOCRGetItem(fout.GetItem):
    """A :class:`fiftyone.utils.torch.GetItem` that loads an image and
    encodes it with the model's prompt.

    Data loader workers call it, so image decoding, resizing and patching run
    in parallel with inference. Images whose longest side exceeds
    ``max_image_size`` are scaled down to it, keeping their aspect ratio, and
    the prompt holds as many image tokens as the image has patches after
    merging.

    Args:
        image_processor: the checkpoint's image processor
        prompt_ids: the token IDs of the prompt, holding one image token
        image_token_id: the ID of the image token
        max_image_size (2048): the longest side, in pixels, an image is
            scaled down to
        field_mapping (None): the user-supplied dict mapping keys in
            :attr:`required_keys` to field names of their dataset that
            contain the required values
    """

    def __init__(
        self,
        image_processor,
        prompt_ids,
        image_token_id,
        max_image_size=2048,
        field_mapping=None,
        **kwargs,
    ):
        """Stores the processor and prompt that encode each image."""
        self.image_processor = image_processor
        self.prompt_ids = prompt_ids
        self.image_token_id = image_token_id
        self.max_image_size = max_image_size
        super().__init__(field_mapping=field_mapping, **kwargs)

    @property
    def required_keys(self):
        """The sample fields each item needs: ``["filepath"]``."""
        return ["filepath"]

    def __call__(self, d):
        """Encodes the image at the sample's filepath.

        Args:
            d: a dict mapping :attr:`required_keys` to sample values

        Returns:
            the encoded image, as returned by :meth:`encode`
        """
        return self.encode(d["filepath"])

    def encode(self, img):
        """Encodes an image with the prompt.

        Args:
            img: an image path, PIL image, numpy array or Torch tensor

        Returns:
            a dict with the prompt's ``input_ids`` and the image's
            ``pixel_values`` and ``image_grid_thw``
        """
        img = _prepare_image(img)
        if max(img.size) > self.max_image_size:
            img.thumbnail((self.max_image_size, self.max_image_size))

        inputs = self.image_processor(images=[img], return_tensors="pt")
        grid = inputs["image_grid_thw"]
        tokens = int(grid.prod()) // self.image_processor.merge_size**2

        ids = self.prompt_ids
        slot = ids.index(self.image_token_id)
        row = ids[:slot] + [self.image_token_id] * tokens + ids[slot + 1 :]

        return {
            "input_ids": torch.tensor(row, dtype=torch.long),
            "pixel_values": inputs["pixel_values"],
            "image_grid_thw": grid,
        }


class _LightOnOCRCollate(object):
    """Pads encoded images' prompts on the left into one batch and
    concatenates their patches.

    Args:
        pad_token_id: the ID of the tokenizer's padding token
        image_token_id: the ID of the image token
    """

    def __init__(self, pad_token_id, image_token_id):
        """Stores the token IDs that padding and the image tokens use."""
        self.pad_token_id = pad_token_id
        self.image_token_id = image_token_id

    def __call__(self, items):
        """Pads the encoded images into one batch.

        Generation continues every row from its last position, which left
        padding keeps at the end of each prompt.

        Args:
            items: a list of encoded images, as returned by
                :meth:`LightOnOCRGetItem.encode`

        Returns:
            a dict with the left-padded ``input_ids``, ``attention_mask`` and
            ``mm_token_type_ids``, and the images' ``pixel_values`` and
            ``image_grid_thw``
        """
        rows = [item["input_ids"] for item in items]
        width = max(len(ids) for ids in rows)
        input_ids = torch.full(
            (len(rows), width), self.pad_token_id, dtype=torch.long
        )
        attention_mask = torch.zeros((len(rows), width), dtype=torch.long)
        for i, ids in enumerate(rows):
            input_ids[i, width - len(ids) :] = ids
            attention_mask[i, width - len(ids) :] = 1

        return {
            "input_ids": input_ids,
            "attention_mask": attention_mask,
            "mm_token_type_ids": (input_ids == self.image_token_id).long(),
            "pixel_values": torch.cat(
                [item["pixel_values"] for item in items]
            ),
            "image_grid_thw": torch.cat(
                [item["image_grid_thw"] for item in items]
            ),
        }


class LightOnOCROutputProcessor(fout.OutputProcessor):
    """Converts LightOnOCR-3's decoded output into labels.

    A grounding output becomes a :class:`fiftyone.core.labels.Detections`
    with one detection per block, in reading order: its ``label`` is the
    block type, such as ``"text"``, ``"title"``, ``"table"`` or
    ``"image"``, and its ``text`` attribute the block's content, which is
    markdown for text, HTML for tables and charts and a short description for
    images. A block whose label carries the model's ``+`` suffix continues
    the block before it and has ``continuation=True``. A transcription
    output becomes a :class:`fiftyone.core.labels.Classification` whose
    ``label`` is the page's markdown.
    """

    def __call__(self, output, frame_size, mode="grounding", **kwargs):
        """Converts a batch of decoded outputs into labels.

        Args:
            output: a list of decoded output strings
            frame_size: unused; boxes are relative to the image
            mode ("grounding"): the prompt mode the outputs were generated
                with, ``"grounding"`` or ``"transcription"``

        Returns:
            a list of :class:`fiftyone.core.labels.Detections` in grounding
            mode, or of :class:`fiftyone.core.labels.Classification` or None
            for an empty page in transcription mode
        """
        if mode == "transcription":
            return [fol.Classification(label=t) if t else None for t in output]

        return [
            fol.Detections(
                detections=[
                    fol.Detection(
                        label=block["label"],
                        bounding_box=block["box"],
                        text=block["text"],
                        continuation=block["continuation"],
                    )
                    for block in _parse_blocks(text)
                ]
            )
            for text in output
        ]


class LightOnOCRModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for running a :class:`LightOnOCRModel`.

    Args:
        name_or_path ("lightonai/LightOnOCR-3-4B"): the HuggingFace repository
            or local directory of a LightOnOCR-3 checkpoint with the Qwen3.5
            architecture
        revision (None): the commit hash, branch or tag of the repository to
            load
        mode ("grounding"): ``"grounding"``, which returns every block of the
            page with its label and box, or ``"transcription"``, which returns
            the page's text as markdown
        max_image_size (2048): the longest side, in pixels, images are scaled
            down to
        max_new_tokens (4096): the most tokens generated per image
        temperature (0.0): the sampling temperature; 0 decodes greedily, and
            the model card samples at 0.2
        top_p (0.9): the nucleus sampling threshold when sampling
    """

    def __init__(self, d):
        """Parses the config, rejecting unknown modes and limits below
        one."""
        d = self.init(d)
        super().__init__(d)

        self.name_or_path = self.parse_string(
            d, "name_or_path", default=DEFAULT_LIGHTONOCR_MODEL
        )
        self.revision = self.parse_string(d, "revision", default=None)
        self.mode = self.parse_string(d, "mode", default="grounding")
        self.max_image_size = self.parse_int(d, "max_image_size", default=2048)
        self.max_new_tokens = self.parse_int(d, "max_new_tokens", default=4096)
        self.temperature = self.parse_number(d, "temperature", default=0.0)
        self.top_p = self.parse_number(d, "top_p", default=0.9)

        if self.mode not in MODES:
            raise ValueError(
                "mode must be one of %s; got %r" % (sorted(MODES), self.mode)
            )

        if self.max_image_size < 1 or self.max_new_tokens < 1:
            raise ValueError(
                "max_image_size and max_new_tokens must be at least 1"
            )

        if self.temperature < 0 or not 0 < self.top_p <= 1:
            raise ValueError(
                "Need temperature >= 0 and 0 < top_p <= 1; got %s and %s"
                % (self.temperature, self.top_p)
            )

        if self.output_processor is None and self.output_processor_cls is None:
            self.output_processor_cls = LightOnOCROutputProcessor

        self.raw_inputs = True


class LightOnOCRModel(fout.TorchImageModel):
    """Wrapper for running `LightOnOCR-3
    <https://huggingface.co/lightonai/LightOnOCR-3-4B>`_ document OCR.

    LightOnOCR-3 reads a page image end to end. With the ``grounding`` prompt
    it returns every block of the page in reading order, each with its type
    and bounding box: text and titles with their transcription, tables and
    charts as HTML tables and images with a short description. This wrapper
    returns those blocks as :class:`fiftyone.core.labels.Detections`, or with
    ``mode="transcription"`` the page's markdown as a
    :class:`fiftyone.core.labels.Classification`.

    Inference is split across FiftyOne's data loading hooks:
    :class:`LightOnOCRGetItem` loads, resizes and patches each image in the
    data loader's workers, :attr:`collate_fn` pads the prompts into a batch,
    the batch is generated together, and :class:`LightOnOCROutputProcessor`
    parses each output.

    Example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = fo.Dataset.from_images_dir("/path/to/page/images")

        model = foz.load_zoo_model("lightonocr-3-4b-torch")

        dataset.apply_model(model, label_field="ocr", batch_size=4)

        session = fo.launch_app(dataset)

    Args:
        config: a :class:`LightOnOCRModelConfig`
    """

    def __init__(self, config):
        """Loads the checkpoint and builds the prompt."""
        self._processor = None
        self._prompt_ids = None
        self._image_token_id = None
        super().__init__(config)

    @property
    def media_type(self):
        """The media type processed by the model: ``"image"``."""
        return "image"

    @property
    def ragged_batches(self):
        """False; :attr:`collate_fn` pads prompts of different lengths."""
        return False

    @property
    def has_collate_fn(self):
        """True; the model pads its own batches."""
        return True

    @property
    def collate_fn(self):
        """The function that pads encoded images into one batch."""
        return _LightOnOCRCollate(
            self._processor.tokenizer.pad_token_id, self._image_token_id
        )

    def build_get_item(self, field_mapping=None):
        """Builds the :class:`LightOnOCRGetItem` that encodes each image with
        this model's prompt.

        Args:
            field_mapping (None): a dict mapping the GetItem's required keys
                to field names of the dataset

        Returns:
            a :class:`LightOnOCRGetItem`
        """
        return LightOnOCRGetItem(
            self._processor.image_processor,
            self._prompt_ids,
            self._image_token_id,
            max_image_size=self.config.max_image_size,
            field_mapping=field_mapping,
        )

    def _download_model(self, config):
        """Leaves the download to :meth:`_load_model`."""
        pass

    def _load_model(self, config):
        """Loads the checkpoint and its processor and renders the prompt with
        the checkpoint's chat template, thinking off as the models were
        trained.

        Args:
            config: a :class:`LightOnOCRModelConfig`

        Returns:
            the model
        """
        self._processor = transformers.AutoProcessor.from_pretrained(
            config.name_or_path, revision=config.revision
        )

        dtype = torch.bfloat16 if self._using_gpu else torch.float32
        model = transformers.AutoModelForImageTextToText.from_pretrained(
            config.name_or_path, revision=config.revision, dtype=dtype
        )
        model = model.to(self._device)
        model.eval()

        content = [{"type": "image"}]
        prompt = MODES[config.mode]
        if prompt:
            content.append({"type": "text", "text": prompt})

        text = self._processor.apply_chat_template(
            [{"role": "user", "content": content}],
            add_generation_prompt=True,
            tokenize=False,
            enable_thinking=False,
        )
        tokenizer = self._processor.tokenizer
        self._image_token_id = tokenizer.convert_tokens_to_ids(_IMAGE_TOKEN)
        self._prompt_ids = tokenizer(text, add_special_tokens=False)[
            "input_ids"
        ]
        if self._prompt_ids.count(self._image_token_id) != 1:
            raise ValueError(
                "The chat template of %s does not place one image in the "
                "prompt" % config.name_or_path
            )

        return model

    def _predict_all(self, imgs):
        """Reads a batch of images.

        Args:
            imgs: a list of images, or a batch that :attr:`collate_fn` padded
                when preprocessing is off

        Returns:
            a list of labels
        """
        if self._preprocess:
            # Images given directly rather than through a data loader are
            # encoded and padded here
            encode = self.build_get_item().encode
            imgs = self.collate_fn([encode(img) for img in imgs])

        batch = {k: v.to(self._device) for k, v in imgs.items()}
        output = self._forward_pass(batch)
        return self._output_processor(output, None, mode=self.config.mode)

    def _forward_pass(self, batch):
        """Generates every image's output.

        Args:
            batch: a padded batch on the model's device

        Returns:
            a list of decoded output strings
        """
        config = self.config
        sampling = {"do_sample": False}
        if config.temperature > 0:
            sampling = {
                "do_sample": True,
                "temperature": config.temperature,
                "top_p": config.top_p,
            }

        tokenizer = self._processor.tokenizer
        with torch.inference_mode():
            output_ids = self._model.generate(
                **batch,
                max_new_tokens=config.max_new_tokens,
                use_cache=True,
                pad_token_id=tokenizer.pad_token_id,
                **sampling,
            )

        generated = output_ids[:, batch["input_ids"].shape[1] :]
        return [
            text.strip()
            for text in tokenizer.batch_decode(
                generated, skip_special_tokens=True
            )
        ]
