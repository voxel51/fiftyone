"""
PyTorch utilities.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import functools
import itertools
import logging
import multiprocessing
import os
import pickle
import sys
from typing import Any, Optional, List
import warnings

import cv2
import numpy as np
from PIL import Image

import eta.core.geometry as etag
import eta.core.learning as etal
import eta.core.utils as etau

import fiftyone.core.config as foc
import fiftyone.core.labels as fol
import fiftyone.core.models as fom
import fiftyone.core.media as fomd
import fiftyone.core.odm as foo
import fiftyone.core.utils as fou
import fiftyone.utils.image as foui
import fiftyone.core.collections as focol
import fiftyone.core.view as fov

fou.ensure_torch()

import torch
from torch.utils.data import Dataset
import torch.distributed as dist

import torchvision
from torchvision.models.feature_extraction import create_feature_extractor
from torchvision.transforms import functional as F


logger = logging.getLogger(__name__)


def load_torch_hub_image_model(repo_or_dir, model, hub_kwargs=None, **kwargs):
    """Loads an image model from `PyTorch Hub <https://pytorch.org/hub>`_ as a
    :class:`TorchImageModel`.

    Example usage::

        import fiftyone.utils.torch as fout

        model = fout.load_torch_hub_image_model(
            "facebookresearch/dinov2",
            "dinov2_vits14",
            image_patch_size=14,
            embeddings_layer="head",
        )

        assert model.has_embeddings is True

    Args:
        repo_or_dir: see :attr:`torch:torch.hub.load`
        model: see :attr:`torch:torch.hub.load`
        **kwargs: additional parameters for :class:`TorchImageModelConfig`

    Returns:
        a :class:`TorchImageModel`
    """
    e = {"repo_or_dir": repo_or_dir, "model": model}
    if hub_kwargs:
        e.update(**hub_kwargs)

    d = {
        "entrypoint_fcn": load_torch_hub_raw_model,
        "entrypoint_args": e,
    }
    d.update(**kwargs)

    config = TorchImageModelConfig(d)
    return TorchImageModel(config)


def load_torch_hub_raw_model(*args, **kwargs):
    """Loads a raw model from `PyTorch Hub <https://pytorch.org/hub>`_ as a
    :class:`torch:torch.nn.Module`.

    Example usage::

        import fiftyone.utils.torch as fout

        model = fout.load_torch_hub_raw_model(
            "facebookresearch/dinov2",
            "dinov2_vits14",
        )

        print(type(model))
        # <class 'dinov2.models.vision_transformer.DinoVisionTransformer'>

    Args:
        *args: positional arguments for :attr:`torch:torch.hub.load`
        **kwargs: keyword arguments for :attr:`torch:torch.hub.load`

    Returns:
        a :class:`torch:torch.nn.Module`
    """
    return torch.hub.load(*args, **kwargs)


def find_torch_hub_requirements(repo_or_dir, source="github"):
    """Locates the ``requirements.txt`` file on disk associated with a
    downloaded `PyTorch Hub <https://pytorch.org/hub>`_ model.

    Example usage::

        import fiftyone.utils.torch as fout

        req_path = fout.find_torch_hub_requirements("facebookresearch/dinov2")

        print(req_path)
        # '~/.cache/torch/hub/facebookresearch_dinov2_main/requirements.txt'

    Args:
        repo_or_dir: see :attr:`torch:torch.hub.load`
        source ("github"): see :attr:`torch:torch.hub.load`

    Returns:
        the path to the requirements file on disk
    """
    if source == "github":
        model_dir = torch.hub._get_cache_or_reload(
            repo_or_dir,
            False,
            True,
            "",
            verbose=False,
            skip_validation=True,
        )
    else:
        model_dir = repo_or_dir

    return os.path.join(model_dir, "requirements.txt")


def load_torch_hub_requirements(repo_or_dir, source="github"):
    """Loads the package requirements from the ``requirements.txt`` file on
    disk associated with a downloaded `PyTorch Hub <https://pytorch.org/hub>`_
    model.

    Example usage::

        import fiftyone.utils.torch as fout

        requirements = fout.load_torch_hub_requirements("facebookresearch/dinov2")

        print(requirements)
        # ['torch==2.0.0', 'torchvision==0.15.0', ...]

    Args:
        repo_or_dir: see :attr:`torch:torch.hub.load`
        source ("github"): see :attr:`torch:torch.hub.load`

    Returns:
        a list of requirement strings
    """
    req_path = find_torch_hub_requirements(repo_or_dir, source=source)
    if not os.path.isfile(req_path):
        logger.warning("No requirements.txt file found for '%s'", repo_or_dir)
        return []

    requirements = []
    with open(req_path, "r") as f:
        for line in f:
            line = _strip_comments(line)
            if line:
                requirements.append(line)

    return requirements


def _strip_comments(requirement_str):
    chunks = []
    for chunk in requirement_str.strip().split():
        if chunk.startswith("#"):
            break

        chunks.append(chunk)

    return " ".join(chunks)


def install_torch_hub_requirements(
    repo_or_dir, source="github", error_level=None
):
    """Installs the package requirements from the ``requirements.txt`` file on
    disk associated with a downloaded `PyTorch Hub <https://pytorch.org/hub>`_
    model.

    Example usage::

        import fiftyone.utils.torch as fout

        fout.install_torch_hub_requirements("facebookresearch/dinov2")

    Args:
        repo_or_dir: see :attr:`torch:torch.hub.load`
        source ("github"): see :attr:`torch:torch.hub.load`
        error_level (None): the error level to use, defined as:

            -   0: raise error if the install fails
            -   1: log warning if the install fails
            -   2: ignore install fails

            By default, ``fiftyone.config.requirement_error_level`` is used
    """
    for req_str in load_torch_hub_requirements(repo_or_dir, source=source):
        fou.install_package(req_str, error_level=error_level)


def ensure_torch_hub_requirements(
    repo_or_dir, source="github", error_level=None, log_success=False
):
    """Verifies that the package requirements from the ``requirements.txt``
    file on disk associated with a downloaded
    `PyTorch Hub <https://pytorch.org/hub>`_ model are installed.

    Example usage::

        import fiftyone.utils.torch as fout

        fout.ensure_torch_hub_requirements("facebookresearch/dinov2")

    Args:
        repo_or_dir: see :attr:`torch:torch.hub.load`
        source ("github"): see :attr:`torch:torch.hub.load`
        error_level (None): the error level to use, defined as:

            -   0: raise error if requirement is not satisfied
            -   1: log warning if requirement is not satisfied
            -   2: ignore unsatisifed requirements

            By default, ``fiftyone.config.requirement_error_level`` is used
        log_success (False): whether to generate a log message if a requirement
            is satisfied
    """
    for req_str in load_torch_hub_requirements(repo_or_dir, source=source):
        fou.ensure_package(
            req_str, error_level=error_level, log_success=log_success
        )


class GetItem(object):
    """A class that defines how to load the input for a model.

    Models that implement the :class:`fiftyone.core.models.SupportsGetItem`
    mixin use this class to define how :class:`FiftyOneTorchDataset` should
    load their inputs.

    The :meth:`__call__` method should accept a dictionary mapping the keys
    defined by :attr:`required_keys` to values extracted from the input
    :class:`fiftyone.core.sample.Sample` instance according to the mapping
    defined by :attr:`field_mapping`.

    Args:
        field_mapping (None): a user-supplied dict mapping keys in
            :attr:`required_keys` to field names of their dataset that contain
            the required values
    """

    def __init__(self, field_mapping=None, **kwargs):
        super().__init__(**kwargs)

        # By default, we assume that any keys not specified by `field_mapping`
        # will exist under field names that exactly match `required_keys`
        self._field_mapping = {k: k for k in self.required_keys}

        # This updates `_field_mapping` via the attribute setter
        self.field_mapping = field_mapping

    def __call__(self, d):
        """Prepares the model input for a given sample's data.

        Args:
            d: a dict mapping the :meth:`required_keys` to values from the
                sample being processed

        Returns:
            the model input
        """
        raise NotImplementedError("subclasses must implement __call__()")

    @property
    def required_keys(self):
        """The list of keys that must exist on the dicts provided to the
        :meth:`__call__` method at runtime.

        The user supplies the field names from which to extract these values
        from their samples via :attr:`field_mapping`.
        """
        raise NotImplementedError("subclasses must implement required_keys")

    @property
    def field_mapping(self):
        """A user-supplied dictionary mappings keys in :attr:`required_keys`
        to field names of their dataset that contain the required values.
        """
        return self._field_mapping

    @field_mapping.setter
    def field_mapping(self, value):
        if value is None:
            return

        for k, v in value.items():
            if k not in self.required_keys:
                raise ValueError(
                    f"Unknown key '{k}'. The supported keys are {self.required_keys}"
                )

            self._field_mapping[k] = v


class TorchEmbeddingsMixin(fom.EmbeddingsMixin):
    """Mixin for Torch models that can generate embeddings.

    Args:
        model: the Torch model, a :class:`torch:torch.nn.Module`
        layer_name (None): the name of the embeddings layer whose output to
            save, or ``None`` if this model instance should not expose
            embeddings. Prepend ``"<"`` to save the input tensor instead
        as_feature_extractor (False): whether to operate the model as a feature
            extractor. If ``layer_name`` is provided, this layer is passed to
            torchvision's ``create_feature_extractor()`` function. If no
            ``layer_name`` is provided, the model's output is used as-is for
            feature extraction
    """

    def __init__(self, model, layer_name=None, as_feature_extractor=False):
        if as_feature_extractor:
            if layer_name is not None:
                self._model = create_feature_extractor(
                    model, return_nodes=[layer_name]
                )

            embeddings_layer = None
        elif layer_name is not None:
            embeddings_layer = SaveLayerTensor(model, layer_name)
        else:
            embeddings_layer = None

        self._embeddings_layer = embeddings_layer
        self._as_feature_extractor = as_feature_extractor

    @property
    def has_embeddings(self):
        return self._embeddings_layer is not None or self._as_feature_extractor

    def embed(self, arg):
        if isinstance(arg, torch.Tensor):
            args = arg.unsqueeze(0)
        else:
            args = [arg]

        if self._as_feature_extractor:
            return self._predict_all(args)[0]

        self._predict_all(args)
        return self.get_embeddings()[0]

    def embed_all(self, args):
        if self._as_feature_extractor:
            return self._predict_all(args)

        self._predict_all(args)
        return self.get_embeddings()

    def get_embeddings(self):
        if not self.has_embeddings:
            raise ValueError("This model instance does not expose embeddings")

        embeddings = self._embeddings_layer.tensor.detach().cpu().numpy()
        return embeddings.astype(float, copy=False)

    def _predict_all(self, args):
        """Applies a forward pass to the given iterable of data and returns
        the raw model output with no processing applied.

        Args:
            args: an iterable of data. See :meth:`predict_all` for details

        Returns:
            the raw output of the model
        """
        raise NotImplementedError("subclasses must implement _predict_all()")


class TorchImageModelConfig(foc.Config):
    """Configuration for running a :class:`TorchImageModel`.

    Models are represented by this class via the following three components:

    1.  Model::

            # Directly specify a model
            model

            # Load model from an entrypoint
            model = entrypoint_fcn(**entrypoint_args)

    2.  Transforms::

            # Directly provide transforms
            transforms

            # Load transforms from a function
            transforms = transforms_fcn(**transforms_args)

            # Use the `image_XXX` parameters defined below to build a transform
            transforms = build_transforms(image_XXX, ...)

    3.  OutputProcessor::

            # Directly provide an OutputProcessor
            output_processor

            # Load an OutputProcessor from a function
            output_processor = output_processor_cls(**output_processor_args)

    Given these components, inference happens as follows::

        def predict_all(imgs):
            imgs = [transforms(img) for img in imgs]
            if not raw_inputs:
                imgs = torch.stack(imgs)

            output = model(imgs)
            return output_processor(output, ...)

    Args:
        model (None): a :class:`torch:torch.nn.Module` instance to use
        entrypoint_fcn (None): a function or string like
            ``"torchvision.models.inception_v3"`` specifying the entrypoint
            function that loads the model
        entrypoint_args (None): a dictionary of arguments for
            ``entrypoint_fcn``
        transforms (None): a preprocessing transform to apply
        transforms_fcn (None): a function or string like
            ``"torchvision.models.Inception_V3_Weights.DEFAULT.transforms"``
            specifying a function that returns a preprocessing transform
            function to apply
        transforms_args (None): a dictionary of arguments for
            ``transforms_args``
        ragged_batches (None): whether the provided ``transforms`` or
            ``transforms_fcn`` may return tensors of different sizes. This must
            be set to ``False`` to enable batch inference, if it is desired
        raw_inputs (None): whether to feed the raw list of images to the model
            rather than stacking them as a Torch tensor
        output_processor (None): an :class:`OutputProcessor` instance to use
        output_processor_cls (None): a class or string like
            ``"fifytone.utils.torch.ClassifierOutputProcessor"`` specifying the
            :class:`OutputProcessor` to use
        output_processor_args (None): a dictionary of arguments for
            ``output_processor_cls(classes=classes, **kwargs)``
        confidence_thresh (None): an optional confidence threshold apply to any
            applicable predictions generated by the model
        filter_classes (None): an optional iterable of classes to use to filter
            any applicable predictions generated by the model
        classes (None): a list of class names for the model, if applicable
        labels_string (None): a comma-separated list of the class names for the
            model, if applicable
        labels_path (None): the path to the labels map for the model, if
            applicable
        mask_targets (None): a mask targets dict for the model, if applicable
        mask_targets_path (None): the path to a mask targets map for the model,
            if applicable
        skeleton (None): a keypoint skeleton dict for the model, if applicable
        image_min_size (None): resize the input images during preprocessing, if
            necessary, so that the image dimensions are at least this
            ``(width, height)``
        image_min_dim (None): resize input images during preprocessing, if
            necessary, so that the smaller image dimension is at least this
            value
        image_max_size (None): resize the input images during preprocessing, if
            necessary, so that the image dimensions are at most this
            ``(width, height)``
        image_max_dim (None): resize input images during preprocessing, if
            necessary, so that the largest image dimension is at most this
            value.
        image_size (None): a ``(width, height)`` to which to resize the input
            images during preprocessing
        image_dim (None): resize the smaller input dimension to this value
            during preprocessing
        image_patch_size (None): crop the input images during preprocessing, if
            necessary, so that the image dimensions are a multiple of this
            patch size
        image_mean (None): a 3-array of mean values in ``[0, 1]`` for
            preprocessing the input images
        image_std (None): a 3-array of std values in ``[0, 1]`` for
            preprocessing the input images
            inputs that are lists of Tensors
        embeddings_layer (None): the name of a layer whose output to expose as
            embeddings. Prepend ``"<"`` to save the input tensor instead
        as_feature_extractor (False): whether to operate the model as a feature
            extractor. If ``embeddings_layer`` is provided, this layer is
            passed to torchvision's ``create_feature_extractor()`` function. If
            no ``embeddings_layer`` is provided, the model's output is used
            as-is for feature extraction
        use_half_precision (None): whether to use half precision (only
            supported when using GPU)
        cudnn_benchmark (None): a value to use for
            :attr:`torch:torch.backends.cudnn.benchmark` while the model is
            running
        device (None): a string specifying the device to use, eg
            ``("cuda:0", "mps", "cpu")``. By default, CUDA is used if
            available, else CPU is used
    """

    def __init__(self, d):
        self.model = self.parse_raw(d, "model", default=None)
        self.entrypoint_fcn = self.parse_raw(d, "entrypoint_fcn", default=None)
        self.entrypoint_args = self.parse_dict(
            d, "entrypoint_args", default=None
        )
        self.transforms = self.parse_raw(d, "transforms", default=None)
        self.transforms_fcn = self.parse_raw(d, "transforms_fcn", default=None)
        self.transforms_args = self.parse_dict(
            d, "transforms_args", default=None
        )
        self.ragged_batches = self.parse_bool(
            d, "ragged_batches", default=None
        )
        self.raw_inputs = self.parse_bool(d, "raw_inputs", default=None)
        self.output_processor = self.parse_raw(
            d, "output_processor", default=None
        )
        self.output_processor_cls = self.parse_raw(
            d, "output_processor_cls", default=None
        )
        self.output_processor_args = self.parse_dict(
            d, "output_processor_args", default=None
        )
        self.confidence_thresh = self.parse_number(
            d, "confidence_thresh", default=None
        )
        self.filter_classes = self.parse_array(
            d, "filter_classes", default=None
        )
        self.classes = self.parse_array(d, "classes", default=None)
        self.labels_string = self.parse_string(
            d, "labels_string", default=None
        )
        self.labels_path = self.parse_string(d, "labels_path", default=None)
        self.mask_targets = self.parse_dict(d, "mask_targets", default=None)
        self.mask_targets_path = self.parse_string(
            d, "mask_targets_path", default=None
        )
        self.skeleton = self.parse_dict(d, "skeleton", default=None)
        self.image_min_size = self.parse_array(
            d, "image_min_size", default=None
        )
        self.image_min_dim = self.parse_number(
            d, "image_min_dim", default=None
        )
        self.image_max_size = self.parse_array(
            d, "image_max_size", default=None
        )
        self.image_max_dim = self.parse_number(
            d, "image_max_dim", default=None
        )
        self.image_size = self.parse_array(d, "image_size", default=None)
        self.image_dim = self.parse_number(d, "image_dim", default=None)
        self.image_patch_size = self.parse_number(
            d, "image_patch_size", default=None
        )
        self.image_mean = self.parse_array(d, "image_mean", default=None)
        self.image_std = self.parse_array(d, "image_std", default=None)
        self.embeddings_layer = self.parse_string(
            d, "embeddings_layer", default=None
        )
        self.as_feature_extractor = self.parse_bool(
            d, "as_feature_extractor", default=False
        )
        self.use_half_precision = self.parse_bool(
            d, "use_half_precision", default=None
        )
        self.cudnn_benchmark = self.parse_bool(
            d, "cudnn_benchmark", default=None
        )
        self.device = self.parse_string(d, "device", default=None)


class ImageGetItem(GetItem):
    """A :class:`GetItem` that loads images to feed to :class:`TorchImageModel`
    instances.

    By default, images are loaded from the ``"filepath"`` field of samples, but
    users can override this by providing
    ``field_mapping={"filepath": "another_field"}``.

    Args:
        field_mapping (None): the user-supplied dict mapping keys in
            :attr:`required_keys` to field names of their dataset that contain
            the required values
        transform (None): a ``torchvision.transforms`` function to apply
        raw_inputs (False): whether to feed the raw list of images to the model
            rather than stacking them as a Torch tensor
        using_half_precision (False): whether the model is using half precision
        use_numpy (False): whether to use numpy arrays rather than PIL images
            and Torch tensors when loading data
    """

    def __init__(
        self,
        field_mapping=None,
        transform=None,
        raw_inputs=False,
        using_half_precision=False,
        use_numpy=False,
        **kwargs,
    ):
        super().__init__(field_mapping=field_mapping, **kwargs)

        self.transform = transform
        self.raw_inputs = raw_inputs
        self.using_half_precision = using_half_precision
        self.use_numpy = use_numpy

    def __call__(self, d):
        img = _load_image(
            d["filepath"],
            use_numpy=self.use_numpy,
            force_rgb=True,
        )

        if self.transform is not None:
            img = self.transform(img)

        if self.raw_inputs:
            return img

        if self.using_half_precision and torch.is_tensor(img):
            img = img.half()

        return img

    @property
    def required_keys(self):
        return ["filepath"]


class TorchImageModel(
    fom.SupportsGetItem,
    TorchEmbeddingsMixin,
    fom.TorchModelMixin,
    fom.LogitsMixin,
    fom.Model,
):
    """Wrapper for evaluating a Torch model on images.

    See :ref:`this page <model-zoo-custom-models>` for example usage.

    Args:
        config: an :class:`TorchImageModelConfig`
    """

    def __init__(self, config):
        self.config = config

        device = self.config.device
        if device is None:
            device = "cuda:0" if torch.cuda.is_available() else "cpu"

        # Device details
        self._device = torch.device(device)
        self._using_gpu = self._device.type in ("cuda", "mps")
        self._using_half_precision = self.config.use_half_precision
        self._no_grad = None
        self._benchmark_orig = None

        # Load model
        self._download_model(config)
        self._model = self._load_model(config)

        # Build transforms
        transforms, ragged_batches = self._build_transforms(config)
        self._transforms = transforms
        self._ragged_batches = ragged_batches
        self._preprocess = True
        if self.has_collate_fn and self.ragged_batches:
            raise ValueError(
                "Cannot use collate_fn while ragged_batches is True. "
                "Set `ragged_batches=False` to use collate_fn. "
                "While the inputs to collate_fn may be ragged, "
                "the model has to flag itself as ragged_batches=False "
                "to enable proper dataloader support in apply_model."
            )

        # Parse model details
        self._classes = self._parse_classes(config)
        self._mask_targets = self._parse_mask_targets(config)
        self._skeleton = self._parse_skeleton(config)

        # Build output processor
        self._output_processor = self._build_output_processor(config)

        fom.LogitsMixin.__init__(self)
        TorchEmbeddingsMixin.__init__(
            self,
            self._model,
            layer_name=self.config.embeddings_layer,
            as_feature_extractor=self.config.as_feature_extractor,
        )

    def __enter__(self):
        if self.config.cudnn_benchmark is not None:
            self._benchmark_orig = torch.backends.cudnn.benchmark
            torch.backends.cudnn.benchmark = self.config.cudnn_benchmark

        self._no_grad = torch.no_grad()
        self._no_grad.__enter__()
        return self

    def __exit__(self, *args):
        if self.config.cudnn_benchmark is not None:
            torch.backends.cudnn.benchmark = self._benchmark_orig
            self._benchmark_orig = None

        if self._no_grad is not None:
            self._no_grad.__exit__(*args)
            self._no_grad = None

    def build_get_item(self, field_mapping=None):
        return ImageGetItem(
            transform=self._transforms,
            raw_inputs=self.config.raw_inputs,
            using_half_precision=self._using_half_precision,
            use_numpy=False,
            field_mapping=field_mapping,
        )

    @property
    def media_type(self):
        """The media type processed by the model."""
        return "image"

    @property
    def has_logits(self):
        """Whether this instance can generate logits."""
        return isinstance(self._output_processor, ClassifierOutputProcessor)

    @property
    def ragged_batches(self):
        """Whether :meth:`transforms` may return tensors of different sizes.
        If True, then passing ragged lists of images to :meth:`predict_all` may
        not be not allowed.
        """
        return self._ragged_batches

    @property
    def transforms(self):
        """A ``torchvision.transforms`` function that will be applied to each
        input before prediction, if any.
        """
        return self._transforms

    @property
    def has_collate_fn(self):
        """Whether this model has a custom collate function.

        Set this to ``True`` if you want :meth:`collate_fn` to be used during
        inference.
        """
        return False

    @staticmethod
    def collate_fn(batch):
        """The collate function to use when creating dataloaders for this
        model.

        In order to enable this functionality, the model's
        :meth:`has_collate_fn` property must return ``True``.

        By default, this is the default collate function for
        :class:`torch:torch.utils.data.DataLoader`, but subclasses can override
        this method as necessary.

        Note that this function must be serializable so it is compatible
        with multiprocessing for dataloaders.

        Args:
            batch: a list of items to collate

        Returns:
            the collated batch, which will be fed directly to the model
        """
        return torch.utils.data.dataloader.default_collate(batch)

    @property
    def preprocess(self):
        """Whether to apply preprocessing transforms for inference, if any."""
        return self._preprocess

    @preprocess.setter
    def preprocess(self, value):
        self._preprocess = value

    @property
    def using_gpu(self):
        """Whether the model is using GPU."""
        return self._using_gpu

    @property
    def device(self):
        """The :class:`torch:torch.torch.device` that the model is using."""
        return self._device

    @property
    def using_half_precision(self):
        """Whether the model is using half precision."""
        return self._using_half_precision

    @property
    def classes(self):
        """The list of class labels for the model, if known."""
        return self._classes

    @property
    def num_classes(self):
        """The number of classes for the model, if known."""
        if self._classes is not None:
            return len(self._classes)

        return None

    @property
    def mask_targets(self):
        """The mask targets for the model, if any."""
        return self._mask_targets

    @property
    def skeleton(self):
        """The keypoint skeleton for the model, if any."""
        return self._skeleton

    def predict(self, img):
        """Performs prediction on the given image.

        Args:
            img: the image to process, which can be any of the following:

                - A PIL image
                - A uint8 numpy array (HWC)
                - A Torch tensor (CHW)

        Returns:
            a :class:`fiftyone.core.labels.Label` instance or dict of
            :class:`fiftyone.core.labels.Label` instances containing the
            predictions
        """
        if isinstance(img, torch.Tensor):
            imgs = img.unsqueeze(0)
        else:
            imgs = [img]

        return self._predict_all(imgs)[0]

    def predict_all(self, imgs):
        """Performs prediction on the given batch of images.

        Args:
            imgs: the batch of images to process, which can be any of the
                following:

                - A list of PIL images
                - A list of uint8 numpy arrays (HWC)
                - A list of Torch tensors (CHW)
                - A uint8 numpy tensor (NHWC)
                - A Torch tensor (NCHW)

        Returns:
            a list of :class:`fiftyone.core.labels.Label` instances or a list
            of dicts of :class:`fiftyone.core.labels.Label` instances
            containing the predictions
        """
        return self._predict_all(imgs)

    def _predict_all(self, imgs):
        if self._preprocess and self._transforms is not None:
            imgs = [self._transforms(img) for img in imgs]
            if self.has_collate_fn:
                # models that have collate_fn defined
                # will want to use it when doing _predict_all
                # without a dataloader
                imgs = self.collate_fn(imgs)

        height, width = None, None

        if self.config.raw_inputs:
            # Feed images as list
            if self._output_processor is not None:
                img = imgs[0]
                if isinstance(img, torch.Tensor):
                    height, width = img.size()[-2:]
                elif isinstance(img, Image.Image):
                    width, height = img.size
                elif isinstance(img, np.ndarray):
                    height, width = img.shape[:2]
        else:
            # Feed images as stacked Tensor
            if isinstance(imgs, (list, tuple)):
                imgs = torch.stack(imgs)

            height, width = imgs.size()[-2:]

            imgs = imgs.to(self._device)
            if self._using_half_precision:
                imgs = imgs.half()

        output = self._forward_pass(imgs)

        if self._output_processor is None:
            if isinstance(output, torch.Tensor):
                output = output.detach().cpu().numpy()

            return output

        if self.has_logits:
            self._output_processor.store_logits = self.store_logits

        return self._output_processor(
            output,
            (width, height),
            confidence_thresh=self.config.confidence_thresh,
            classes=self.config.filter_classes,
        )

    def _forward_pass(self, imgs):
        return self._model(imgs)

    def _parse_classes(self, config):
        if config.classes is not None:
            return config.classes

        if config.labels_string is not None:
            return config.labels_string.split(",")

        if config.labels_path is not None:
            labels_path = fou.fill_patterns(config.labels_path)
            labels_map = etal.load_labels_map(labels_path)
            return etal.get_class_labels(labels_map)

        mask_targets = self._parse_mask_targets(config)
        if mask_targets is not None:
            return sorted(v for k, v in mask_targets.items() if v != 0)

        return None

    def _parse_mask_targets(self, config):
        if config.mask_targets is not None:
            return config.mask_targets

        if config.mask_targets_path is not None:
            mask_targets_path = fou.fill_patterns(config.mask_targets_path)
            return etal.load_labels_map(mask_targets_path)

        if (
            hasattr(self, "_classes")
            and self._classes is not None
            and config.output_processor_args
        ):
            if config.output_processor_args.get("no_background_cls", False):
                mask_targets = {
                    idx + 1: val for idx, val in enumerate(self.classes)
                }
            else:
                # Class at index 0 is treated as background class
                mask_targets = {
                    idx: val for idx, val in enumerate(self.classes)
                }
            return mask_targets

        return None

    def _parse_skeleton(self, config):
        if config.skeleton is not None:
            return foo.KeypointSkeleton.from_dict(config.skeleton)

        return None

    def _download_model(self, config):
        pass

    def _load_model(self, config):
        if config.model is not None:
            model = config.model
        else:
            entrypoint_fcn = config.entrypoint_fcn

            if etau.is_str(entrypoint_fcn):
                entrypoint_fcn = etau.get_function(entrypoint_fcn)

            kwargs = config.entrypoint_args or {}
            model = entrypoint_fcn(**kwargs)

        model = model.to(self._device)
        if self.using_half_precision:
            model = model.half()

        model.eval()

        return model

    def _build_transforms(self, config):
        if config.ragged_batches is not None:
            ragged_batches = config.ragged_batches
        else:
            ragged_batches = True

        if config.transforms is not None:
            return config.transforms, ragged_batches

        if config.transforms_fcn is not None:
            transforms = self._load_transforms(config)
            return transforms, ragged_batches

        if config.raw_inputs:
            return None, ragged_batches

        transforms = [ToPILImage()]

        if config.image_size:
            ragged_batches = False
            transforms.append(torchvision.transforms.Resize(config.image_size))
        elif config.image_dim:
            transforms.append(torchvision.transforms.Resize(config.image_dim))
        elif config.image_patch_size:
            if config.image_min_dim:
                transforms.append(MinResize(config.image_min_dim))
            transforms.append(PatchSize(config.image_patch_size))
        else:
            if config.image_min_size:
                transforms.append(MinResize(config.image_min_size))
            elif config.image_min_dim:
                transforms.append(MinResize(config.image_min_dim))

            if config.image_max_size:
                transforms.append(MaxResize(config.image_max_size))
            elif config.image_max_dim:
                transforms.append(MaxResize(config.image_max_dim))

        # Converts PIL/numpy (HWC) to Torch tensor (CHW) in [0, 1]
        transforms.append(torchvision.transforms.ToTensor())

        if config.image_mean or config.image_std:
            if not config.image_mean or not config.image_std:
                raise ValueError(
                    "Both `image_mean` and `image_std` must be provided"
                )

            transforms.append(
                torchvision.transforms.Normalize(
                    config.image_mean, config.image_std
                )
            )

        transforms = torchvision.transforms.Compose(transforms)

        return transforms, ragged_batches

    def _load_transforms(self, config):
        transforms_fcn = config.transforms_fcn

        if etau.is_str(transforms_fcn):
            transforms_fcn = etau.get_function(transforms_fcn)

        kwargs = config.transforms_args or {}
        return transforms_fcn(**kwargs)

    def _build_output_processor(self, config):
        if config.output_processor is not None:
            return config.output_processor

        output_processor_cls = config.output_processor_cls

        if output_processor_cls is None:
            return None

        if etau.is_str(output_processor_cls):
            output_processor_cls = etau.get_class(output_processor_cls)

        kwargs = config.output_processor_args or {}
        return output_processor_cls(classes=self._classes, **kwargs)


class TorchSamplesMixin(fom.SamplesMixin):
    def predict(self, img, sample=None):
        if isinstance(img, torch.Tensor):
            imgs = img.unsqueeze(0)
        else:
            imgs = [img]

        if sample is not None:
            samples = [sample]
        else:
            samples = None

        return self.predict_all(imgs, samples=samples)[0]


class ToPILImage(object):
    """Transform that converts a tensor or ndarray to a PIL image, while also
    allowing PIL images to passthrough.
    """

    def __call__(self, img):
        if isinstance(img, Image.Image):
            return img

        return F.to_pil_image(img)


class MinResize(object):
    """Transform that resizes the PIL image or torch Tensor, if necessary, so
    that its minimum dimensions are at least the specified size.

    Args:
        min_output_size: desired minimum output dimensions. Can either be a
            ``(min_height, min_width)`` tuple or a single ``min_dim``
        interpolation (None): optional interpolation mode. Passed directly to
            :func:`torchvision:torchvision.transforms.functional.resize`
    """

    def __init__(self, min_output_size, interpolation=None):
        if isinstance(min_output_size, int):
            min_output_size = (min_output_size, min_output_size)

        self.min_output_size = min_output_size
        self.interpolation = interpolation

        self._kwargs = {}
        if interpolation is not None:
            self._kwargs["interpolation"] = interpolation

    def __call__(self, pil_image_or_tensor):
        if isinstance(pil_image_or_tensor, torch.Tensor):
            h, w = list(pil_image_or_tensor.size())[-2:]
        else:
            w, h = pil_image_or_tensor.size

        minh, minw = self.min_output_size

        if h >= minh and w >= minw:
            return pil_image_or_tensor

        alpha = max(minh / h, minw / w)
        size = (int(round(alpha * h)), int(round(alpha * w)))
        return F.resize(pil_image_or_tensor, size, **self._kwargs)


class MaxResize(object):
    """Transform that resizes the PIL image or torch Tensor, if necessary, so
    that its maximum dimensions are at most the specified size.

    Args:
        max_output_size: desired maximum output dimensions. Can either be a
            ``(max_height, max_width)`` tuple or a single ``max_dim``
        interpolation (None): optional interpolation mode. Passed directly to
            :func:`torchvision:torchvision.transforms.functional.resize`
    """

    def __init__(self, max_output_size, interpolation=None):
        if isinstance(max_output_size, int):
            max_output_size = (max_output_size, max_output_size)

        self.max_output_size = max_output_size
        self.interpolation = interpolation

        self._kwargs = {}
        if interpolation is not None:
            self._kwargs["interpolation"] = interpolation

    def __call__(self, pil_image_or_tensor):
        if isinstance(pil_image_or_tensor, torch.Tensor):
            h, w = list(pil_image_or_tensor.size())[-2:]
        else:
            w, h = pil_image_or_tensor.size

        maxh, maxw = self.max_output_size

        if h <= maxh and w <= maxw:
            return pil_image_or_tensor

        alpha = min(maxh / h, maxw / w)
        size = (int(round(alpha * h)), int(round(alpha * w)))
        return F.resize(pil_image_or_tensor, size, **self._kwargs)


class PatchSize(object):
    """Transform that center crops the PIL image or torch Tensor, if necessary,
    so that its dimensions are multiples of the specified patch size.

    Args:
        patch_size: the patch size
    """

    def __init__(self, patch_size):
        self.patch_size = patch_size

    def __call__(self, pil_image_or_tensor):
        if isinstance(pil_image_or_tensor, torch.Tensor):
            h, w = list(pil_image_or_tensor.size())[-2:]
        else:
            w, h = pil_image_or_tensor.size

        hh = (h // self.patch_size) * self.patch_size
        ww = (w // self.patch_size) * self.patch_size

        if hh != h or ww != w:
            return F.center_crop(pil_image_or_tensor, (hh, ww))

        return pil_image_or_tensor


class SaveLayerTensor(object):
    """Callback that saves the input/output tensor of the specified layer of a
    Torch model during each ``forward()`` call.

    Args:
        model: the Torch model, a :class:`torch:torch.nn.Module`
        layer_name: the name of the layer whose output to save. Prepend ``"<"``
            to save the input tensor instead
    """

    def __init__(self, model, layer_name):
        self._tensor = None
        self._save_input = None
        self._setup(model, layer_name)

    def __call__(self, module, module_in, module_out):
        self._tensor = module_in[0] if self._save_input else module_out

    @property
    def tensor(self):
        """The tensor saved from the last ``forward()`` call."""
        return self._tensor

    def _setup(self, model, layer_name):
        if layer_name.startswith("<"):
            self._save_input = True
            layer_name = layer_name[1:]
        else:
            self._save_input = False

        _layer = None
        for name, layer in model.named_modules():
            if name == layer_name:
                _layer = layer

        if _layer is None:
            raise ValueError("No layer found with name %s" % layer_name)

        _layer.register_forward_hook(self)


class OutputProcessor(object):
    """Interface for processing the outputs of Torch models.

    Args:
        classes (None): the list of class labels for the model. This may not be
            required or used by some models
    """

    def __init__(self, classes=None, **kwargs):
        pass

    def __call__(
        self,
        output,
        frame_size,
        confidence_thresh=None,
        classes=None,
        **kwargs,
    ):
        """Parses the model output.

        Args:
            output: the model output for the batch of predictions
            frame_size: the ``(width, height)`` of the frames in the batch
            confidence_thresh (None): an optional confidence threshold to use
                to filter any applicable predictions
            classes (None): an optional iterable of classes to use to filter
                any applicable predictions
            **kwargs: unused kwargs

        Returns:
            a list of :class:`fiftyone.core.labels.Label` instances
        """
        raise NotImplementedError("subclass must implement __call__")


class ClassifierOutputProcessor(OutputProcessor):
    """Output processor for single label classifiers.

    Args:
        classes (None): the list of class labels for the model
        store_logits (False): whether to store logits in the model outputs
    """

    def __init__(self, classes=None, store_logits=False, logits_key="logits"):
        if classes is None:
            raise ValueError(
                "This model requires class labels, but none were available"
            )

        self.classes = classes
        self.store_logits = store_logits
        self.logits_key = logits_key

    def __call__(
        self,
        output,
        _,
        confidence_thresh=None,
        classes=None,
        **kwargs,
    ):
        """Parses the model output.

        Args:
            output: either a ``FloatTensor[N, M]`` containing the logits for
                ``N`` images and ``M`` classes, or a dict with a ``"logits"``
                key containing the logits
            _: unused argument
            confidence_thresh (None): an optional confidence threshold to use
                to filter any applicable predictions
            classes (None): an optional iterable of classes to use to filter
                any applicable predictions
            **kwargs: unused kwargs

        Returns:
            a list of :class:`fiftyone.core.labels.Classification` instances
        """
        if isinstance(output, dict):
            output = output[self.logits_key]

        logits = output.detach().cpu().numpy()

        predictions = np.argmax(logits, axis=1)
        odds = np.exp(logits)
        odds /= np.sum(odds, axis=1, keepdims=True)
        scores = np.max(odds, axis=1)

        if not self.store_logits:
            logits = itertools.repeat(None)

        preds = []
        for prediction, score, _logits in zip(predictions, scores, logits):
            label = self.classes[prediction]
            if confidence_thresh is not None and score < confidence_thresh:
                classification = fol.Classification()
            elif classes is not None and label not in classes:
                classification = fol.Classification()
            else:
                classification = fol.Classification(
                    label=label,
                    confidence=score,
                )
                if self.store_logits:
                    classification.logits = _logits

            preds.append(classification)

        return preds


class DetectorOutputProcessor(OutputProcessor):
    """Output processor for object detectors.

    Args:
        classes (None): the list of class labels for the model
    """

    def __init__(self, classes=None):
        if classes is None:
            raise ValueError(
                "This model requires class labels, but none were available"
            )

        self.classes = classes

    def __call__(
        self,
        output,
        frame_size,
        confidence_thresh=None,
        classes=None,
        **kwargs,
    ):
        """Parses the model output.

        Args:
            output: a batch of predictions ``output = List[Dict[Tensor]]``,
                where each dict has the following keys:

                -   boxes (``FloatTensor[N, 4]``): the predicted boxes in
                    ``[x1, y1, x2, y2]`` format (absolute coordinates)
                -   labels (``Int64Tensor[N]``): the predicted labels
                -   scores (``Tensor[N]``): the scores for each prediction

            frame_size: the ``(width, height)`` of the frames in the batch
            confidence_thresh (None): an optional confidence threshold to use
                to filter any applicable predictions
            classes (None): an optional iterable of classes to use to filter
                any applicable predictions
            **kwargs: unused kwargs

        Returns:
            a list of :class:`fiftyone.core.labels.Detections` instances
        """
        return [
            self._parse_output(o, frame_size, confidence_thresh, classes)
            for o in output
        ]

    def _parse_output(self, output, frame_size, confidence_thresh, classes):
        width, height = frame_size

        boxes = output["boxes"].detach().cpu().numpy()
        labels = output["labels"].detach().cpu().numpy()
        scores = output["scores"].detach().cpu().numpy()

        detections = []
        for box, lbl, score in zip(boxes, labels, scores):
            label = self.classes[lbl]

            if confidence_thresh is not None and score < confidence_thresh:
                continue

            if classes is not None and label not in classes:
                continue

            x1, y1, x2, y2 = box
            bounding_box = [
                x1 / width,
                y1 / height,
                (x2 - x1) / width,
                (y2 - y1) / height,
            ]

            detections.append(
                fol.Detection(
                    label=label,
                    bounding_box=bounding_box,
                    confidence=score,
                )
            )

        return fol.Detections(detections=detections)


class InstanceSegmenterOutputProcessor(OutputProcessor):
    """Output processor for instance segmenters.

    Args:
        classes (None): the list of class labels for the model
        mask_thresh (0.5): a threshold to use to convert soft masks to binary
            masks
    """

    def __init__(self, classes=None, mask_thresh=0.5):
        if classes is None:
            raise ValueError(
                "This model requires class labels, but none were available"
            )

        self.classes = classes
        self.mask_thresh = mask_thresh

    def __call__(
        self,
        output,
        frame_size,
        confidence_thresh=None,
        classes=None,
        **kwargs,
    ):
        """Parses the model output.

        Args:
            output: a batch of predictions ``output = List[Dict[Tensor]]``,
                where each dict has the following keys:

                -   boxes (``FloatTensor[N, 4]``): the predicted boxes in
                    ``[x1, y1, x2, y2]`` format (absolute coordinates)
                -   labels (``Int64Tensor[N]``): the predicted labels
                -   masks (``FloatTensor[N, 1, H, W]``): the predicted masks
                    for each instance, in ``[0, 1]``. May also be boolean
                -   scores (``Tensor[N]``): optional scores for each prediction

            frame_size: the ``(width, height)`` of the frames in the batch
            confidence_thresh (None): an optional confidence threshold to use
                to filter any applicable predictions
            classes (None): an optional iterable of classes to use to filter
                any applicable predictions
            **kwargs: unused kwargs

        Returns:
            a list of :class:`fiftyone.core.labels.Detections` instances
        """
        return [
            self._parse_output(o, frame_size, confidence_thresh, classes)
            for o in output
        ]

    def _parse_output(self, output, frame_size, confidence_thresh, classes):
        width, height = frame_size

        boxes = output["boxes"].detach().cpu().numpy()
        labels = output["labels"].detach().cpu().numpy()
        masks = output["masks"].detach().cpu().numpy()
        if "scores" in output:
            scores = output["scores"].detach().cpu().numpy()
        else:
            scores = itertools.repeat(None)

        detections = []
        for box, lbl, mask, score in zip(boxes, labels, masks, scores):
            label = self.classes[lbl]

            if (
                confidence_thresh is not None
                and score is not None
                and score < confidence_thresh
            ):
                continue

            if classes is not None and label not in classes:
                continue

            x1, y1, x2, y2 = box
            bounding_box = [
                x1 / width,
                y1 / height,
                (x2 - x1) / width,
                (y2 - y1) / height,
            ]

            mask = np.squeeze(mask, axis=0)[
                int(round(y1)) : int(round(y2)),
                int(round(x1)) : int(round(x2)),
            ]

            if mask.dtype != bool:
                mask = mask > self.mask_thresh

            detections.append(
                fol.Detection(
                    label=label,
                    bounding_box=bounding_box,
                    mask=mask,
                    confidence=score,
                )
            )

        return fol.Detections(detections=detections)


class KeypointOutputProcessor(OutputProcessor):
    """Output processor for keypoint prediction models."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

    def __call__(self, output, frame_size, confidence_thresh=None, **kwargs):
        """Parses the model output.

        Args:
            output: a batch of predictions ``output = List[Dict[Tensor]]``,
                where each dict has the following keys:

                -   keypoints (``FloatTensor[N, K, ...]``): the predicted
                    keypoints for each instance in ``[x, y, ...]`` format
                -   keypoint_scores (``Tensor[N]``): the scores for each keypoint

            frame_size: the ``(width, height)`` of the frames in the batch
            confidence_thresh (None): an optional confidence threshold to use
                to filter any applicable predictions
            **kwargs: unused kwargs

        Returns:
            a list of :class:`fiftyone.core.labels.Label` dicts
        """
        return [
            self._parse_output(o, frame_size, confidence_thresh)
            for o in output
        ]

    def _parse_output(self, output, frame_size, confidence_thresh):
        width, height = frame_size

        keypoints = output["keypoints"].detach().cpu().numpy()
        keypoints_scores = (
            torch.sigmoid(output["keypoints_scores"]).detach().cpu().numpy()
        )

        _keypoints = []
        for kpts, kpt_scores in zip(keypoints, keypoints_scores):
            points = []
            for p, p_conf in zip(kpts, kpt_scores):
                if confidence_thresh and p_conf < confidence_thresh:
                    # Low confidence
                    points.append((float("nan"), float("nan")))
                else:
                    points.append((p[0] / width, p[1] / height))
            _keypoints.append(
                fol.Keypoint(
                    points=points,
                    confidence=kpt_scores.tolist(),
                )
            )

        return fol.Keypoints(keypoints=_keypoints)


