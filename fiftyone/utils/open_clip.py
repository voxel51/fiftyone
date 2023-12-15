"""
CLIP model wrapper for the FiftyOne Model Zoo.

| Copyright 2017-2023, Voxel51, Inc.
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

import open_clip

logger = logging.getLogger(__name__)


class TorchOpenClipModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for running a :class:`TorchCLIPModel`.

    See :class:`fiftyone.utils.torch.TorchImageModelConfig` for additional
    arguments.

    Args:
        context_length: the model's context length
        text_prompt: the text prompt to use, e.g., ``"A photo of"``
        classes (None): a list of custom classes for zero-shot prediction
        model_name_clip (None): the model to use
        pretrained (None): the pretrained version to use
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)

        self.context_length = self.parse_int(d, "context_length")
        self.text_prompt = self.parse_string(d, "text_prompt")

        self.model_name_clip = self.parse_string(d, "model_name_clip")
        self.pretrained = self.parse_string(d, "pretrained")


class TorchOpenClipModel(fout.TorchImageModel, fom.PromptMixin):
    """Torch implementation of CLIP from https://github.com/mlfoundations/open_clip.

    Args:
        config: a :class:`TorchOpenClipPModelConfig`
    """

    def __init__(self, config):
        super().__init__(config)
        self._text_features = None

    def _load_model(self, config):
        (
            self._model,
            _,
            self.preprocess,
        ) = open_clip.create_model_and_transforms(
            config.model_name_clip, pretrained=config.pretrained
        )
        self._tokenizer = open_clip.get_tokenizer(config.model_name_clip)
        return self._model

    def _get_text_features(self):
        if self._text_features is None:
            prompts = [
                "%s %s" % (self.config.text_prompt, c) for c in self.classes
            ]
            # Tokenize text
            text = self._tokenizer(prompts)
            self._text_features = self._model.encode_text(text)

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
            imgs = [self._preprocess(img).unsqueeze(0) for img in imgs]

        if isinstance(imgs, (list, tuple)):
            imgs = torch.stack(imgs)

        height, width = imgs.size()[-2:]
        frame_size = (width, height)

        if self._using_gpu:
            imgs = imgs.cuda()

        with torch.no_grad(), torch.cuda.amp.autocast():
            image_features = self._model.encode_image(imgs)
            text_features = self._get_text_features()

            output, _ = self._get_class_logits(text_features, image_features)

            if self.has_logits:
                self._output_processor.store_logits = self.store_logits

        return self._output_processor(
            output, frame_size, confidence_thresh=self.config.confidence_thresh
        )
