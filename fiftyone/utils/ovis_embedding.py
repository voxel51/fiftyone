"""
`Ovis-VL-Embedding <https://huggingface.co/ATH-MaaS/Ovis-VL-Embedding-2B>`_
wrapper for the FiftyOne Model Zoo.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
import math

import numpy as np
from PIL import Image

import fiftyone.core.models as fom
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

DEFAULT_OVIS_EMBEDDING_MODEL = "ATH-MaaS/Ovis-VL-Embedding-2B"
DEFAULT_INSTRUCTION = "Represent the user's input."

# The instruction the training data pairs with text queries for images
DEFAULT_PROMPT_INSTRUCTION = (
    "Find me an everyday image that matches the given caption:"
)

# The repositories keep the checkpoint and its processor in this folder
_SUBFOLDER = "model"

_IMAGE_TEXT = "<|vision_start|><|image_pad|><|vision_end|>"
_IMAGE_TOKEN = "<|image_pad|>"

# ms-swift resizes images to between 4 and 1,800 visual tokens before the
# processor patches them, and refuses more extreme aspect ratios
_MIN_IMAGE_TOKENS = 4
_MAX_IMAGE_TOKENS = 1800
_MAX_ASPECT_RATIO = 200


def _render(instruction, content):
    """Renders one input as the checkpoints were trained to read it.

    This is ms-swift's ``qwen3_5_emb`` template: the instruction as the
    system turn and the input as the user turn, both stripped, then an empty
    non-thinking answer and the end-of-text token, whose final hidden state
    is the embedding.

    Args:
        instruction: the instruction
        content: the text of the user turn

    Returns:
        the rendered text
    """
    return (
        "<|im_start|>system\n"
        + instruction.strip()
        + "<|im_end|>\n<|im_start|>user\n"
        + content.strip()
        + "<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n"
        + "<|endoftext|>"
    )


def _smart_resize(height, width, factor, min_pixels, max_pixels):
    """The size an image is resized to before it is patched.

    Each side is rounded to a multiple of ``factor`` and the area is then
    scaled into ``[min_pixels, max_pixels]``, keeping the aspect ratio, as
    ``qwen_vl_utils`` does for ms-swift.

    Args:
        height: the image's height
        width: the image's width
        factor: the side of the square of pixels one visual token covers
        min_pixels: the smallest area
        max_pixels: the largest area

    Returns:
        a ``(height, width)`` tuple

    Raises:
        ValueError: if the image's aspect ratio exceeds 200
    """
    if max(height, width) > _MAX_ASPECT_RATIO * min(height, width):
        raise ValueError(
            "An image of %dx%d pixels has an aspect ratio above %d"
            % (width, height, _MAX_ASPECT_RATIO)
        )

    h = max(factor, round(height / factor) * factor)
    w = max(factor, round(width / factor) * factor)
    if h * w > max_pixels:
        beta = math.sqrt(height * width / max_pixels)
        h = math.floor(height / beta / factor) * factor
        w = math.floor(width / beta / factor) * factor
    elif h * w < min_pixels:
        beta = math.sqrt(min_pixels / (height * width))
        h = math.ceil(height * beta / factor) * factor
        w = math.ceil(width * beta / factor) * factor

    return h, w


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


def _pad_left(rows, pad_token_id):
    """Pads token rows on the left into one batch.

    The embedding is read at the last position, which left padding keeps at
    each row's end-of-text token.

    Args:
        rows: a list of 1D tensors of token IDs
        pad_token_id: the ID to pad with

    Returns:
        a tuple of ``input_ids`` and ``attention_mask``
    """
    width = max(len(ids) for ids in rows)
    input_ids = torch.full((len(rows), width), pad_token_id, dtype=torch.long)
    attention_mask = torch.zeros((len(rows), width), dtype=torch.long)
    for i, ids in enumerate(rows):
        input_ids[i, width - len(ids) :] = ids
        attention_mask[i, width - len(ids) :] = 1

    return input_ids, attention_mask


class OvisEmbeddingGetItem(fout.GetItem):
    """A :class:`fiftyone.utils.torch.GetItem` that loads an image and
    encodes it with the model's image prompt.

    Data loader workers call it, so image decoding, resizing and patching run
    in parallel with inference. The image is resized as ms-swift resizes it,
    and the prompt holds as many image tokens as the image has patches after
    merging.

    Args:
        image_processor: the checkpoint's image processor
        prompt_ids: the token IDs of the image prompt, holding one image token
        image_token_id: the ID of the image token
        min_pixels: the smallest area an image is resized to
        max_pixels: the largest area an image is resized to
        field_mapping (None): the user-supplied dict mapping keys in
            :attr:`required_keys` to field names of their dataset that
            contain the required values
    """

    def __init__(
        self,
        image_processor,
        prompt_ids,
        image_token_id,
        min_pixels,
        max_pixels,
        field_mapping=None,
        **kwargs,
    ):
        """Stores the processor and prompt that encode each image."""
        self.image_processor = image_processor
        self.prompt_ids = prompt_ids
        self.image_token_id = image_token_id
        self.min_pixels = min_pixels
        self.max_pixels = max_pixels
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
        """Encodes an image with the image prompt.

        Args:
            img: an image path, PIL image, numpy array or Torch tensor

        Returns:
            a dict with the prompt's ``input_ids`` and the image's
            ``pixel_values`` and ``image_grid_thw``
        """
        img = _prepare_image(img)
        processor = self.image_processor
        factor = processor.patch_size * processor.merge_size
        height, width = _smart_resize(
            img.height, img.width, factor, self.min_pixels, self.max_pixels
        )
        img = img.resize((width, height), Image.BICUBIC)

        inputs = processor(images=[img], do_resize=False, return_tensors="pt")
        grid = inputs["image_grid_thw"]
        tokens = int(grid.prod()) // processor.merge_size**2

        ids = self.prompt_ids
        slot = ids.index(self.image_token_id)
        row = ids[:slot] + [self.image_token_id] * tokens + ids[slot + 1 :]

        return {
            "input_ids": torch.tensor(row, dtype=torch.long),
            "pixel_values": inputs["pixel_values"],
            "image_grid_thw": grid,
        }


class _OvisEmbeddingCollate(object):
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

        Args:
            items: a list of encoded images, as returned by
                :meth:`OvisEmbeddingGetItem.encode`

        Returns:
            a dict with the left-padded ``input_ids``, ``attention_mask`` and
            ``mm_token_type_ids``, and the images' ``pixel_values`` and
            ``image_grid_thw``
        """
        input_ids, attention_mask = _pad_left(
            [item["input_ids"] for item in items], self.pad_token_id
        )
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


class OvisEmbeddingModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for running an :class:`OvisEmbeddingModel`.

    Args:
        name_or_path ("ATH-MaaS/Ovis-VL-Embedding-2B"): the HuggingFace
            repository or local directory of an Ovis-VL-Embedding checkpoint
        revision (None): the commit hash, branch or tag of the repository to
            load
        subfolder ("model"): the folder of the repository that holds the
            checkpoint and its processor
        instruction ("Represent the user's input."): the instruction given
            with every image
        prompt_instruction ("Find me an everyday image that matches the given
            caption:"): the instruction given with every text prompt, which
            reads each prompt as a query for images
        min_image_tokens (4): the fewest visual tokens an image is resized to,
            each covering 32x32 pixels
        max_image_tokens (1800): the most visual tokens an image is resized to
        prompt_batch_size (32): the most text prompts embedded per forward
            pass
    """

    def __init__(self, d):
        """Parses the config, rejecting empty instructions and token limits
        below one."""
        d = self.init(d)
        super().__init__(d)

        self.name_or_path = self.parse_string(
            d, "name_or_path", default=DEFAULT_OVIS_EMBEDDING_MODEL
        )
        self.revision = self.parse_string(d, "revision", default=None)
        self.subfolder = self.parse_string(d, "subfolder", default=_SUBFOLDER)
        self.instruction = self.parse_string(
            d, "instruction", default=DEFAULT_INSTRUCTION
        )
        self.prompt_instruction = self.parse_string(
            d, "prompt_instruction", default=DEFAULT_PROMPT_INSTRUCTION
        )
        self.min_image_tokens = self.parse_int(
            d, "min_image_tokens", default=_MIN_IMAGE_TOKENS
        )
        self.max_image_tokens = self.parse_int(
            d, "max_image_tokens", default=_MAX_IMAGE_TOKENS
        )
        self.prompt_batch_size = self.parse_int(
            d, "prompt_batch_size", default=32
        )

        if not self.instruction.strip():
            raise ValueError("instruction must not be empty")

        if not self.prompt_instruction.strip():
            raise ValueError("prompt_instruction must not be empty")

        if not 1 <= self.min_image_tokens <= self.max_image_tokens:
            raise ValueError(
                "Need 1 <= min_image_tokens <= max_image_tokens; got %d and "
                "%d" % (self.min_image_tokens, self.max_image_tokens)
            )

        if self.prompt_batch_size < 1:
            raise ValueError("prompt_batch_size must be at least 1")

        self.raw_inputs = True


class OvisEmbeddingModel(fout.TorchImageModel, fom.PromptMixin):
    """Wrapper for Ovis-VL-Embedding models.

    Ovis-VL-Embedding maps images and text into one embedding space: each
    input is read with an instruction, and the final hidden state at its last
    token, L2-normalized, is its embedding. Images and text prompts embed
    into the same space, so text can search images by similarity.

    Inference is split across FiftyOne's data loading hooks:
    :class:`OvisEmbeddingGetItem` loads, resizes and patches each image in
    the data loader's workers, :attr:`collate_fn` pads the prompts into a
    batch, and :meth:`embed_all` runs the batch through the model.

    Example::

        import fiftyone as fo
        import fiftyone.brain as fob
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart")

        model = foz.load_zoo_model("ovis-vl-embedding-2b-torch")

        dataset.compute_embeddings(
            model, embeddings_field="ovis_embeddings", batch_size=16
        )

        fob.compute_similarity(
            dataset,
            model=model,
            embeddings="ovis_embeddings",
            brain_key="ovis_sim",
        )

        view = dataset.sort_by_similarity(
            "a dog on a couch", k=10, brain_key="ovis_sim"
        )

        session = fo.launch_app(view)

    Args:
        config: an :class:`OvisEmbeddingModelConfig`
    """

    def __init__(self, config):
        """Loads the checkpoint and builds the image prompt."""
        self._processor = None
        self._prompt_ids = None
        self._image_token_id = None
        self._pad_token_id = None
        self._last_embeddings = None
        super().__init__(config)

    @property
    def has_embeddings(self):
        """True; the model embeds images."""
        return True

    @property
    def can_embed_prompts(self):
        """True; the model embeds text prompts."""
        return True

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
        return _OvisEmbeddingCollate(self._pad_token_id, self._image_token_id)

    def build_get_item(self, field_mapping=None):
        """Builds the :class:`OvisEmbeddingGetItem` that encodes each image
        with this model's prompt.

        Args:
            field_mapping (None): a dict mapping the GetItem's required keys
                to field names of the dataset

        Returns:
            an :class:`OvisEmbeddingGetItem`
        """
        processor = self._processor.image_processor
        area = (processor.patch_size * processor.merge_size) ** 2
        return OvisEmbeddingGetItem(
            processor,
            self._prompt_ids,
            self._image_token_id,
            self.config.min_image_tokens * area,
            self.config.max_image_tokens * area,
            field_mapping=field_mapping,
        )

    def _download_model(self, config):
        """Leaves the download to :meth:`_load_model`."""
        pass

    def _load_model(self, config):
        """Loads the checkpoint and its processor and builds the image
        prompt.

        Args:
            config: an :class:`OvisEmbeddingModelConfig`

        Returns:
            the model
        """
        kwargs = {"revision": config.revision}
        if config.subfolder:
            kwargs["subfolder"] = config.subfolder

        self._processor = transformers.AutoProcessor.from_pretrained(
            config.name_or_path, **kwargs
        )

        dtype = torch.bfloat16 if self._using_gpu else torch.float32
        model = transformers.AutoModel.from_pretrained(
            config.name_or_path, dtype=dtype, **kwargs
        )
        model = model.to(self._device)
        model.eval()

        tokenizer = self._processor.tokenizer
        self._image_token_id = tokenizer.convert_tokens_to_ids(_IMAGE_TOKEN)
        self._pad_token_id = tokenizer.pad_token_id
        self._prompt_ids = tokenizer(
            _render(config.instruction, _IMAGE_TEXT), add_special_tokens=False
        )["input_ids"]

        return model

    def embed(self, arg):
        """Embeds an image.

        Args:
            arg: an image path, PIL image, numpy array or Torch tensor

        Returns:
            a 1D numpy array
        """
        return self.embed_all([arg])[0]

    def embed_all(self, args):
        """Embeds a batch of images.

        Args:
            args: a list of images, or a batch that :attr:`collate_fn` padded
                when preprocessing is off

        Returns:
            a ``num_images x num_dims`` numpy array
        """
        return self._predict_all(args)

    def get_embeddings(self):
        """Returns the embeddings of the last batch of images.

        Returns:
            a ``num_images x num_dims`` numpy array
        """
        if self._last_embeddings is None:
            raise ValueError("No images have been embedded yet")

        return self._last_embeddings

    def embed_prompt(self, prompt):
        """Embeds a text prompt.

        Args:
            prompt: a text string

        Returns:
            a 1D numpy array
        """
        return self.embed_prompts([prompt])[0]

    def embed_prompts(self, prompts):
        """Embeds text prompts.

        Args:
            prompts: an iterable of text strings

        Returns:
            a ``num_prompts x num_dims`` numpy array
        """
        instruction = self.config.prompt_instruction
        tokenizer = self._processor.tokenizer
        rows = [
            torch.tensor(
                tokenizer(
                    _render(instruction, str(prompt)), add_special_tokens=False
                )["input_ids"],
                dtype=torch.long,
            )
            for prompt in prompts
        ]

        embeddings = []
        size = self.config.prompt_batch_size
        for start in range(0, len(rows), size):
            input_ids, attention_mask = _pad_left(
                rows[start : start + size], self._pad_token_id
            )
            batch = {
                "input_ids": input_ids.to(self._device),
                "attention_mask": attention_mask.to(self._device),
            }
            embeddings.append(self._forward_pass(batch))

        return np.concatenate(embeddings)

    def _predict_all(self, imgs):
        """Embeds a batch of images.

        Args:
            imgs: a list of images, or a batch that :attr:`collate_fn` padded
                when preprocessing is off

        Returns:
            a ``num_images x num_dims`` numpy array
        """
        if self._preprocess:
            # Images given directly rather than through a data loader are
            # encoded and padded here
            encode = self.build_get_item().encode
            imgs = self.collate_fn([encode(img) for img in imgs])

        batch = {k: v.to(self._device) for k, v in imgs.items()}
        self._last_embeddings = self._forward_pass(batch)
        return self._last_embeddings

    def _forward_pass(self, batch):
        """Runs a padded batch through the model and pools each row's last
        token.

        Args:
            batch: a padded batch on the model's device

        Returns:
            a ``batch_size x num_dims`` numpy array of L2-normalized
            embeddings
        """
        with torch.inference_mode():
            hidden = self._model(**batch).last_hidden_state[:, -1]
            embeddings = torch.nn.functional.normalize(hidden.float(), dim=-1)

        return embeddings.cpu().numpy()