class KeypointDetectorOutputProcessor(OutputProcessor):
    """Output processor for keypoint detection models.

    Args:
        classes (None): the list of class labels for the model
    """

    def __init__(self, classes=None):
        if classes is None:
            raise ValueError(
                "This model requires class labels, but none were available"
            )

        self.classes = classes

    def __call__(
        self,
        output,
        frame_size,
        confidence_thresh=None,
        classes=None,
        **kwargs,
    ):
        """Parses the model output.

        Args:
            output: a batch of predictions ``output = List[Dict[Tensor]]``,
                where each dict has the following keys:

                -   boxes (``FloatTensor[N, 4]``): the predicted boxes in
                    ``[x1, y1, x2, y2]`` format (absolute coordinates)
                -   labels (``Int64Tensor[N]``): the predicted labels
                -   scores (``Tensor[N]``): the scores for each prediction
                -   keypoints (``FloatTensor[N, K, ...]``): the predicted
                    keypoints for each instance in ``[x, y, v, ...]`` format

            frame_size: the ``(width, height)`` of the frames in the batch
            confidence_thresh (None): an optional confidence threshold to use
                to filter any applicable predictions
            classes (None): an optional iterable of classes to use to filter
                any applicable predictions
            **kwargs: unused kwargs

        Returns:
            a list of :class:`fiftyone.core.labels.Label` dicts
        """
        return [
            self._parse_output(o, frame_size, confidence_thresh, classes)
            for o in output
        ]

    def _parse_output(self, output, frame_size, confidence_thresh, classes):
        width, height = frame_size

        boxes = output["boxes"].detach().cpu().numpy()
        labels = output["labels"].detach().cpu().numpy()
        scores = output["scores"].detach().cpu().numpy()
        keypoints = output["keypoints"].detach().cpu().numpy()
        keypoints_scores = torch.sigmoid(
            output["keypoints_scores"].detach().cpu()
        ).numpy()

        _detections = []
        _keypoints = []
        for box, lbl, score, kpts, kpt_scores in zip(
            boxes, labels, scores, keypoints, keypoints_scores
        ):
            label = self.classes[lbl]

            if confidence_thresh is not None and score < confidence_thresh:
                continue

            if classes is not None and label not in classes:
                continue

            x1, y1, x2, y2 = box
            bounding_box = [
                x1 / width,
                y1 / height,
                (x2 - x1) / width,
                (y2 - y1) / height,
            ]

            points = []
            for p, p_conf in zip(kpts, kpt_scores):
                if confidence_thresh and p_conf < confidence_thresh:
                    # Low confidence
                    points.append((float("nan"), float("nan")))
                elif p[2] == 0:
                    # Not visible
                    points.append((float("nan"), float("nan")))
                else:
                    points.append((float(p[0] / width), float(p[1] / height)))

            _detections.append(
                fol.Detection(
                    label=label,
                    bounding_box=bounding_box,
                    confidence=score,
                )
            )

            _keypoints.append(
                fol.Keypoint(
                    label=label,
                    points=points,
                    confidence=kpt_scores.tolist(),
                )
            )

        return {
            "detections": fol.Detections(detections=_detections),
            "keypoints": fol.Keypoints(keypoints=_keypoints),
        }


