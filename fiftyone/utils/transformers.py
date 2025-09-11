"""
Utilities for working with
`Hugging Face Transformers <https://huggingface.co/docs/transformers>`_.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from copy import deepcopy
import logging
import warnings

import numpy as np
from PIL import Image

import fiftyone as fo
import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
from fiftyone.core.models import EmbeddingsMixin, PromptMixin
from fiftyone.zoo.models import HasZooModel
import fiftyone.utils.torch as fout


fou.ensure_torch()
import torch

from torchvision.transforms import functional as F

fou.ensure_package("transformers")
import transformers



logger = logging.getLogger(__name__)

DEFAULT_CLASSIFICATION_PATH = "google/vit-base-patch16-224"
DEFAULT_DETECTION_PATH = "hustvl/yolos-tiny"
DEFAULT_SEGMENTATION_PATH = "nvidia/segformer-b0-finetuned-ade-512-512"
DEFAULT_DEPTH_ESTIMATION_PATH = "Intel/dpt-hybrid-midas"
DEFAULT_ZERO_SHOT_CLASSIFICATION_PATH = "openai/clip-vit-large-patch14"
DEFAULT_ZERO_SHOT_DETECTION_PATH = "google/owlvit-base-patch32"
DEFAULT_POSE_ESTIMATION_PATH = "usyd-community/vitpose-base-simple"



def convert_transformers_model(model, task=None, **kwargs):
    """Converts the given Hugging Face transformers model into a FiftyOne
    model.

    Args:
        model: a ``transformers`` model
        task (None): the task of the model. Supported values are
            ``"image-classification"``, ``"object-detection"``,
            ``"semantic-segmentation"``, and ``"depth-estimation"``.
            If not specified, the task is automatically inferred from the model

    Returns:
         a :class:`fiftyone.core.models.Model`

    Raises:
        ValueError: if the model could not be converted
    """
    model_type = get_model_type(model, task=task)

    name_or_path = model.config._name_or_path

    d = {
        "model": model,
        "name_or_path": name_or_path,
    }

    if model_type in MODEL_TYPE_TO_CONFIG_CLASS:
        config_cls = MODEL_TYPE_TO_CONFIG_CLASS[model_type]
        config = config_cls(d)
        return MODEL_TYPE_TO_MODEL_CLASS[model_type](config)

    else:
        raise ValueError(
            "Unsupported model type; cannot convert %s to a FiftyOne model"
            % model
        )


def get_model_type(model, task=None):
    """Returns the string model type for the given model.

    If the model is a zero-shot model, the task is appended to the model type.

    Args:
        model: a ``transformers.model`` model
        task (None): an optional task type

    Returns:
        the model type string
    """
    if task and isinstance(task, str):
        if "zero-shot" in task:
            if "detection" in task:
                return "zero-shot-object-detection"
            else:
                return "zero-shot-image-classification"

    supported_tasks = (
        "image-classification",
        "object-detection",
        "semantic-segmentation",
        "depth-estimation",
    )
    if task is not None and task not in supported_tasks:
        raise ValueError(
            f"Unknown task: {task}. Valid tasks are {supported_tasks}"
        )

    zs = _is_zero_shot_model(model)

    if zs and task is None:
        if _has_detection_model(model):
            task = "object-detection"
        else:
            task = "image-classification"
    elif not zs and task is None:
        if _is_transformer_for_image_classification(model):
            task = "image-classification"
        elif _is_transformer_for_object_detection(model):
            task = "object-detection"
        elif _is_transformer_for_semantic_segmentation(model):
            task = "semantic-segmentation"
        elif _is_transformer_for_depth_estimation(model):
            task = "depth-estimation"
        elif _is_transformer_for_pose_estimation(model):
            task = "pose-estimation"
        elif _is_transformer_base_model(model):
            task = "base-model"
        else:
            raise ValueError(f"Unknown model type: {model}")

    if zs:
        return "zero-shot-" + task

    return task


def to_segmentation(results):
    """Converts the Transformers semantic segmentation results to FiftyOne
    format.

    Args:
        results: Transformers semantic segmentation results

    Returns:
        a single or list of :class:`fiftyone.core.labels.Segmentation`
    """
    masks = [r.cpu().numpy() for r in results]

    if len(results) == 1:
        return _create_segmentation(masks[0])

    return [_create_segmentation(masks[i]) for i in range(len(masks))]


def _create_segmentation(mask):
    return fol.Segmentation(mask=mask)


def to_heatmap(results):
    """Converts the Transformers depth estimation results to FiftyOne format.

    Args:
        results: Transformers depth estimation results

    Returns:
        a single or list of :class:`fiftyone.core.labels.Heatmap`
    """

    if len(results.shape) == 2:
        return _create_heatmap(results)

    if len(results) == 1:
        return _create_heatmap(results[0])

    return [_create_heatmap(results[i]) for i in range(len(results))]


def _create_heatmap(heatmap):
    ## normalize the heatmap
    heatmap /= np.max(heatmap)
    return fol.Heatmap(map=heatmap)


def to_detections(results, id2label, image_sizes):
    """Converts the Transformers detection results to FiftyOne format.

    Args:
        results: Transformers detection results
        id2label: Transformers ID to label mapping
        image_sizes: the list of image sizes

    Returns:
        a single or list of :class:`fiftyone.core.labels.Detections`
    """
    if isinstance(results, dict):
        return _to_detections(results, id2label, image_sizes[0])

    if len(results) == 1:
        return _to_detections(results[0], id2label, image_sizes[0])

    return [
        _to_detections(result, id2label, image_sizes[i])
        for i, result in enumerate(results)
    ]


def _get_class(label, id2label):
    # if the label is not in the id2label mapping, return the first label
    l = label.item()
    if l not in id2label:
        return id2label[0]
    return id2label[l]


def _to_detections(result, id2label, image_size):
    detections = []

    scores = result["scores"].cpu().numpy()
    labels = result["labels"].cpu().numpy()
    boxes = result["boxes"].cpu().numpy()
    for score, label, box in zip(scores, labels, boxes):
        box = [round(i, 2) for i in box.tolist()]
        box = _convert_bounding_box(box, image_size)
        detections.append(
            fol.Detection(
                label=_get_class(label, id2label),
                bounding_box=box,
                confidence=score.item(),
            )
        )

    return fol.Detections(detections=detections)


def _convert_bounding_box(box, image_shape):
    top_left_x, top_left_y, bottom_right_x, bottom_right_y = box

    width = bottom_right_x - top_left_x
    height = bottom_right_y - top_left_y

    img_width, img_height = image_shape

    return [
        top_left_x / img_width,
        top_left_y / img_height,
        width / img_width,
        height / img_height,
    ]


class FiftyOneTransformerConfig(fout.TorchImageModelConfig, HasZooModel):
    """Configuration for a :class:`FiftyOneTransformer`.

    Args:
        model (None): a ``transformers`` model
        name_or_path (None): the name or path to a checkpoint file to load
        transformers_processor_kwargs (None): a dict of kwargs to pass to the
            ``transformers`` processor during input processing.
        embeddings_output_key (None): The key in the model output to access for embeddings.
            if set to `None`, the default value will be picked based on what is
            available in the model's output with the following priority:
            1. `pooler_output`
            2. `last_hidden_state`
            3. `hidden_states` - in this case, `output['hidden_states'][-1]`
            will be used see
            https://huggingface.co/docs/transformers/en/main_classes/output
            for more details on model outputs.
        hidden_state_position (None): the layer to use for embeddings. If this is set,
            `embeddings_output_key` is ignored, and will be set to `hidden_states`.
            In this case, embeddings will be taken from
            `output['hidden_states'][hidden_state_position]`.
        embeddings_aggregation ("token"): the method to use for aggregating token
            embeddings. This is only used if `embeddings_output_key` is set to
            `last_hidden_state` or `hidden_states`. Supported values are
            ``"mean"``, ``"max"``, ``"token"``, and ``"no_agg"``. They do the
            following:
            1. ``"token"``: the token embedding at the specified position,
                specified by `embeddings_token_position`, by default the first
                token (0) is used.
            2. ``"mean"``: pointwise mean of all token embeddings
            3. ``"max"``: pointwise max of all token embeddings
            4. ``"no_agg"``: no aggregation
        channels_last (True): Whether the model outputs are in channels last format.
            If set to False, the model outputs are assumed to be in channels first format.
            The default is True because transformers models typically output in channels last format.
            Note that CNNs are typically channels first. Make sure to check model documentation
            to see if this is the case.
        embeddings_token_position (0): the token position to use when
            ``embeddings_aggregation`` is set to ``"token"``. This is only used
            if `embeddings_output_key` is set to ``last_hidden_state`` or
            ``hidden_states``. Typically, the first (0) token is
            used, because it usually represent the prediction token, e.g. CLS.
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)
        self.name_or_path = self.parse_string(d, "name_or_path", default=None)
        self.hf_config = transformers.AutoConfig.from_pretrained(
            self.name_or_path, cache_dir=fo.config.model_zoo_dir
        )

        self._load_classes(d)

        self.transformers_processor_kwargs = self.parse_dict(
            d, "transformers_processor_kwargs", default={}
        )

        # embeddings config
        self.output_hidden_states = self.parse_bool(
            d, "output_hidden_states", default=False
        )
        self.hidden_state_position = self.parse_int(
            d, "hidden_state_position", default=None
        )
        self.embeddings_output_key = self.parse_string(
            d, "embeddings_output_key", default=None
        )
        self.embeddings_aggregation = self.parse_string(
            d, "embeddings_aggregation", default="token"
        )
        self.channels_last = self.parse_bool(d, "channels_last", default=True)
        self.embeddings_token_position = self.parse_int(
            d, "embeddings_token_position", default=0
        )

    def _load_classes(self, d):
        # load classes if they exist
        if self.hf_config.id2label is not None:
            if self.classes is None:
                # only load classes if they are not already set
                self.classes = [
                    self.hf_config.id2label[i]
                    for i in range(len(self.hf_config.id2label))
                ]
            else:
                # if they are, this is either a zero shot model
                # and the AutoConfig set some strange classes
                # or the user is trying to override the classes
                # in the latter case, strange things can happen
                # not sure how to warn the user about this
                logger.warning(
                    "Classes were passed in to the FiftyOne model, but the "
                    "HugginFace Transformers model configuration already has classes. "
                    " either set the classes argument "
                    "to `None` to inherit the classes from the HFT model, "
                    "or change the classes in the HFT model "
                    "configuration to match the classes you want to use."
                )


