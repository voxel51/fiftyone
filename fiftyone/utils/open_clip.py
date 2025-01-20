"""
CLIP model wrapper for the FiftyOne Model Zoo.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import contextlib
import logging

import fiftyone.core.models as fom
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

fou.ensure_torch()
import torch

open_clip = fou.lazy_import(
    "open_clip", callback=lambda: fou.ensure_package("open_clip_torch")
)

logger = logging.getLogger(__name__)


class TorchOpenClipModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for running a :class:`TorchOpenClipModel`.

    See :class:`fiftyone.utils.torch.TorchImageModelConfig` for additional
    arguments.

    Args:
        text_prompt: the text prompt to use, e.g., ``"A photo of"``
        clip_model ("ViT-B-32"): the Open CLIP model to use
        pretrained ("openai"): the pretrained version to use
        classes (None): a list of custom classes for zero-shot prediction
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)

        self.text_prompt = self.parse_string(d, "text_prompt")
        self.clip_model = self.parse_string(
            d, "clip_model", default="ViT-B-32"
        )
        self.pretrained = self.parse_string(d, "pretrained", default="openai")


class TorchOpenClipModel(fout.TorchImageModel, fom.PromptMixin):
    """Torch implementation of CLIP from
    https://github.com/mlfoundations/open_clip.

    Args:
        config: a :class:`TorchOpenClipModelConfig`
    """

    def __init__(self, config):
        super().__init__(config)
        self._text_features = None
        self.preprocess = self._preprocess_aux

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

    def _load_model(self, config):
        (
            self._model,
            _,
            self._preprocess_aux,
        ) = open_clip.create_model_and_transforms(
            config.clip_model,
            pretrained=config.pretrained,
            device=self.device,
        )
        self._tokenizer = open_clip.get_tokenizer(config.clip_model)
        self._model.eval()
        return self._model

    def _get_text_features(self):
        if self._text_features is None:
            prompts = [
                "%s %s" % (self.config.text_prompt, c) for c in self.classes
            ]
            # Tokenize text
            text = self._tokenizer(prompts)
            if self._using_gpu:
                text = text.to(self.device)
            self._text_features = self._model.encode_text(text)

        return self._text_features

    def _embed_prompts(self, prompts):
        formatted_prompts = [
            "%s %s" % (self.config.text_prompt, p) for p in prompts
        ]
        # Tokenize text
        text = self._tokenizer(formatted_prompts)
        if self._using_gpu:
            text = text.to(self.device)
        return self._model.encode_text(text)

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
            imgs = [self._preprocess(img) for img in imgs]

        if isinstance(imgs, (list, tuple)):
            imgs = torch.stack(imgs)

        height, width = imgs.size()[-2:]
        frame_size = (width, height)

        with torch.no_grad(), contextlib.ExitStack() as ctx:
            if self._using_gpu:
                imgs = imgs.to(self.device)

                # https://github.com/voxel51/fiftyone/pull/5395#issuecomment-2601055784
                ctx.enter_context(
                    torch.amp.autocast(device_type=self.device.type)
                )

            image_features = self._model.encode_image(imgs)
            text_features = self._get_text_features()

            output, _ = self._get_class_logits(text_features, image_features)

            if self.has_logits:
                self._output_processor.store_logits = self.store_logits

        return self._output_processor(
            output, frame_size, confidence_thresh=self.config.confidence_thresh
        )