class SemanticSegmenterOutputProcessor(OutputProcessor):
    """Output processor for semantic segmenters.

    Args:
        classes (None): the list of class labels for the model. This parameter
            is not used
        no_background_cls (False): if true, class indices are incremented by 1
            in the mask
        has_softmax_out (True): if false, softmax is applied to output
            predictions
    """

    def __init__(
        self,
        classes=None,
        no_background_cls=False,
        has_softmax_out=True,
    ):
        self.classes = classes
        self.no_background_cls = no_background_cls
        self.has_softmax_out = has_softmax_out

    def __call__(self, output, *args, **kwargs):
        """Parses the model output.

        Args:
            output: a batch of predictions ``output = Dict[Tensor]``,
                where the dict has the following keys:

                -   out (``FloatTensor[N, M, H, W]``): the segmentation map
                    probabilities for the ``N`` images across the ``M`` classes
            *args: unused arguments
            **kwargs: unused keyword arguments

        Returns:
            a list of :class:`fiftyone.core.labels.Segmentation` instances
        """
        out = output["out"].detach().cpu()
        if not self.has_softmax_out:
            out = out.softmax(dim=1)
        probs = out.numpy()

        masks = probs.argmax(axis=1)
        if self.no_background_cls:
            masks += 1

        confidence_thresh = kwargs.pop("confidence_thresh", None)
        if confidence_thresh:
            confidence = probs.max(axis=1)
            conf_mask = confidence >= confidence_thresh
            masks[~conf_mask] = 0
        return [fol.Segmentation(mask=mask) for mask in masks]