class FiftyOneZeroShotTransformerConfig(FiftyOneTransformerConfig):
    """Configuration for a :class:`FiftyOneZeroShotTransformer`.

    Args:
        model (None): a ``transformers`` model
        name_or_path (None): the name or path to a checkpoint file to load
        text_prompt: the text prompt to use, e.g., ``"A photo of"``
        classes (None): a list of custom classes for zero-shot prediction
        class_prompts (None): a dict of class names to custom prompts for zero-shot.
            If not specified, class prompts take the form of ``"{text_prompt} {class_name}"``,
            otherwise, prompts take the form of ``"{text_prompt} {class_prompts[class_name]}"``.
    """

    def __init__(self, d):
        super().__init__(d)
        self.text_prompt = self.parse_string(d, "text_prompt", default=None)
        self.class_prompts = self.parse_dict(d, "class_prompts", default=None)

    def _load_classes(self, d):
        if self.classes is None:
            if self.hf_config.id2label is not None:
                self.classes = list(self.hf_config.id2label.values())


class TransformerEmbeddingsMixin(EmbeddingsMixin):
    """Mixin for Transformers that can generate embeddings.

    See :class:`fiftyone.utils.transformers.FiftyOneTransformerConfig`
    for more details on the configuration options.

    Please note: while it is possible to pull embeddings out of all sorts
    of model configurations, for best results, use a model that is intended
    for the job. In HuggingFace, this typically means not using a model
    built for image classification, object detection, or segmentation, or
    whatever other downstream task.

    This is mainly due to what is exposed by the model's forward pass. For
    example, the image classification models typically don't return pooled
    or normalized embeddings in HuggingFace. While this can be addressed
    here, there is no guarantee that this generic solution will work for
    the model passed.
    """

    _embeddings_output_key_defaults = [
        "pooler_output",
        "last_hidden_state",
        "hidden_states",
    ]

    @property
    def has_embeddings(self):
        return True

    def get_embeddings(self):
        if self.last_output is None:
            raise ValueError(
                "No embeddings have been generated yet. Call predict() first."
            )

        if self.embeddings_output_key is None:
            self.embeddings_output_key = self.resolve_embeddings_output_key(
                self.last_output
            )

        embeddings = self.last_output[self.embeddings_output_key]

        if self.embeddings_output_key == "pooler_output":
            # already good to go
            return embeddings

        if self.embeddings_output_key == "hidden_states":
            # we only want the hidden state at the specified layer
            embeddings = embeddings[self._hidden_state_position]

        # there could potentially be dims other than batch or embedding
        # have to send this through the aggregation function
        return self._aggregate_embeddings(embeddings)

    def _aggregate_embeddings(self, embeddings):
        if self.config.embeddings_aggregation == "token":
            return embeddings[:, self.config.embeddings_token_position, :]

        num_dims = len(embeddings.shape)
        if num_dims == 2:  # Batch x Embedding
            return embeddings

        if self.config.embeddings_aggregation == "no_agg":
            # no aggregation, just return the last hidden state
            return embeddings

        agg_fcn = (
            np.mean if self.config.embeddings_aggregation == "mean" else np.max
        )
        agg_dims = (
            tuple(range(1, num_dims - 1))
            if self.config.channels_last
            else tuple(range(2, num_dims))
        )
        # aggregate all but batch and channel dims
        res = agg_fcn(embeddings, axis=agg_dims)
        return res

    @property
    def embeddings_output_key(self):
        if hasattr(self, "_embeddings_output_key"):
            return self._embeddings_output_key
        self._embeddings_output_key = self.config.embeddings_output_key
        return self._embeddings_output_key

    @embeddings_output_key.setter
    def embeddings_output_key(self, value):
        self._embeddings_output_key = value

    def resolve_embeddings_output_key(self, output):
        keys = output.keys()
        config_value = self.config.embeddings_output_key
        if config_value is not None and config_value in keys:
            return config_value
        elif config_value is not None and config_value not in keys:
            raise ValueError(
                "The specified embeddings output key %s is not in the model output"
                % config_value
            )

        for key in self._embeddings_output_key_defaults:
            if key in keys:
                return key

        else:
            # have to set this to true to get the hidden states
            self._output_hidden_states = True
            return "hidden_states"

    def embed(self, arg):
        return self.embed_all([arg])[0]

    def embed_all(self, args):
        # this is a bit of a hack, but we need to make sure that the
        # embeddings output key is set before we call the forward pass
        # not great to always have the if here, but it should only
        # be called once per model.
        # the alternative is to do this in the constructor with dummy input
        # however, that opens up strange MRO issues as well as potential
        # errors from badly constructed dummy input
        if not self._save_last_output:
            self._save_last_output = True
        if self.embeddings_output_key is None:
            args_copy = deepcopy(args)
            _ = self.predict_all(args_copy)
            self.embeddings_output_key = self.resolve_embeddings_output_key(
                self.last_output
            )

        self._predict_all(args)
        self._save_last_output = False
        return self.get_embeddings()


