"""
FiftyOne Zoo models provided by :mod:`torchvision:torchvision.models`.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import inspect

import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.utils as fou
import fiftyone.core.models as fom
import fiftyone.utils.torch as fout
import fiftyone.utils.clip as fouc
import fiftyone.utils.simple_tokenizer as foust
import fiftyone.zoo.models as fozm
import requests

fou.ensure_torch()
import torch
import torchvision


class TorchvisionImageModelConfig(
    fout.TorchImageModelConfig, fozm.HasZooModel
):
    """Configuration for running a :class:`TorchvisionImageModel`.

    Args:
        model_name (None): the name of a zoo model containing a state dict to
            load
        model_path (None): the path to a state dict on disk to load
        entrypoint_fcn: a string like ``"torchvision.models.inception_v3"``
            specifying the entrypoint function that loads the model
        entrypoint_args (None): a dictionary of arguments for
            ``entrypoint_fcn``
        output_processor_cls: a string like
            ``"fifytone.utils.torch.ClassifierOutputProcessor"`` specifying the
            :class:`fifytone.utils.torch.OutputProcessor` to use
        output_processor_args (None): a dictionary of arguments for
            ``output_processor_cls(class_labels, **kwargs)``
        labels_string (None): a comma-separated list of the class names for the
            model
        labels_path (None): the path to the labels map for the model
        use_half_precision (None): whether to use half precision
        image_min_size (None): resize the input images during preprocessing, if
            necessary, so that the image dimensions are at least this
            ``(width, height)``
        image_min_dim (None): resize input images during preprocessing, if
            necessary, so that the smaller image dimension is at least this
            value
        image_size (None): a ``(width, height)`` to which to resize the input
            images during preprocessing
        image_dim (None): resize the smaller input dimension to this value
            during preprocessing
        image_mean (None): a 3-array of mean values in ``[0, 1]`` for
            preprocessing the input images
        image_std (None): a 3-array of std values in ``[0, 1]`` for
            preprocessing the input images
        embeddings_layer (None): the name of a layer whose output to expose as
            embeddings
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)


class TorchvisionImageModel(fout.TorchImageModel):
    """Wrapper for evaluating a :mod:`torchvision:torchvision.models` model on images.

    Args:
        config: an :class:`TorchvisionImageModelConfig`
    """

    def _download_model(self, config):
        config.download_model_if_necessary()

    def _load_network(self, config):
        entrypoint = etau.get_function(config.entrypoint_fcn)
        kwargs = config.entrypoint_args or {}
        model_dir = fo.config.model_zoo_dir

        monkey_patcher = _make_load_state_dict_from_url_monkey_patcher(
            entrypoint, model_dir
        )
        with monkey_patcher:
            # Builds net and loads state dict from `model_dir`
            model = entrypoint(**kwargs)

        return model


class TorchCLIPModelConfig(
        fout.TorchImageModelConfig, fozm.HasZooModel
    ):
    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)
        self._init_vars(d)

    def _init_vars(self, d):
        from pathlib import Path
        self._tokenizer_path = Path(fo.config.model_zoo_dir) / self.parse_string(d, "tokenizer_base_filename")
        self._tokenizer_base_url = self.parse_string(d, "tokenizer_base_url")
        self.text_prompt = self.parse_string(d, "text_prompt")
        self.context_length = self.parse_int(d, "context_length")

    def download_tokenizer_if_necessary(self):
        if not self._tokenizer_path.exists():
            with requests.get(self._tokenizer_base_url, stream=True) as response,\
                 open(self._tokenizer_path, "wb") as f, \
                 fo.ProgressBar(iters_str="downloading clip tokenizer") as bar:
                for chunk in bar(response.iter_content(chunk_size=1024)):
                    if chunk:
                        f.write(chunk)


class TorchCLIPModel(fout.TorchImageModel):
    # TODO add bicubic interpolation to manifest
    # TODO add center crop after resize
    def _download_model(self, config):
        config.download_model_if_necessary()
        config.download_tokenizer_if_necessary()

    def _load_network(self, config):
        with open(config.model_path, 'rb') as f:
            model = torch.jit.load(f, map_location=self.device).eval()
        model = fouc.build_model(model.state_dict()).to(self.device).float()
        # load tokenizer and set clip params
        self._tokenizer = foust.SimpleTokenizer(str(config._tokenizer_path))
        self._text_prompt = config.text_prompt
        self._context_length = config.context_length
        return model

    def _prepare_text(self):
        from pkg_resources import packaging
        # init vars and prepare text
        class_labels = self._output_processor.class_labels
        texts = [f"{self._text_prompt} {class_labels[i]}" for i in range(len(class_labels))]
        # tokenize, source: https://github.com/openai/CLIP/blob/main/clip/clip.py
        sot_token = self._tokenizer.encoder["<|startoftext|>"]
        eot_token = self._tokenizer.encoder["<|endoftext|>"]
        all_tokens = [[sot_token] + self._tokenizer.encode(txt) + [eot_token] for txt in texts]
        if packaging.version.parse(torch.__version__) < packaging.version.parse("1.8.0"):
            result = torch.zeros(len(all_tokens), self._context_length, dtype=torch.long)
        else:
            result = torch.zeros(len(all_tokens), self._context_length, dtype=torch.int)
        for i, tokens in enumerate(all_tokens):
            if len(tokens) > self._context_length:
                if truncate:
                    tokens = tokens[:self._context_length]
                    tokens[-1] = eot_token
                else:
                    raise RuntimeError(f"Input {texts[i]} is too long for context length {self._context_length}")
            result[i, :len(tokens)] = torch.tensor(tokens)
        return result

    def _get_text_features(self):
        if not hasattr(self, "_text_features") or self._text_features is None:
            tokens = self._prepare_text()
            with torch.no_grad():
                self._text_features = self._model.encode_text(tokens)
        return self._text_features

    def _get_class_logits(self, text_features, image_features):
        # source: https://github.com/openai/CLIP/blob/main/README.md
        image_features = image_features / image_features.norm(dim=1, keepdim=True)
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
            imgs = imgs.cuda()

        text_features = self._get_text_features()
        image_features = self._model.encode_image(imgs)
        output, _ = self._get_class_logits(text_features, image_features)

        if self.has_logits:
            self._output_processor.store_logits = self.store_logits

        return self._output_processor(
            output, frame_size, confidence_thresh=self.config.confidence_thresh
        )


def _make_load_state_dict_from_url_monkey_patcher(entrypoint, model_dir):
    """Monkey patches all instances of ``load_state_dict_from_url()`` that are
    reachable from the given ``entrypoint`` function in the
    :mod:`torchvision:torchvision.models` namespace so that models will be
    loaded from ``model_dir`` and not from the Torch Hub cache directory.
    """
    entrypoint_module = inspect.getmodule(entrypoint)
    load_state_dict_from_url = entrypoint_module.load_state_dict_from_url

    def custom_load_state_dict_from_url(url, **kwargs):
        return load_state_dict_from_url(url, model_dir=model_dir, **kwargs)

    return fou.MonkeyPatchFunction(
        entrypoint_module,
        custom_load_state_dict_from_url,
        fcn_name=load_state_dict_from_url.__name__,
        namespace=torchvision.models,
    )