def recommend_num_workers(num_workers=None):
    """Recommend a number of workers for running a
    :class:`torch:torch.utils.data.DataLoader`.

    Returns:
        the recommended number of workers
    """
    if sys.platform.startswith("win"):
        # Windows tends to have multiprocessing issues, especially with Torch,
        # so default to 0 workers
        # https://github.com/voxel51/fiftyone/issues/1531
        # https://stackoverflow.com/q/20222534
        return 0

    default = fou.get_cpu_count() // 2

    return fou.recommend_process_pool_workers(
        num_workers, default_num_workers=default
    )


def _to_bytes_array(strs):
    # Variation of idea below that handles non-ASCII strings
    # https://github.com/pytorch/pytorch/issues/13246#issuecomment-715050814
    return np.array([s.encode() for s in strs])


def _is_string_array(targets):
    try:
        return etau.is_str(next(iter(targets)))
    except StopIteration:
        return False


class FiftyOneTorchDataset(Dataset):
    """Constructs a :class:`torch:torch.utils.data.Dataset` that loads data
    from an arbitrary :class:`fiftyone.core.collections.SampleCollection` via
    the provided :class:`GetItem` instance.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        get_item: a :class:`GetItem`
        vectorize (False): whether to load and cache the required fields from
            the sample collection upfront (True) or lazily load the values from
            each sample when items are retrieved (False). Vectorizing gives
            faster data loading times, but you must have enough memory to store
            the required field values for the entire collection. When
            ``vectorize=True``, all field values must be serializable; ie
            ``pickle.dumps(field_value)`` must not raise an error
        skip_failures (False): whether to skip failures that occur when calling
            ``get_item``. If True, the exception will be returned rather than
            the intended field values
        local_process_group (None): the local process group. Only used during
            distributed training
    """

    def __init__(
        self,
        samples,
        get_item,
        vectorize=False,
        skip_failures=False,
        local_process_group=None,
    ):
        super().__init__()

        self.field_mapping = get_item.field_mapping.copy()

        # Optimization: only select the specific fields that we'll need to
        # pass to `get_item`
        samples = samples.select_fields(list(self.field_mapping.values()))

        self.dataset_name = samples._root_dataset.name
        self.stages = (
            samples._serialize()
            if isinstance(samples, fov.DatasetView)
            else None
        )

        self.get_item = get_item
        self.skip_failures = skip_failures

        self.ids = self._load_field(
            samples, "id", local_process_group=local_process_group
        )

        self.vectorize = vectorize
        self.cached_fields = None
        if vectorize:
            self._cache_fields(
                samples, local_process_group=local_process_group
            )

        # initialized in worker
        self._dataset = None
        self._samples = None

    def _cache_fields(self, samples, local_process_group=None):
        self.cached_fields = {}

        fields_to_load = list(self.field_mapping.values())

        if "id" in fields_to_load:
            self.cached_fields["id"] = self.ids
            fields_to_load.remove("id")

        # @todo load all fields via a single `values()` call
        for field_name in fields_to_load:
            self.cached_fields[field_name] = self._load_field(
                samples, field_name, local_process_group=local_process_group
            )

    def _load_field(self, samples, field_name, local_process_group=None):
        if local_process_group is None:
            return TorchSerializedList(samples.values(field_name))

        if get_local_rank(local_process_group) == 0:
            return TorchShmSerializedList(
                samples.values(field_name), local_process_group
            )

        # We don't need to pass actual data if we're not in local rank 0
        # we read it from shared memory instead
        return TorchShmSerializedList([], local_process_group)

    @property
    def samples(self):
        if self._samples is None:
            self._load_samples()

        return self._samples

    @staticmethod
    def worker_init(worker_id):
        """Initializes a worker during inference/training.

        This method is used as the ``worker_init_fn`` parameter for
        :class:`torch:torch.utils.data.DataLoader`.

        Args:
            worker_id: the worker ID
        """
        import fiftyone.core.odm.database as food

        # Ensure that each process creates its own MongoDB clients
        # https://pymongo.readthedocs.io/en/stable/faq.html#using-pymongo-with-multiprocessing
        # pylint:disable-next=protected-access
        food._disconnect()

        torch_dataset = torch.utils.data.get_worker_info().dataset

        if torch_dataset._samples is not None:
            raise ValueError(
                "worker_init() called after samples have been loaded. This "
                "should not happen!"
            )

        torch_dataset._load_samples()

    @staticmethod
    def distributed_init(dataset_name, local_process_group, view_name=None):
        """Initializes a trainer process during distributed training.

        This function should be called at the beginning of the training script.
        It facilitates communication between processes and safely creates a
        database connection for each trainer.

        Args:
            dataset_name: the name of the dataset to load
            local_process_group: the process group with all the processes
                running the main training script
            view_name (None): the name of a saved view to load

        Returns:
            the loaded :class:`fiftyone.core.dataset.Dataset` or
            :class:`fiftyone.core.view.DatasetView`
        """
        import fiftyone as fo

        # make sure all processes have the same authkey
        local_broadcast_process_authkey(local_process_group)

        for i in range(get_local_size(local_process_group)):
            if get_local_rank(local_process_group) == i:
                dataset = fo.load_dataset(dataset_name)
                if view_name is not None:
                    dataset = dataset.load_saved_view(view_name)

            torch.distributed.barrier(local_process_group)

        return dataset

    def _load_samples(self):
        import fiftyone as fo

        self._dataset = fo.load_dataset(self.dataset_name)
        if self.stages is not None:
            self._samples = fov.DatasetView._build(self._dataset, self.stages)
        else:
            self._samples = self._dataset

    def _get_item(self, sample):
        try:
            return self.get_item(sample)
        except Exception as e:
            if not self.skip_failures:
                raise e

            return e

    def _get_samples(self, indices):
        ids = [self.ids[idx] for idx in indices]
        return fov.make_optimized_select_view(self.samples, ids, ordered=True)

    def _prepare_batch_db(self, indices):
        samples = self._get_samples(indices)
        batch = []
        for sample in samples:
            d = {}
            for key, field in self.field_mapping.items():
                try:
                    d[key] = sample[field]
                except Exception as e:
                    error = ValueError(
                        f"Error loading field {field} assigned to key {key}: {e}"
                    )
                    if not self.skip_failures:
                        raise error from e

                    d = error
                    break

            batch.append(d)

        return batch

    def _prepare_batch_vectorized(self, indices):
        batch = []
        for i in indices:
            d = {}
            for key, field in self.field_mapping.items():
                d[key] = self.cached_fields[field][i]

            batch.append(d)

        return batch

    def __getitem__(self, idx):
        return self.__getitems__([idx])[0]

    def __getitems__(self, indices):
        if self.vectorize:
            batch = self._prepare_batch_vectorized(indices)
        else:
            batch = self._prepare_batch_db(indices)

        res = []
        for d in batch:
            if isinstance(d, Exception):
                res.append(d)
            else:
                res.append(self._get_item(d))

        return res

    def __len__(self):
        return len(self.ids)