class ZeroShotTransformerEmbeddingsMixin(EmbeddingsMixin):
    """Mixin for Transformers that can generate embeddings."""

    @property
    def has_embeddings(self):
        return hasattr(self._model, "get_image_features")

    def embed(self, arg):
        return self.embed_all([arg])[0]

    def embed_all(self, args):
        if self.preprocess:
            args = {"images": args}
            args = self.collate_fn(self.transforms(args))

        with torch.no_grad():
            for k, v in args.items():
                args[k] = v.to(self.device)
            return (
                self._model.get_image_features(**args).detach().cpu().numpy()
            )


class ZeroShotTransformerPromptMixin(PromptMixin):
    """Mixin for Transformers that can perform zero-shot prediction."""

    @property
    def can_embed_prompts(self):
        return _has_text_and_image_features(self._model)

    def embed_prompt(self, prompt):
        return self.embed_prompts([prompt])[0]

    def embed_prompts(self, prompts):
        return self._embed_prompts(prompts).detach().cpu().numpy()

    def _embed_prompts(self, prompts):
        # I don't think this is ever called with preprocess = False
        # but just in case
        if self.preprocess:
            inputs = self.transforms.processor(
                text=prompts,
                **self.transforms.kwargs,
            )
        with torch.no_grad():
            text_features = self._model.base_model.get_text_features(
                **inputs.to(self._device)
            )
        return text_features


