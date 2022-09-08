"""CLIP model handler for FiftyOne model zoo.
"""
import requests
import torch

import fiftyone as fo
from fiftyone.utils import torch as fout
from fiftyone.zoo import models as fozm
from fiftyone.utils.clip.tokenizer import SimpleTokenizer
from fiftyone.utils.clip.model import build_model


class TorchCLIPModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)
        self._init_vars(d)

    def _init_vars(self, d):
        from pathlib import Path

        self._tokenizer_path = Path(
            fo.config.model_zoo_dir
        ) / self.parse_string(d, "tokenizer_base_filename")
        self._tokenizer_base_url = self.parse_string(d, "tokenizer_base_url")
        self.text_prompt = self.parse_string(d, "text_prompt")
        self.context_length = self.parse_int(d, "context_length")
        self.class_labels = self.parse_array(d, "class_labels", [])

    def download_tokenizer_if_necessary(self):
        if not self._tokenizer_path.exists():
            with requests.get(
                self._tokenizer_base_url, stream=True
            ) as response, open(
                self._tokenizer_path, "wb"
            ) as f, fo.ProgressBar(
                iters_str="downloading clip tokenizer"
            ) as bar:
                for chunk in bar(response.iter_content(chunk_size=1024)):
                    if chunk:
                        f.write(chunk)


class TorchCLIPModel(fout.TorchImageModel):
    """Torch implementation of the CLIP model.

    By default VOC labels are used for zero-shot prediction.
    To use custom labels, set `class_labels=[list,of,labels]` in the model
    """

    def _download_model(self, config):
        config.download_model_if_necessary()
        config.download_tokenizer_if_necessary()

    def _get_class_labels(self, config):
        if hasattr(config, "class_labels") and config.class_labels:
            # use custom labels
            return config.class_labels
        else:
            # same as parent class
            return super()._get_class_labels(config)

    def _load_network(self, config):
        with open(config.model_path, "rb") as f:
            model = torch.jit.load(f, map_location=self.device).eval()
        model = build_model(model.state_dict()).to(self.device).float()
        # load tokenizer and set clip params
        self._tokenizer = SimpleTokenizer(str(config._tokenizer_path))
        self._text_prompt = config.text_prompt
        self._context_length = config.context_length
        return model

    def _prepare_text(self):
        """Convert class labels to tensors for text encoding.

        Returns:
            torch.Tensor: encoded text
        """
        from pkg_resources import packaging

        # init vars and prepare text
        class_labels = self._output_processor.class_labels
        texts = [
            f"{self._text_prompt} {class_labels[i]}"
            for i in range(len(class_labels))
        ]
        # source: https://github.com/openai/CLIP/blob/main/clip/clip.py
        sot_token = self._tokenizer.encoder["<|startoftext|>"]
        eot_token = self._tokenizer.encoder["<|endoftext|>"]
        all_tokens = [
            [sot_token] + self._tokenizer.encode(txt) + [eot_token]
            for txt in texts
        ]
        if packaging.version.parse(
            torch.__version__
        ) < packaging.version.parse("1.8.0"):
            result = torch.zeros(
                len(all_tokens), self._context_length, dtype=torch.long
            )
        else:
            result = torch.zeros(
                len(all_tokens), self._context_length, dtype=torch.int
            )
        for i, tokens in enumerate(all_tokens):
            if len(tokens) > self._context_length:
                tokens = tokens[: self._context_length]
                tokens[-1] = eot_token
            result[i, : len(tokens)] = torch.tensor(tokens)
        return result

    def _get_text_features(self):
        """Get class labels embeddings.

        Run only once for all class labels. If embeddings exists, use them.

        Returns:
            torch.Tensor: class labels embeddings
        """
        if not hasattr(self, "_text_features") or self._text_features is None:
            tokens = self._prepare_text()
            with torch.no_grad():
                self._text_features = self._model.encode_text(tokens)
        return self._text_features

    def _get_class_logits(self, text_features, image_features):
        """Get dot-product similarities text and image features.

        Args:
            text_features: CLIP text encoding output
            image_features: CLIP image encoding output

        Returns:
            torch.Tensor: a tuple of image logits and text logits
        """
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
            imgs = imgs.cuda()

        text_features = self._get_text_features()
        image_features = self._model.encode_image(imgs)
        output, _ = self._get_class_logits(text_features, image_features)

        if self.has_logits:
            self._output_processor.store_logits = self.store_logits

        return self._output_processor(
            output, frame_size, confidence_thresh=self.config.confidence_thresh
        )