class TorchImageDataset(Dataset):
    """A :class:`torch:torch.utils.data.Dataset` of images.

    Instances of this dataset emit images for each sample, or
    ``(img, sample_id)`` pairs if ``sample_ids`` are provided or
    ``include_ids == True``.

    By default, this class will load images in PIL format and emit Torch
    tensors, but you can use numpy images/tensors instead by passing
    ``use_numpy = True``.

    Args:
        image_paths (None): an iterable of image paths
        samples (None): a :class:`fiftyone.core.collections.SampleCollection`
            from which to extract image paths
        sample_ids (None): an iterable of sample IDs corresponding to each
            image
        include_ids (False): whether to include the IDs of the ``samples`` in
            the returned items
        transform (None): an optional transform function to apply to each image
            patch. When ``use_numpy == False``, this is typically a torchvision
            transform
        use_numpy (False): whether to use numpy arrays rather than PIL images
            and Torch tensors when loading data
        force_rgb (False): whether to force convert the images to RGB
        skip_failures (False): whether to return an ``Exception`` object rather
            than raising it if an error occurs while loading a sample
    """

    def __init__(
        self,
        image_paths=None,
        samples=None,
        sample_ids=None,
        include_ids=False,
        transform=None,
        use_numpy=False,
        force_rgb=False,
        skip_failures=False,
    ):
        image_paths, sample_ids = self._parse_inputs(
            image_paths=image_paths,
            samples=samples,
            sample_ids=sample_ids,
            include_ids=include_ids,
        )

        self.image_paths = image_paths
        self.sample_ids = sample_ids
        self.transform = transform
        self.force_rgb = force_rgb
        self.use_numpy = use_numpy
        self.skip_failures = skip_failures

    def __len__(self):
        return len(self.image_paths)

    def __getitem__(self, idx):
        try:
            image_path = self.image_paths[idx].decode()

            img = _load_image(image_path, self.use_numpy, self.force_rgb)

            if self.transform is not None:
                img = self.transform(img)
        except Exception as e:
            if not self.skip_failures:
                raise e

            img = e

        if self.has_sample_ids:
            # pylint: disable=unsubscriptable-object
            return img, self.sample_ids[idx].decode()

        return img

    @property
    def has_sample_ids(self):
        """Whether this dataset has sample IDs."""
        return self.sample_ids is not None

    def _parse_inputs(
        self,
        image_paths=None,
        samples=None,
        sample_ids=None,
        include_ids=False,
    ):
        if image_paths is None and samples is None:
            raise ValueError(
                "Either `image_paths` or `samples` must be provided"
            )

        if image_paths is None:
            image_paths = samples.values("filepath")

        image_paths = _to_bytes_array(image_paths)

        if include_ids and sample_ids is None:
            sample_ids = samples.values("id")

        if sample_ids is not None:
            sample_ids = _to_bytes_array(sample_ids)

        return image_paths, sample_ids