class FiftyOneTransformer(TransformerEmbeddingsMixin, fout.TorchImageModel):
    """FiftyOne wrapper around a ``transformers`` model.

    Args:
        config: a `FiftyOneTransformerConfig`
    """

    def __init__(self, config):
        # default entry point for Transformers pretrained models
        if config.entrypoint_fcn is None:
            config.entrypoint_fcn = "transformers.AutoModel.from_pretrained"
        if config.entrypoint_args is None:
            config.entrypoint_args = {}
        if not config.entrypoint_args.get("pretrained_model_name_or_path"):
            config.entrypoint_args[
                "pretrained_model_name_or_path"
            ] = config.name_or_path

        config.entrypoint_args["cache_dir"] = fo.config.model_zoo_dir

        # default transforms
        if config.transforms_fcn is None:
            config.transforms_fcn = (
                "transformers.AutoProcessor.from_pretrained"
            )
        if config.transforms_args is None:
            config.transforms_args = {}

        # set default values if not provided
        config.transforms_args = {
            "pretrained_model_name_or_path": config.name_or_path,
            "use_fast": True,
            **config.transforms_args,
            "cache_dir": fo.config.model_zoo_dir,
        }
        config.ragged_batches = False

        # handle unsupported arguments
        if config.use_half_precision:
            config.use_half_precision = False
            logger.warning(
                "Half precision is not a supported argument for HuggingFace Transformers. "
                "The precision is decided by the model itself."
            )

        super().__init__(config)

        self._output_hidden_states = False
        self._hidden_state_position = config.hidden_state_position

        if self._hidden_state_position is None:
            self._hidden_state_position = -1  # default to last hidden state
        else:
            self._embeddings_output_key = "hidden_states"
            self._output_hidden_states = True
            if (
                self.config.embeddings_output_key is not None
                and self.config.embeddings_output_key != "hidden_states"
            ):
                warnings.warn(
                    "The `embeddings_output_key` has been set to `hidden_states` "
                    "because `hidden_state_position` is set. "
                    "Please set `embeddings_output_key` to `None` if you want to use "
                    "a different value."
                )

        self._save_last_output = False
        self._last_output = None

    @property
    def last_output(self):
        return self._last_output

    @last_output.setter
    def last_output(self, value):
        if not self._save_last_output:
            self._last_output = None
            return
        self._last_output = {}
        for k, v in value.items():
            self._last_output[k] = v
            if isinstance(self._last_output[k], torch.Tensor):
                self._last_output[k] = (
                    self._last_output[k].detach().cpu().numpy()
                )
            elif isinstance(self._last_output[k], tuple):
                self._last_output[k] = tuple(
                    [i.detach().cpu().numpy() for i in self._last_output[k]]
                )
            elif isinstance(
                self._last_output[k], transformers.utils.ModelOutput
            ):
                self._last_output[k] = {
                    _k: _v.detach().cpu().numpy()
                    for _k, _v in self._last_output[k].items()
                }

    def _predict_all(self, args):
        if self.preprocess:
            args = self.collate_fn(self.transforms(args))

        # this line is the only difference between this and the base class
        # we should consolidate this function once post processing is properly
        # removed out of torchimagemodel
        image_sizes = args.pop("fo_image_size", [(None, None)])

        for k, v in args.items():
            args[k] = v.to(self.device)

        output = self._forward_pass(args)

        # now there is another difference
        # should maybe consider adding callbacks of some sort
        # this just opens more ways for the user to mess up
        self.last_output = output

        if self._output_processor is not None:
            return self._output_processor(
                output,
                image_sizes,
                confidence_thresh=self.config.confidence_thresh,
            )

        else:
            return output

    def _forward_pass(self, args):
        return self._model(
            **args, output_hidden_states=self._output_hidden_states
        )

    def _load_transforms(self, config):
        processor = super()._load_transforms(config)
        return _HFTransformsHandler(
            processor, **(config.transformers_processor_kwargs)
        )

    @property
    def has_collate_fn(self):
        return True

    @staticmethod
    def collate_fn(batch):
        if isinstance(batch, transformers.BatchFeature) or isinstance(
            batch, transformers.BatchEncoding
        ):
            # the transforms batch processed the input
            # no need to collate
            return batch
        keys = batch[0].keys()
        res = {}
        for k in keys:
            # Gather shapes for dimension analysis
            shapes = [b[k].shape for b in batch]
            # Find the max size in each dimension
            max_dims = [
                max(s[d] for s in shapes) for d in range(len(shapes[0]))
            ]

            # Pad each tensor to match the max dimensions
            padded_tensors = []
            for bdict in batch:
                t = bdict[k]
                pad_amounts = []
                for d in reversed(range(len(t.shape))):
                    diff = max_dims[d] - t.shape[d]
                    pad_amounts.extend([0, diff])  # (left_pad, right_pad)
                padded_tensors.append(torch.nn.functional.pad(t, pad_amounts))

            # Concatenate along the first dimension
            res[k] = torch.cat(padded_tensors, dim=0)

        return res


class FiftyOneZeroShotTransformer(
    ZeroShotTransformerEmbeddingsMixin,
    ZeroShotTransformerPromptMixin,
    FiftyOneTransformer,
):
    """FiftyOne wrapper around a ``transformers`` model.

    Args:
        config: a `FiftyOneZeroShotTransformerConfig`
    """

    def __init__(self, config):
        # ensure padding for variable sized prompts
        if config.transformers_processor_kwargs is None:
            config.transformers_processor_kwargs = {}
        if config.transformers_processor_kwargs.get("padding", None) is None:
            config.transformers_processor_kwargs["padding"] = True
        super().__init__(config)
        self._text_prompts = None
        self._input_ids = None

    @property
    def input_ids(self):
        if self._input_ids is not None:
            return self._input_ids
        self._input_ids = self.transforms.processor(
            text=self.text_prompts,
            **(self.transforms.kwargs),
        )["input_ids"]
        return self._input_ids

    @property
    def text_prompts(self):
        if self._text_prompts is None:
            return self._get_text_prompts()
        return self._text_prompts

    def _get_text_prompts(self):
        if self.classes is None and self.config.classes is None:
            return None

        if self.classes is None:
            self.classes = self.config.classes

        text_prompt = (
            self.config.text_prompt if self.config.text_prompt else None
        )
        class_prompts = (
            self.config.class_prompts
            if self.config.class_prompts
            else {c: c for c in self.classes}
        )

        if text_prompt is None:
            # if no text prompt is provided, use the class names as prompts
            self._text_prompts = [f"{class_prompts[c]}" for c in self.classes]
        else:
            self._text_prompts = [
                f"{text_prompt} {class_prompts[c]}" for c in self.classes
            ]

        return self._text_prompts

    def _predict_all(self, args):
        # this solutions is awful
        # it means that text embeddings are recomputed every time
        # I haven't been able to find a way of caching the text embeddings
        # without entirely ripping apart abstraction barriers
        # between FiftyOne and HuggingFace Transformers
        # This is especially painful because the text models
        # are usually much slower than the image models
        if self.preprocess:
            args = {
                "images": args,
                "text": self.text_prompts,  # inject text prompts
            }
        else:
            args.update({"input_ids": self.input_ids})
        return super()._predict_all(args)


class FiftyOneZeroShotTransformerForImageClassificationConfig(
    FiftyOneZeroShotTransformerConfig
):
    def __init__(self, d):
        if (
            d.get("name_or_path", None) is None
            and d.get("model", None) is None
        ):
            d["name_or_path"] = DEFAULT_ZERO_SHOT_CLASSIFICATION_PATH
        super().__init__(d)


class FiftyOneZeroShotTransformerForImageClassification(
    FiftyOneZeroShotTransformer
):
    """FiftyOne wrapper around a ``transformers`` model for zero-shot image
    classification.

    Args:
        config: a `FiftyOneZeroShotTransformerConfig`
    """

    def __init__(self, config):
        # override entry point
        if config.entrypoint_fcn is None:
            config.entrypoint_fcn = "transformers.AutoModelForZeroShotImageClassification.from_pretrained"

        # override output processor
        if config.output_processor_cls is None:
            config.output_processor_cls = (
                "fiftyone.utils.torch.ClassifierOutputProcessor"
            )
        if config.output_processor_args is None:
            config.output_processor_args = {
                "store_logits": True,
                "logits_key": "logits_per_image",
            }

        super().__init__(config)


