"""
CLIP model wrapper for the FiftyOne Model Zoo.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import os
from packaging.version import Version
import warnings

import eta.core.web as etaw

import fiftyone as fo
import fiftyone.core.models as fom
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

fou.ensure_torch()
import torch

from .tokenizer import SimpleTokenizer
from .model import build_model


logger = logging.getLogger(__name__)


class TorchCLIPModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for running a :class:`TorchCLIPModel`.

    See :class:`fiftyone.utils.torch.TorchImageModelConfig` for additional
    arguments.

    Args:
        tokenizer_base_filename: the filename in ``fo.config.model_zoo_dir`` in
            which to store the model's tokenizer
        tokenizer_base_url: a URL from which the tokenizer can be downloaded,
            if necessary
        context_length: the model's context length
        text_prompt: the text prompt to use, e.g., ``"A photo of"``
        classes (None): a list of custom classes for zero-shot prediction
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)

        self.tokenizer_base_filename = self.parse_string(
            d, "tokenizer_base_filename"
        )
        self.tokenizer_base_url = self.parse_string(d, "tokenizer_base_url")
        self.context_length = self.parse_int(d, "context_length")
        self.text_prompt = self.parse_string(d, "text_prompt")

        self._tokenizer_path = os.path.join(
            fo.config.model_zoo_dir, self.tokenizer_base_filename
        )

    @property
    def tokenizer_path(self):
        return self._tokenizer_path

    def download_tokenizer_if_necessary(self):
        if not os.path.isfile(self._tokenizer_path):
            logger.info("Downloading CLIP tokenizer...")
            etaw.download_file(
                self.tokenizer_base_url, path=self._tokenizer_path
            )


class TorchCLIPModel(fout.TorchImageModel, fom.PromptMixin):
    """Torch implementation of CLIP from https://github.com/openai/CLIP.

    Args:
        config: a :class:`TorchCLIPModelConfig`
    """

    def __init__(self, config):
        super().__init__(config)

        self._tokenizer = SimpleTokenizer(config.tokenizer_path)
        self._text_features = None

    @property
    def can_embed_prompts(self):
        return True

    def embed_prompt(self, prompt):
        """Generates an embedding for the given text prompt.

        Args:
            prompt: a text string

        Returns:
            a numpy vector
        """
        return self.embed_prompts([prompt])[0]

    def embed_prompts(self, prompts):
        """Generates an embedding for the given text prompts.

        Args:
            prompts: an iterable of text strings

        Returns:
            a ``num_prompts x num_dims`` array of prompt embeddings
        """
        return self._embed_prompts(prompts).detach().cpu().numpy()

    def _download_model(self, config):
        config.download_model_if_necessary()
        config.download_tokenizer_if_necessary()

    def _load_model(self, config):
        with open(config.model_path, "rb") as f:
            model = torch.jit.load(f, map_location=self.device).eval()

        return build_model(model.state_dict()).to(self.device).float()

    def _embed_prompts(self, prompts):
        # source: https://github.com/openai/CLIP/blob/main/clip/clip.py
        sot_token = self._tokenizer.encoder["<|startoftext|>"]
        eot_token = self._tokenizer.encoder["<|endoftext|>"]
        all_tokens = [
            [sot_token] + self._tokenizer.encode(p) + [eot_token]
            for p in prompts
        ]

        if Version(torch.__version__) < Version("1.8.0"):
            dtype = torch.long
        else:
            dtype = torch.int

        text_features = torch.zeros(
            len(all_tokens),
            self.config.context_length,
            dtype=dtype,
            device=self.device,
        )

        for i, (prompt, tokens) in enumerate(zip(prompts, all_tokens)):
            if len(tokens) > self.config.context_length:
                tokens = tokens[: self.config.context_length]
                tokens[-1] = eot_token
                msg = (
                    "Truncating prompt '%s'; too long for context length '%d'"
                    % (prompt, self.config.context_length)
                )
                warnings.warn(msg)

            text_features[i, : len(tokens)] = torch.tensor(tokens)

        with torch.no_grad():
            return self._model.encode_text(text_features)

    def _get_text_features(self):
        if self._text_features is None:
            prompts = [
                "%s %s" % (self.config.text_prompt, c) for c in self.classes
            ]
            self._text_features = self._embed_prompts(prompts)

        return self._text_features

    def _get_class_logits(self, text_features, image_features):
        # source: https://github.com/openai/CLIP/blob/main/README.md
        image_features = image_features / image_features.norm(
            dim=1, keepdim=True
        )
        text_features = text_features / text_features.norm(dim=1, keepdim=True)
        logit_scale = self._model.logit_scale.exp()
        logits_per_image = logit_scale * image_features @ text_features.t()
        logits_per_text = logits_per_image.t()
        return logits_per_image, logits_per_text

    def _predict_all(self, imgs):
        if self._preprocess:
            imgs = [self._transforms(img) for img in imgs]

        if isinstance(imgs, (list, tuple)):
            imgs = torch.stack(imgs)

        height, width = imgs.size()[-2:]
        frame_size = (width, height)

        if self._using_gpu:
            imgs = imgs.to(self.device)

        text_features = self._get_text_features()
        image_features = self._model.encode_image(imgs)
        output, _ = self._get_class_logits(text_features, image_features)

        if self.has_logits:
            self._output_processor.store_logits = self.store_logits

        return self._output_processor(
            output, frame_size, confidence_thresh=self.config.confidence_thresh
        )