class TorchImageClassificationDataset(Dataset):
    """A :class:`torch:torch.utils.data.Dataset` for image classification.

    Instances of this dataset emit images and their associated targets for each
    sample, either directly as ``(img, target)`` pairs or as
    ``(img, target, sample_id)`` pairs if ``sample_ids`` are provided or
    ``include_ids == True``.

    By default, this class will load images in PIL format and emit Torch
    tensors, but you can use numpy images/tensors instead by passing
    ``use_numpy = True``.

    Args:
        image_paths (None): an iterable of image paths
        targets (None): an iterable of targets, or the name of a field or
            embedded field of ``samples`` to use as targets
        samples (None): a :class:`fiftyone.core.collections.SampleCollection`
            from which to extract image paths and targets
        sample_ids (None): an iterable of sample IDs corresponding to each
            image
        include_ids (False): whether to include the IDs of the ``samples`` in
            the returned items
        transform (None): an optional transform function to apply to each image
            patch. When ``use_numpy == False``, this is typically a torchvision
            transform
        use_numpy (False): whether to use numpy arrays rather than PIL images
            and Torch tensors when loading data
        force_rgb (False): whether to force convert the images to RGB
        skip_failures (False): whether to return an ``Exception`` object rather
            than raising it if an error occurs while loading a sample
    """

    def __init__(
        self,
        image_paths=None,
        targets=None,
        samples=None,
        sample_ids=None,
        include_ids=False,
        transform=None,
        use_numpy=False,
        force_rgb=False,
        skip_failures=False,
    ):
        image_paths, sample_ids, targets, str_targets = self._parse_inputs(
            image_paths=image_paths,
            targets=targets,
            samples=samples,
            sample_ids=sample_ids,
            include_ids=include_ids,
        )

        self.image_paths = image_paths
        self.targets = targets
        self.sample_ids = sample_ids
        self.transform = transform
        self.use_numpy = use_numpy
        self.force_rgb = force_rgb
        self.skip_failures = skip_failures

        self._str_targets = str_targets

    def __len__(self):
        return len(self.image_paths)

    def __getitem__(self, idx):
        try:
            image_path = self.image_paths[idx].decode()
            img = _load_image(image_path, self.use_numpy, self.force_rgb)

            target = self.targets[idx]
            if self._str_targets:
                target = target.decode()

            if self.transform is not None:
                img = self.transform(img)
        except Exception as e:
            if not self.skip_failures:
                raise e

            img = e
            target = None

        if self.has_sample_ids:
            # pylint: disable=unsubscriptable-object
            return img, target, self.sample_ids[idx].decode()

        return img, target

    @property
    def has_sample_ids(self):
        """Whether this dataset has sample IDs."""
        return self.sample_ids is not None

    def _parse_inputs(
        self,
        image_paths=None,
        targets=None,
        samples=None,
        sample_ids=None,
        include_ids=False,
    ):
        if image_paths is None and samples is None:
            raise ValueError(
                "Either `image_paths` or `samples` must be provided"
            )

        if image_paths is None:
            image_paths = samples.values("filepath")

        image_paths = _to_bytes_array(image_paths)

        if include_ids and sample_ids is None:
            sample_ids = samples.values("id")

        if sample_ids is not None:
            sample_ids = _to_bytes_array(sample_ids)

        if etau.is_str(targets):
            targets = samples.values(targets)
        else:
            targets = list(targets)

        str_targets = _is_string_array(targets)
        if str_targets:
            targets = _to_bytes_array(targets)
        else:
            targets = np.array(targets)

        return image_paths, sample_ids, targets, str_targets