class FiftyOneTransformerForImageClassificationConfig(
    FiftyOneTransformerConfig
):
    """Configuration for a :class:`FiftyOneTransformerForImageClassification`.

    Args:
        model (None): a ``transformers`` model
        name_or_path (None): the name or path to a checkpoint file to load
    """

    def __init__(self, d):
        if (
            d.get("name_or_path", None) is None
            and d.get("model", None) is None
        ):
            d["name_or_path"] = DEFAULT_CLASSIFICATION_PATH
        super().__init__(d)


class FiftyOneTransformerForImageClassification(FiftyOneTransformer):
    """FiftyOne wrapper around a ``transformers`` model for image
    classification.

    Args:
        config: a `FiftyOneTransformerConfig`
    """

    def __init__(self, config):
        # override entry point
        if config.entrypoint_fcn is None:
            config.entrypoint_fcn = (
                "transformers.AutoModelForImageClassification.from_pretrained"
            )

        # override output processor
        if config.output_processor_cls is None:
            config.output_processor_cls = (
                "fiftyone.utils.torch.ClassifierOutputProcessor"
            )
        if config.output_processor_args is None:
            config.output_processor_args = {
                "store_logits": True,
            }
        super().__init__(config)


class FiftyOneZeroShotTransformerForObjectDetectionConfig(
    FiftyOneZeroShotTransformerConfig
):
    """Configuration for a
    :class:`FiftyOneZeroShotTransformerForObjectDetection`.

    Args:
        model (None): a ``transformers`` model
        name_or_path (None): the name or path to a checkpoint file to load
        text_prompt: the text prompt to use, e.g., ``"A photo of"``
        classes (None): a list of custom classes for zero-shot prediction
    """

    def __init__(self, d):
        if (
            d.get("name_or_path", None) is None
            and d.get("model", None) is None
        ):
            d["name_or_path"] = DEFAULT_ZERO_SHOT_DETECTION_PATH
        super().__init__(d)


class FiftyOneZeroShotTransformerForObjectDetection(
    FiftyOneZeroShotTransformer
):
    """FiftyOne wrapper around a ``transformers`` model for zero shot object
    detection.

    Args:
        config: a `FiftyOneZeroShotTransformerConfig`
    """

    def __init__(self, config):
        # override entry point
        if config.entrypoint_fcn is None:
            config.entrypoint_fcn = "transformers.AutoModelForZeroShotObjectDetection.from_pretrained"

        # override output processor
        if config.output_processor_cls is None:
            config.output_processor_cls = "fiftyone.utils.transformers.TransformersDetectorOutputProcessor"
        super().__init__(config)
        # have to do this after init so processor is loaded
        # I think this is better than instantiating a second one
        # or passing the entire model to the output processor
        self._output_processor.processor = self.transforms.processor
        # ew
        self.transforms.return_image_sizes = True
        self.transforms.text = self.text_prompts
        self.transforms.text_per_image = True

    def _predict_all(self, args):
        # we can skip injecting the text prompts here
        # it's done in the transforms
        # we can get away with it here because unlike
        # zero shot classification, we have to pass
        # the text query for each image
        return FiftyOneTransformer._predict_all(self, args)


class FiftyOneTransformerForObjectDetectionConfig(FiftyOneTransformerConfig):
    """Configuration for a :class:`FiftyOneTransformerForObjectDetection`.

    Args:
        model (None): a ``transformers`` model
        name_or_path (None): the name or path to a checkpoint file to load
    """

    def __init__(self, d):
        if (
            d.get("name_or_path", None) is None
            and d.get("model", None) is None
        ):
            d["name_or_path"] = DEFAULT_DETECTION_PATH
        super().__init__(d)


class FiftyOneTransformerForObjectDetection(FiftyOneTransformer):
    """FiftyOne wrapper around a ``transformers`` model for object detection.

    Args:
        config: a `FiftyOneTransformerConfig`
    """

    def __init__(self, config):
        # override entry point
        if config.entrypoint_fcn is None:
            config.entrypoint_fcn = (
                "transformers.AutoModelForObjectDetection.from_pretrained"
            )

        # override output processor
        if config.output_processor_cls is None:
            config.output_processor_cls = "fiftyone.utils.transformers.TransformersDetectorOutputProcessor"
        super().__init__(config)
        # have to do this after init so processor is loaded
        # I think this is better than instantiating a second one
        # or passing the entire model to the output processor
        self._output_processor.processor = self.transforms.processor
        # ew
        self.transforms.return_image_sizes = True


class FiftyOneZeroShotTransformerForSemanticSegmentationConfig(
    FiftyOneZeroShotTransformerConfig
):
    pass


class FiftyOneZeroShotTransformerForSemanticSegmentation(
    FiftyOneZeroShotTransformer
):
    """FiftyOne wrapper around a ``transformers`` model for zero-shot semantic segmentation.

    Args:
        config: a `FiftyOneZeroShotTransformerForSemanticSegmentationConfig`
    """

    def __init__(self, config):
        # override output processor
        if config.output_processor_cls is None:
            config.output_processor_cls = "fiftyone.utils.transformers.TransformersSemanticSegmentatorOutputProcessor"
        super().__init__(config)


class FiftyOneTransformerForSemanticSegmentationConfig(
    FiftyOneTransformerConfig
):
    """Configuration for a :class:`FiftyOneTransformerForSemanticSegmentation`.

    Args:
        model (None): a ``transformers`` model
        name_or_path (None): the name or path to a checkpoint file to load
    """

    def __init__(self, d):
        if (
            d.get("name_or_path", None) is None
            and d.get("model", None) is None
        ):
            d["name_or_path"] = DEFAULT_SEGMENTATION_PATH
        super().__init__(d)


class FiftyOneTransformerForSemanticSegmentation(FiftyOneTransformer):
    """FiftyOne wrapper around a ``transformers`` model for semantic
    segmentation.

    Args:
        config: a `FiftyOneTransformerConfig`
    """

    def __init__(self, config):
        # override entry point
        if config.entrypoint_fcn is None:
            config.entrypoint_fcn = (
                "transformers.AutoModelForSemanticSegmentation.from_pretrained"
            )

        # override output processor
        if config.output_processor_cls is None:
            config.output_processor_cls = "fiftyone.utils.transformers.TransformersSemanticSegmentatorOutputProcessor"
        super().__init__(config)
        # have to do this after init so processor is loaded
        # I think this is better than instantiating a second one
        # or passing the entire model to the output processor
        self._output_processor.processor = self.transforms.processor
        # ew
        self.transforms.return_image_sizes = True


class TransformersPoseEstimationOutputProcessor(fout.OutputProcessor):
    """Output processor for pose estimation models."""
    
    # COCO keypoint info
    COCO_KEYPOINT_NAMES = [
        "nose", "left_eye", "right_eye", "left_ear", "right_ear",
        "left_shoulder", "right_shoulder", "left_elbow", "right_elbow", 
        "left_wrist", "right_wrist", "left_hip", "right_hip",
        "left_knee", "right_knee", "left_ankle", "right_ankle"
    ]
    
    COCO_SKELETON = [
        [16, 14], [14, 12], [17, 15], [15, 13], [12, 13],
        [6, 12], [7, 13], [6, 7], [6, 8], [7, 9],
        [8, 10], [9, 11], [2, 3], [1, 2], [1, 3],
        [2, 4], [3, 5], [4, 6], [5, 7]
    ]
    
    def __init__(self, classes=None, processor=None):
        super().__init__(classes)
        self._processor = processor
    
    def __call__(self, output, image_sizes, confidence_thresh=None, box_prompts=None):
        """Process pose estimation outputs to FiftyOne format."""
        
        if hasattr(output, 'heatmaps') and isinstance(output.heatmaps, torch.Tensor):
            output.heatmaps = output.heatmaps.detach()
        
        if hasattr(self._processor, 'post_process_pose_estimation'):
            pose_results = self._processor.post_process_pose_estimation(
                output, 
                boxes=box_prompts
            )
        else:
            pose_results = []
            if hasattr(output, 'keypoints'):
                keypoints = output.keypoints
                scores = output.scores if hasattr(output, 'scores') else None
                
                for i in range(keypoints.shape[0]):
                    batch_results = []
                    for j in range(keypoints.shape[1]):
                        person_kpts = keypoints[i, j].detach().cpu().numpy()
                        person_scores = scores[i, j].detach().cpu().numpy() if scores is not None else np.ones(17)
                        batch_results.append({
                            'keypoints': person_kpts,
                            'scores': person_scores
                        })
                    pose_results.append(batch_results)
        
        batch_keypoints = []
        for idx, (pose_result, (width, height)) in enumerate(zip(pose_results, image_sizes)):
            keypoints_list = []
            
            if pose_result and len(pose_result) > 0:
                for person_result in pose_result:
                    if isinstance(person_result, dict):
                        kpts = person_result.get('keypoints', [])
                        scores = person_result.get('scores', [])
                        
                        if isinstance(kpts, torch.Tensor):
                            kpts = kpts.detach().cpu().numpy()
                        if isinstance(scores, torch.Tensor):
                            scores = scores.detach().cpu().numpy()
                        
                        for j, (kp, score) in enumerate(zip(kpts, scores)):
                            if confidence_thresh and score < confidence_thresh:
                                continue
                                
                            if width and height:
                                x_rel = float(kp[0]) / width
                                y_rel = float(kp[1]) / height
                            else:
                                x_rel = float(kp[0])
                                y_rel = float(kp[1])
                            
                            keypoints_list.append(
                                fol.Keypoint(
                                    label=self.COCO_KEYPOINT_NAMES[j] if j < len(self.COCO_KEYPOINT_NAMES) else f"keypoint_{j}",
                                    points=[(x_rel, y_rel)],
                                    confidence=[float(score)]
                                )
                            )
            
            batch_keypoints.append(
                fol.Keypoints(keypoints=keypoints_list, skeleton=self.COCO_SKELETON)
            )
        
        return batch_keypoints


class FiftyOneTransformerForPoseEstimationConfig(FiftyOneTransformerConfig):
    """Configuration for a :class:`FiftyOneTransformerForPoseEstimation`.

    Args:
        model (None): a ``transformers`` model
        name_or_path (None): the name or path to a checkpoint file to load
        detector_name (None): name of detector model from zoo for person detection
        detector_confidence_thresh (0.5): minimum confidence for person detections
    """

    def __init__(self, d):
        if (
            d.get("name_or_path", None) is None
            and d.get("model", None) is None
        ):
            d["name_or_path"] = DEFAULT_POSE_ESTIMATION_PATH
        super().__init__(d)
        
        self.box_prompt_field = self.parse_string(d, "box_prompt_field", default=None)
        
        self.detector_name = self.parse_string(
            d, "detector_name", 
            default="faster-rcnn-resnet50-fpn-coco-torch" if not self.box_prompt_field else None
        )
        self.detector_confidence_thresh = self.parse_number(
            d, "detector_confidence_thresh", default=0.8
        )