class TorchImagePatchesDataset(torch.utils.data.IterableDataset):
    """A :class:`torch:torch.utils.data.IterableDataset` of image patch tensors
    extracted from a list of images.

    Provide either ``image_paths`` and ``patches`` or ``samples`` and
    ``patches_field`` in order to use this dataset.

    Each iteration yields ``(sample_id, label_ids, patches)`` tuples where
    ``patches`` is a stacked tensor (or list when ``ragged_batches=True``)
    of extracted image patches, ``sample_id`` is the string sample ID (or
    ``None``), and ``label_ids`` is a list of label IDs corresponding to
    each patch (or ``None``).

    By default, this class will load images in PIL format and emit Torch
    tensors, but you can use numpy images/tensors instead by passing
    ``use_numpy = True``.

    If ``ragged_batches = False`` (the default), this class will emit tensors
    containing the stacked (along axis 0) patches from each image.  In this
    case, the provided ``transform`` must ensure that all image patches are
    resized to the same shape so they can be stacked.

    If ``ragged_batches = True``, lists of patch tensors will be returned.

    Args:
        image_paths (None): an iterable of image paths
        patches (None): a list of labels of type
            :class:`fiftyone.core.labels.Detection`,
            :class:`fiftyone.core.labels.Detections`,
            :class:`fiftyone.core.labels.Polyline`, or
            :class:`fiftyone.core.labels.Polylines` specifying the image
            patch(es) to extract from each image. Elements can be ``None`` if
            an image has no patches
        samples (None): a :class:`fiftyone.core.collections.SampleCollection`
            from which to extract patches
        patches_field (None): the name of the field defining the image patches
            in ``samples`` to extract. Must be of type
            :class:`fiftyone.core.labels.Detection`,
            :class:`fiftyone.core.labels.Detections`,
            :class:`fiftyone.core.labels.Polyline`, or
            :class:`fiftyone.core.labels.Polylines`
        handle_missing ("skip"): how to handle images with no patches. The
            supported values are:

            -   "skip": skip the image and assign its embedding as ``None``
            -   "image": use the whole image as a single patch
            -   "error": raise an error
        transform (None): an optional transform function to apply to each image
            patch. When ``use_numpy == False``, this is typically a torchvision
            transform
        sample_ids (None): an iterable of sample IDs corresponding to each
            image
        include_ids (False): whether to include the IDs of the ``samples`` in
            the returned items
        ragged_batches (False): whether the provided ``transform`` may return
            tensors of different dimensions and thus cannot be stacked
        use_numpy (False): whether to use numpy arrays rather than PIL images
            and Torch tensors when loading data
        force_rgb (False): whether to force convert the images to RGB
        force_square (False): whether to minimally manipulate the patch
            bounding boxes into squares prior to extraction
        alpha (None): an optional expansion/contraction to apply to the patches
            before extracting them, in ``[-1, inf)``. If provided, the length
            and width of the box are expanded (or contracted, when
            ``alpha < 0``) by ``(100 * alpha)%``. For example, set
            ``alpha = 0.1`` to expand the boxes by 10%, and set
            ``alpha = -0.1`` to contract the boxes by 10%
        skip_failures (False): whether to return an ``Exception`` object rather
            than raising it if an error occurs while loading a sample
        num_workers (0): the number of DataLoader workers. When > 0 and using
            ``samples``/``patches_field``, the dataset is partitioned across
            workers via ``$bucketAuto``
    """

    def __init__(
        self,
        image_paths=None,
        patches=None,
        samples=None,
        patches_field=None,
        handle_missing="skip",
        transform=None,
        sample_ids=None,
        include_ids=False,
        ragged_batches=False,
        use_numpy=False,
        force_rgb=False,
        force_square=False,
        alpha=None,
        skip_failures=False,
        num_workers=0,
        _prefetch_fn=None,
    ):
        self.handle_missing = handle_missing
        self.transform = transform
        self.ragged_batches = ragged_batches
        self.force_square = force_square
        self.alpha = alpha
        self.skip_failures = skip_failures
        self.force_rgb = force_rgb
        self.use_numpy = use_numpy
        self._prefetch_fn = _prefetch_fn or _read_images

        if samples is not None and patches_field is not None:
            # Pre-compute all pickle-safe DB iteration state so that
            # DataLoader workers can serialize this dataset
            self._db_config = _prepare_db_detection_config(
                samples,
                patches_field,
                num_workers,
            )
            self._list_config = None
        elif image_paths is not None:
            self._db_config = None
            self._list_config = _prepare_list_detection_config(
                image_paths,
                patches,
                sample_ids,
            )
        else:
            raise ValueError(
                "Either `samples`/`patches_field` or `image_paths` required"
            )

    def __iter__(self):
        handle_missing = self.handle_missing
        skip_failures = self.skip_failures
        extract_patches = self._extract_patches

        if self._db_config is not None:
            detections = _iter_db_detections(**self._db_config)
            detections = self._prefetch_fn(detections)
        else:
            detections = _iter_list_detections(**self._list_config)

        for image_or_path, bboxes, sample_id, label_ids in detections:
            try:
                if not bboxes:
                    if handle_missing == "skip":
                        yield sample_id, None, None
                        continue
                    elif handle_missing == "image":
                        bboxes, label_ids = [[0, 0, 1, 1]], []
                    else:
                        raise ValueError(
                            "No patches for sample '%s'"
                            % (sample_id or image_or_path)
                        )

                yield (
                    sample_id,
                    label_ids,
                    extract_patches(image_or_path, bboxes),
                )

            except Exception as e:
                if not skip_failures:
                    raise
                yield sample_id, None, e

    def _extract_patches(self, image_or_path, bboxes):
        alpha = self.alpha
        force_square = self.force_square
        use_numpy = self.use_numpy
        transform = self.transform

        if isinstance(image_or_path, bytes):
            img = _decode_image(image_or_path, self.force_rgb)
        else:
            img = _load_image(image_or_path, True, self.force_rgb)

        img_patches = []
        for bounding_box in bboxes:
            bbox = _to_eta_bbox(bounding_box)

            if alpha is not None:
                bbox = bbox.pad_relative(alpha)

            img_patch = bbox.extract_from(img, force_square=force_square)

            if not use_numpy:
                img_patch = Image.fromarray(img_patch)

            if transform is not None:
                img_patch = transform(img_patch)

            img_patches.append(img_patch)

        if self.ragged_batches:
            return img_patches

        if use_numpy:
            return np.stack(img_patches, axis=0)

        return torch.stack(img_patches, dim=0)

    @staticmethod
    def worker_init_fn(worker_id):
        """Disconnects pymongo so each worker creates its own connections."""
        import fiftyone.core.odm.database as food

        food._disconnect()


def _read_images(records, num_workers=8):
    """Reads images into memory via a thread pool.

    Replaces file paths with in-memory bytes using
    :func:`fiftyone.core.storage.read_bytes`.  The thread pool keeps
    ``num_workers`` reads in flight so the main thread is never blocked
    waiting on I/O.

    Yields ``(image_bytes, bboxes, sample_id, label_ids)`` tuples.
    """
    import fiftyone.core.storage as fos
    from concurrent.futures import ThreadPoolExecutor

    def _read_one(record):
        path, bboxes, sample_id, label_ids = record
        if path is not None:
            return (
                fos.read_file(path, binary=True),
                bboxes,
                sample_id,
                label_ids,
            )
        return record

    with ThreadPoolExecutor(max_workers=num_workers) as pool:
        yield from pool.map(_read_one, records)


def _decode_image(image_bytes, force_rgb):
    """Decodes an in-memory image (bytes) to a numpy array."""
    arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Failed to decode image from bytes")
    if force_rgb:
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    return img


def _prepare_db_detection_config(samples, patches_field, num_workers):
    """Extracts pickle-safe configuration from a
    :class:`fiftyone.core.collections.SampleCollection` for streaming
    detection data from MongoDB.

    Returns a dict of keyword arguments for :func:`_iter_db_detections`.
    """
    label_type = samples._get_label_field_type(patches_field)
    is_list_field = issubclass(label_type, fol._HasLabelList)
    is_polyline = issubclass(label_type, (fol.Polyline, fol.Polylines))
    bbox_attr = "points" if is_polyline else "bounding_box"

    if is_list_field:
        array_path = f"{patches_field}.{label_type._LABEL_LIST_FIELD}"
    else:
        array_path = patches_field

    return dict(
        collection_name=samples._dataset._sample_collection_name,
        view_pipeline=samples._pipeline(),
        media_field=samples._parse_media_field("filepath")[0],
        array_path=array_path,
        bbox_attr=bbox_attr,
        is_polyline=is_polyline,
        partitions=focol._compute_id_partitions(samples, num_workers),
    )


def _iter_db_detections(
    collection_name,
    view_pipeline,
    media_field,
    array_path,
    bbox_attr,
    is_polyline,
    partitions,
):
    """Yields ``(raw_path, bboxes, sample_id, label_ids)`` tuples by
    streaming detection data from MongoDB.

    Yields raw media paths as stored in the database.  The caller is
    responsible for resolving cloud paths via the media cache before
    reading the image.
    """
    import fiftyone.core.odm.database as food

    pipeline = list(view_pipeline)

    worker_info = torch.utils.data.get_worker_info()
    if worker_info is not None and partitions:
        match = focol._id_partition_match(partitions, worker_info.id)
        if match is None:
            return
        pipeline.append(match)

    array_path_parts = array_path.split(".")
    id_field_path = array_path + "._id"
    bbox_field_path = f"{array_path}.{bbox_attr}"

    pipeline.append(
        {
            "$project": {
                media_field: 1,
                bbox_field_path: 1,
                id_field_path: 1,
            }
        }
    )

    coll = food.get_db_conn()[collection_name]
    for doc in coll.aggregate(pipeline, hint={"_id": 1}, allowDiskUse=True):
        sample_id = str(doc["_id"])

        val = doc
        for part in array_path_parts:
            val = val.get(part) if isinstance(val, dict) else None
            if val is None:
                break

        elements = (
            val if isinstance(val, list) else [val] if val is not None else []
        )

        bboxes, label_ids = [], []
        for elem in elements:
            raw = elem.get(bbox_attr)
            if raw is not None:
                bboxes.append(_polyline_to_bbox(raw) if is_polyline else raw)
                label_ids.append(str(elem["_id"]))

        yield doc.get(media_field), bboxes, sample_id, label_ids