class FiftyOneTransformerForPoseEstimation(FiftyOneTransformer):
    """FiftyOne wrapper around a ``transformers`` model for pose estimation.
    
    VitPose models require person detection as a first step, then estimate
    keypoints within each detected person.
    
    Args:
        config: a `FiftyOneTransformerForPoseEstimationConfig`
    """

    
    def __init__(self, config):
        # Set transforms defaults BEFORE calling super().__init__()
        # This follows the project convention per reviewer feedback  
        if config.transforms_fcn is None:
            config.transforms_fcn = "transformers.AutoProcessor.from_pretrained"
        if config.transforms_args is None:
            config.transforms_args = {}
        if "pretrained_model_name_or_path" not in config.transforms_args:
            config.transforms_args["pretrained_model_name_or_path"] = config.name_or_path
        
        if config.entrypoint_fcn is None:
            config.entrypoint_fcn = (
                "transformers.VitPoseForPoseEstimation.from_pretrained"
            )
        
        if config.output_processor_cls is None:
            config.output_processor_cls = TransformersPoseEstimationOutputProcessor
        
        super().__init__(config)
        
        if hasattr(self._output_processor, '_processor'):
            if hasattr(self._transforms, 'processor'):
                self._output_processor._processor = self._transforms.processor
        
        if config.detector_name and not config.box_prompt_field:
            import fiftyone.zoo as foz
            self._detector = foz.load_zoo_model(config.detector_name)
            self._detector_confidence_thresh = config.detector_confidence_thresh
        else:
            self._detector = None
            self._detector_confidence_thresh = config.detector_confidence_thresh    
    def _predict_all(self, imgs):
        """Perform pose estimation on images.
        
        Args:
            imgs: a list of images
        
        Returns:
            a list of :class:`fiftyone.core.labels.Keypoints`
        """
        box_prompts = self._box_prompts if hasattr(self, '_box_prompts') and self._box_prompts else None
        
        if box_prompts is None:
            box_prompts = []
            for img in imgs:
                if isinstance(img, Image.Image):
                    w, h = img.size
                elif isinstance(img, np.ndarray):
                    h, w = img.shape[:2]
                elif isinstance(img, torch.Tensor):
                    if img.dim() == 3:
                        h, w = img.shape[1:]
                    else:
                        h, w = img.shape[:2]
                else:
                    w, h = 640, 480
                
                box_prompts.append([[0, 0, float(w), float(h)]])
        
        if self._preprocess and self._transforms is not None:
            if hasattr(self._transforms, 'processor'):
                processed_batch = []
                for img, boxes in zip(imgs, box_prompts):
                    processed = self._transforms.processor(
                        images=img,
                        boxes=[boxes],
                        return_tensors="pt"
                    )
                    processed_batch.append(processed)
                
                if len(processed_batch) == 1:
                    imgs = processed_batch[0]
                else:
                    pixel_values = torch.cat([p['pixel_values'] for p in processed_batch], dim=0)
                    imgs = {'pixel_values': pixel_values}
                    if 'fo_image_size' in processed_batch[0]:
                        imgs['fo_image_size'] = torch.stack([p['fo_image_size'] for p in processed_batch])
            else:
                processed_imgs = []
                for img in imgs:
                    processed_imgs.append(self._transforms(img))
                
                if self.has_collate_fn:
                    imgs = self.collate_fn(processed_imgs)
        
        image_sizes = imgs.pop("fo_image_size", [(None, None)] * len(imgs))
        
        for k, v in imgs.items():
            if isinstance(v, torch.Tensor):
                imgs[k] = v.to(self.device)
                if self._using_half_precision:
                    imgs[k] = imgs[k].half()
        
        output = self._forward_pass(imgs)
        
        if self._output_processor is not None:
            return self._output_processor(
                output,
                image_sizes,
                confidence_thresh=self.config.confidence_thresh,
                box_prompts=box_prompts
            )
        
        return output
    
    def set_box_prompts(self, boxes):
        """Set box prompts for pose estimation.
        
        Args:
            boxes: detection boxes to use as prompts
        """
        self._box_prompts = boxes
    
    def _forward_pass(self, args):
        """Forward pass with MoE model support."""
        if (hasattr(self._model.config, 'backbone_config') and 
            hasattr(self._model.config.backbone_config, 'num_experts') and 
            self._model.config.backbone_config.num_experts > 1):
            batch_size = args['pixel_values'].shape[0]
            return self._model(
                pixel_values=args['pixel_values'],
                dataset_index=torch.zeros(batch_size, dtype=torch.long).to(self.device)
            )
        else:
            return self._model(**args, output_hidden_states=self._output_hidden_states)
       
class FiftyOneTransformerForDepthEstimationConfig(FiftyOneTransformerConfig):
    """Configuration for a :class:`FiftyOneTransformerForDepthEstimation`.

    Args:
        model (None): a ``transformers`` model
        name_or_path (None): the name or path to a checkpoint file to load
    """

    def __init__(self, d):
        if (
            d.get("name_or_path", None) is None
            and d.get("model", None) is None
        ):
            d["name_or_path"] = DEFAULT_DEPTH_ESTIMATION_PATH
        super().__init__(d)


class FiftyOneTransformerForDepthEstimation(FiftyOneTransformer):
    """FiftyOne wrapper around a ``transformers`` model for depth estimation.

    Args:
        config: a `FiftyOneTransformerConfig`
    """

    def __init__(self, config):
        # override entry point
        if config.entrypoint_fcn is None:
            config.entrypoint_fcn = (
                "transformers.AutoModelForDepthEstimation.from_pretrained"
            )

        # override output processor
        if config.output_processor_cls is None:
            config.output_processor_cls = "fiftyone.utils.transformers.TransformersDepthEstimatorOutputProcessor"
        super().__init__(config)
        # have to do this after init so processor is loaded
        # I think this is better than instantiating a second one
        # or passing the entire model to the output processor
        self._output_processor.processor = self.transforms.processor
        # ew
        self.transforms.return_image_sizes = True

def _has_text_and_image_features(model):
    return hasattr(model.base_model, "get_image_features") and hasattr(
        model.base_model, "get_text_features"
    )


def _has_image_text_retrieval(model):
    module_name = "transformers"
    model_name = _get_model_type_string(model)
    itr_class_name = f"{model_name}ForImageAndTextRetrieval"
    return hasattr(
        __import__(module_name, fromlist=[itr_class_name]),
        itr_class_name,
    )


def _has_detection_model(model):
    module_name = "transformers"
    model_name = _get_base_model_name(model)
    detection_class_name = f"{model_name}ForObjectDetection"
    return hasattr(
        __import__(module_name, fromlist=[detection_class_name]),
        detection_class_name,
    )


def _is_zero_shot_model(model):
    if _has_text_and_image_features(model):
        return True

    if _has_image_text_retrieval(model):
        return True

    return False


def _get_model_type_string(model):
    return str(type(model)).split(".")[-1][:-2]


def _is_transformer_for_image_classification(model):
    return "ForImageClassification" in _get_model_type_string(model)


def _is_transformer_for_object_detection(model):
    return "ForObjectDetection" in _get_model_type_string(model)


def _is_transformer_for_semantic_segmentation(model):
    ms = _get_model_type_string(model)
    return "For" in ms and "Segmentation" in ms


def _is_transformer_for_depth_estimation(model):
    return "ForDepthEstimation" in _get_model_type_string(model)

def _is_transformer_for_pose_estimation(model):
    return "ForPoseEstimation" in _get_model_type_string(model)

def _is_transformer_base_model(model):
    model_type = _get_model_type_string(model)
    return "Model" in model_type and "For" not in model_type


def _get_base_model_name(model):
    return str(type(model)).split(".")[-1][:-2].split("For")[0]


# rather than using partial to avoid pickling issues
class _HFTransformsHandler:
    def __init__(self, processor, return_image_sizes=False, **kwargs):
        self.processor = processor
        self.return_image_sizes = return_image_sizes
        self.kwargs = kwargs
        if "return_tensors" not in kwargs:
            self.kwargs["return_tensors"] = "pt"
        self.text = None  # passed in by model after init
        self.text_per_image = False  # passed in by model after init

    def __call__(self, args):
        if isinstance(args, dict):
            # multiple inputs
            if self.return_image_sizes:
                if args.get("images", None) is not None:
                    image_size = (
                        [_get_image_size(img) for img in args["images"]]
                        if isinstance(args["images"], list)
                        else [_get_image_size(args["images"])]
                    )
            res = self.processor(**args, **self.kwargs)
        else:
            # single input, most likely either a list of images or a single image
            num_images = len(args) if isinstance(args, list) else 1
            if self.return_image_sizes:
                image_size = (
                    [_get_image_size(img) for img in args]
                    if isinstance(args, list)
                    else [_get_image_size(args)]
                )
            if self.text:
                res = self.processor(
                    images=args,
                    text=self.text
                    if not self.text_per_image
                    else [self.text for _ in range(num_images)],
                    **self.kwargs,
                )
            else:
                res = self.processor(images=args, **self.kwargs)

        if self.return_image_sizes:
            res.update({"fo_image_size": torch.tensor(image_size)})

        return res


class TransformersDetectorOutputProcessor(fout.DetectorOutputProcessor):
    """Output processor for HuggingFace Transformers object detection models.

    Args:
        store_logits (False): whether to store the logits in the output
        logits_key ("logits"): the key to use for the logits in the output
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._processor = None
        self._objection_detection_processor = None

    @property
    def processor(self):
        if self._processor is None:
            raise ValueError(
                "Processor not set. Please make sure the processor is set."
            )
        return self._processor

    @processor.setter
    def processor(self, processor):
        self._processor = processor
        if self._processor is not None:
            if hasattr(self._processor, "post_process_object_detection"):
                self._objection_detection_processor = (
                    self._processor.post_process_object_detection
                )
            elif hasattr(
                self._processor, "post_process_grounded_object_detection"
            ):
                self._objection_detection_processor = (
                    self._processor.post_process_grounded_object_detection
                )
            else:
                raise ValueError(
                    "Processor does not have a post_process_object_detection "
                    "or post_process_grounded_object_detection method."
                )

    def __call__(self, output, image_sizes, confidence_thresh=None):
        output = self._objection_detection_processor(
            output, target_sizes=image_sizes, threshold=confidence_thresh or 0
        )
        res = []
        for o, img_sz in zip(output, image_sizes):
            res.append(
                self._parse_output(
                    o,
                    (img_sz[1], img_sz[0]),
                    confidence_thresh=confidence_thresh,
                )
            )
        return res


class TransformersSemanticSegmentatorOutputProcessor(
    fout.SemanticSegmenterOutputProcessor
):
    def __init__(self, *args, **kwargs):
        self.logits_key = kwargs.pop("logits_key", "logits")
        super().__init__(*args, **kwargs)

    def __call__(self, output, image_sizes, confidence_thresh=None):
        return super().__call__(
            {
                "out": output[self.logits_key]
            },  # to be compatible with the base class
            image_sizes,
            confidence_thresh=confidence_thresh,
        )


class TransformersDepthEstimatorOutputProcessor(fout.OutputProcessor):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._processor = None
        self._depth_estimation_post_processor = None

    @property
    def processor(self):
        if self._processor is None:
            raise ValueError(
                "Processor not set. Please make sure the processor is set."
            )
        return self._processor

    @processor.setter
    def processor(self, processor):
        self._processor = processor
        if self._processor is not None:
            if hasattr(self._processor, "post_process_depth_estimation"):
                self._depth_estimation_post_processor = (
                    self._processor.post_process_depth_estimation
                )
            else:
                raise ValueError(
                    "Processor does not have a post_process_depth_estimation."
                )

    def __call__(self, output, image_sizes, confidence_thresh=None):
        output = self._depth_estimation_post_processor(output)
        output = np.array(
            [o["predicted_depth"].detach().cpu().numpy() for o in output]
        )
        output = output / np.max(output, axis=(1, 2), keepdims=True)
        return [fol.Heatmap(map=o) for o in output]
            
def _get_image_size(img):
    if isinstance(img, torch.Tensor):
        height, width = img.size()[-2:]
    elif isinstance(img, Image.Image):
        width, height = img.size
    elif isinstance(img, np.ndarray):
        height, width = img.shape[:2]

    return height, width

MODEL_TYPE_TO_CONFIG_CLASS = {
    "base-model": FiftyOneTransformerConfig,
    "image-classification": FiftyOneTransformerForImageClassificationConfig,
    "object-detection": FiftyOneTransformerForObjectDetectionConfig,
    "semantic-segmentation": FiftyOneTransformerForSemanticSegmentationConfig,
    "depth-estimation": FiftyOneTransformerForDepthEstimationConfig,
    "zero-shot-image-classification": FiftyOneZeroShotTransformerForImageClassificationConfig,
    "zero-shot-object-detection": FiftyOneZeroShotTransformerForObjectDetectionConfig,
    "zero-shot-semantic-segmentation": FiftyOneZeroShotTransformerForSemanticSegmentationConfig,
    "pose-estimation": FiftyOneTransformerForPoseEstimationConfig,
}

MODEL_TYPE_TO_MODEL_CLASS = {
    "base-model": FiftyOneTransformer,
    "image-classification": FiftyOneTransformerForImageClassification,
    "object-detection": FiftyOneTransformerForObjectDetection,
    "semantic-segmentation": FiftyOneTransformerForSemanticSegmentation,
    "depth-estimation": FiftyOneTransformerForDepthEstimation,
    "zero-shot-image-classification": FiftyOneZeroShotTransformerForImageClassification,
    "zero-shot-object-detection": FiftyOneZeroShotTransformerForObjectDetection,
    "zero-shot-semantic-segmentation": FiftyOneZeroShotTransformerForSemanticSegmentation,
    "pose-estimation": FiftyOneTransformerForPoseEstimation,
}