def _prepare_list_detection_config(image_paths, patches, sample_ids):
    """Builds a pickle-safe configuration dict for streaming detection data
    from in-memory image paths and label lists.

    Returns a dict of keyword arguments for :func:`_iter_list_detections`.
    """
    return dict(
        image_paths=image_paths,
        patches=patches,
        sample_ids=list(sample_ids) if sample_ids is not None else None,
    )


def _iter_list_detections(image_paths, patches, sample_ids):
    """Yields ``(image_path, bboxes, sample_id, label_ids)`` tuples from
    in-memory image paths and label lists.
    """
    worker_info = torch.utils.data.get_worker_info()
    if worker_info is not None:
        wid = worker_info.id
        num_workers = worker_info.num_workers
    else:
        wid = 0
        num_workers = 1

    patches_iter = patches if patches is not None else itertools.repeat(None)

    for idx, (image_path, label) in enumerate(zip(image_paths, patches_iter)):
        if idx % num_workers != wid:
            continue

        bboxes = _labels_to_bboxes(label)
        sample_id = sample_ids[idx] if sample_ids is not None else None

        yield image_path, bboxes, sample_id, None


def _labels_to_bboxes(label):
    """Converts a label object to a list of ``[tlx, tly, w, h]`` bounding
    boxes.

    Args:
        label: a :class:`fiftyone.core.labels.Detection`,
            :class:`fiftyone.core.labels.Detections`,
            :class:`fiftyone.core.labels.Polyline`,
            :class:`fiftyone.core.labels.Polylines`, or ``None``

    Returns:
        a list of ``[tlx, tly, w, h]`` lists, or ``None``
    """
    if label is None:
        return None

    if isinstance(label, fol.Detection):
        return [label.bounding_box]

    if isinstance(label, fol.Detections):
        return [d.bounding_box for d in label.detections]

    if isinstance(label, fol.Polyline):
        return [label.to_detection().bounding_box]

    if isinstance(label, fol.Polylines):
        return [p.to_detection().bounding_box for p in label.polylines]

    raise ValueError("Unsupported patches type %s" % type(label))


def _to_eta_bbox(bounding_box):
    tlx, tly, w, h = bounding_box
    return etag.BoundingBox.from_coords(tlx, tly, tlx + w, tly + h)


def _polylines_to_bboxes(points):
    if points is None:
        return None

    return [_polyline_to_bbox(p) for p in points]


def _polyline_to_bbox(points):
    if points is None:
        return None

    x, y = zip(*list(itertools.chain(*points)))
    xtl = min(x)
    ytl = min(y)
    xbr = max(x)
    ybr = max(y)
    return [xtl, ytl, (xbr - xtl), (ybr - ytl)]


def from_image_classification_dir_tree(dataset_dir):
    """Creates a :class:`torch:torch.utils.data.Dataset` for the given image
    classification dataset directory tree.

    The directory should have the following format::

        <dataset_dir>/
            <classA>/
                <image1>.<ext>
                <image2>.<ext>
                ...
            <classB>/
                <image1>.<ext>
                <image2>.<ext>
                ...

    Args:
        dataset_dir: the dataset directory

    Returns:
        a :class:`torchvision:torchvision.datasets.ImageFolder`
    """
    return torchvision.datasets.ImageFolder(dataset_dir)


def _load_image(image_path, use_numpy, force_rgb):
    if use_numpy:
        if force_rgb:
            img = cv2.imread(image_path, cv2.IMREAD_COLOR)
            return cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        return cv2.imread(image_path, cv2.IMREAD_UNCHANGED)

    # Use context manager to prevent leaked file descriptors
    with open(image_path, "rb") as f:
        img = Image.open(f)
        if force_rgb:
            return img.convert("RGB")
        img.load()
        return img


# taken from https://github.com/ppwwyyxx/RAM-multiprocess-dataloader/blob/795868a37446d61412b9a58dbb1b7c76e75d39c4/serialize.py#L19
# as well as https://github.com/facebookresearch/detectron2/blob/main/detectron2/utils/comm.py
class NumpySerializedList:
    def __init__(self, lst: list):
        def _serialize(data):
            buffer = pickle.dumps(data, protocol=-1)
            return np.frombuffer(buffer, dtype=np.uint8)

        logger.debug(
            "Serializing {} elements to byte tensors and concatenating them "
            "all ...".format(len(lst))
        )

        self._lst = [_serialize(x) for x in lst]
        self._addr = np.asarray([len(x) for x in self._lst], dtype=np.int64)
        self._addr = np.cumsum(self._addr)
        self._lst = (
            np.concatenate(self._lst)
            if self._lst
            else np.empty(0, dtype=np.uint8)
        )

        logger.debug(
            "Serialized dataset takes {:.2f} MiB".format(
                len(self._lst) / 1024**2
            )
        )

    def __len__(self):
        return len(self._addr)

    def __getitem__(self, idx):
        start_addr = 0 if idx == 0 else self._addr[idx - 1].item()
        end_addr = self._addr[idx].item()
        bytes = memoryview(self._lst[start_addr:end_addr])
        return pickle.loads(bytes)


class TorchSerializedList(NumpySerializedList):
    def __init__(self, lst: list):
        super().__init__(lst)
        self._addr = torch.from_numpy(self._addr)
        self._lst = torch.from_numpy(self._lst)

    def __getitem__(self, idx):
        start_addr = 0 if idx == 0 else self._addr[idx - 1].item()
        end_addr = self._addr[idx].item()
        bytes = memoryview(self._lst[start_addr:end_addr].numpy())
        return pickle.loads(bytes)


class TorchShmSerializedList(TorchSerializedList):
    def __init__(self, lst: list, local_process_group):
        if get_local_rank(local_process_group) == 0:
            super().__init__(lst)
            # Move data to shared memory, obtain a handle to send to each local worker.
            # This is cheap because a tensor will only be moved to shared memory once.
            handles = [None] + [
                bytes(
                    multiprocessing.reduction.ForkingPickler.dumps(
                        (self._addr, self._lst)
                    )
                )
                for _ in range(get_local_size(local_process_group) - 1)
            ]
        else:
            handles = None
        # Each worker receives the handle from local leader.
        handle = local_scatter(handles, local_process_group)

        if get_local_rank(local_process_group) > 0:
            # Materialize the tensor from shared memory.
            (
                self._addr,
                self._lst,
            ) = multiprocessing.reduction.ForkingPickler.loads(handle)
            logger.info(
                f"Worker {get_rank()} obtains a dataset of length="
                f"{len(self)} from its local leader."
            )


def get_local_size(local_process_group):
    """Gets the number of processes per-machine in the local process group.

    Args:
        local_process_group: the local process group

    Returns:
        the number of processes per-machine
    """
    if not dist.is_available():
        return 1

    if not dist.is_initialized():
        return 1

    return dist.get_world_size(group=local_process_group)


def get_world_size():
    """Returns the world size of the current operation.

    Returns:
        the world size
    """
    if not dist.is_available():
        return 1

    if not dist.is_initialized():
        return 1

    return dist.get_world_size()


def get_local_rank(local_process_group):
    """Gets the rank of the current process within the local processes group.

    Args:
        local_process_group: the local process group

    Returns:
        the rank of the current process
    """
    if not dist.is_available():
        return 0

    if not dist.is_initialized():
        return 0

    return dist.get_rank(group=local_process_group)


def get_rank():
    """Gets the rank of the current process.

    Returns:
        the rank of the current process
    """
    if not dist.is_available():
        return 0

    if not dist.is_initialized():
        return 0

    return dist.get_rank()


def local_scatter(array, local_process_group):
    """Scatters the given array from the local leader to all local workers.

    The worker with rank ``i`` gets ``array[i]``.

    Args:
        array: an array with same size as the local process group
        local_process_group: the local process group

    Returns:
        the array element for the current rank
    """
    if get_local_size(local_process_group) == 1:
        return array[0]

    if get_local_rank(local_process_group) == 0:
        assert len(array) == get_local_size(local_process_group)
        all_gather(array)
    else:
        all_data = all_gather(None)
        array = all_data[get_rank() - get_local_rank(local_process_group)]

    return array[get_local_rank(local_process_group)]


def all_gather(data, group=None):
    """Gathers arbitrary picklable data (not necessarily tensors).

    Args:
        data: any picklable object
        group (None): a torch process group. By default, uses a group which
            contains all ranks on gloo backend

    Returns:
        the list of data gathered from each rank
    """
    if get_world_size() == 1:
        return [data]

    if group is None:
        # use CPU group by default, to reduce GPU RAM usage
        group = _get_global_gloo_group()

    world_size = dist.get_world_size(group)
    if world_size == 1:
        return [data]

    output = [None for _ in range(world_size)]
    dist.all_gather_object(output, data, group=group)
    return output


@functools.lru_cache()
def _get_global_gloo_group():
    """Returns a process group based on gloo backend, containing all the ranks.
    The result is cached.
    """
    if dist.get_backend() == "nccl":
        return dist.new_group(backend="gloo")
    else:
        return dist.group.WORLD


# see https://github.com/ppwwyyxx/RAM-multiprocess-dataloader/issues/5
def local_broadcast_process_authkey(local_process_group):
    if get_local_size(local_process_group) == 1:
        return

    local_rank = get_local_rank(local_process_group)
    authkey = bytes(torch.multiprocessing.current_process().authkey)
    all_keys = all_gather(authkey, local_process_group)
    local_leader_key = all_keys[torch.distributed.get_rank() - local_rank]
    if authkey != local_leader_key:
        logger.info(
            "Process authkey is different from the key of local leader. This "
            "might happen when workers are launched independently."
        )
        logger.info("Overwriting local authkey ...")
        multiprocessing.current_process().authkey = local_leader_key


def patch_collate_fn(batch):
    """Collates multiple samples into a flat patch batch for model inference.

    Returns ``(sample_ids, label_ids_list, flat_patches, counts)`` where
    *flat_patches* is all valid patches concatenated and ``counts[i]`` is the
    patch count per sample (or ``None``/``Exception`` for skipped/failed
    samples).
    """
    sample_ids = []
    label_ids_list = []
    to_cat = []
    counts = []

    for sample_id, label_ids, patches in batch:
        sample_ids.append(sample_id)
        label_ids_list.append(label_ids)
        if patches is None or isinstance(patches, Exception):
            counts.append(patches)
        else:
            counts.append(len(patches))
            to_cat.append(patches)

    flat_patches = torch.cat(to_cat) if to_cat else None
    return sample_ids, label_ids_list, flat_patches, counts
