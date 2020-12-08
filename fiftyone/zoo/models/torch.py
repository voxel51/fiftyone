"""
FiftyOne Zoo models provided by ``torchvision.models``.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import inspect

import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
from fiftyone.zoo.models import HasZooModel

fou.ensure_torch()
import torch
import torchvision.models.utils as tmu


class TorchvisionImageModelConfig(fout.TorchImageModelConfig, HasZooModel):
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
        image_min_size (None): a minimum ``(width, height)`` to which to resize
            the input images during preprocessing
        image_min_dim (None): a minimum image dimension to which to resize the
            input images during preprocessing
        image_size (None): a ``(width, height)`` to which to resize the input
            images during preprocessing
        image_dim (None): resize the smaller input dimension to this value
            during preprocessing
        image_mean (None): a 3-array of mean values in ``[0, 1]`` for
            preprocessing the input images
        image_std (None): a 3-array of std values in ``[0, 1]`` for
            preprocessing the input images
        batch_size (None): the recommended batch size to use during inference
        embeddings_layer (None): the name of a layer whose output to expose as
            embeddings
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)


class TorchvisionImageModel(fout.TorchImageModel):
    """Wrapper for evaluating a ``torchvision.models`` model on images.

    Args:
        config: an :class:`TorchvisionImageModelConfig`
    """

    def _download_model(self, config):
        config.download_model_if_necessary()

    def _load_network(self, config):
        entrypoint = etau.get_function(config.entrypoint_fcn)
        kwargs = config.entrypoint_args or {}
        model_dir = fo.config.model_zoo_dir
        with OverrideLoadStateDict(
            entrypoint, model_dir, map_location=self.device
        ):
            # Builds net and loads state dict from `model_dir`
            model = entrypoint(**kwargs)

        return model

    def _load_state_dict(self, model, config):
        state_dict = torch.load(config.model_path, map_location=self.device)
        model.load_state_dict(state_dict)


class OverrideLoadStateDict(object):
    """Context manager that temporarily monkey patches the
    ``torchvision.models.utils.load_state_dict_from_url`` function so that the
    model will be loaded from ``model_dir`` when ``entrypoint`` is called.

    Args:
        entrypoint: the ``torchvision.models`` function that will be called to
            load the model
        model_dir: the models directory
        map_location (None): an optional device to load the model onto
    """

    def __init__(self, entrypoint, model_dir, map_location=None):
        self.module = inspect.getmodule(entrypoint)
        self.model_dir = model_dir
        self.map_location = map_location
        self._orig = None

    def __enter__(self):
        self._orig = tmu.load_state_dict_from_url

        def custom_load_state_dict_from_url(url, **kwargs):
            return self._orig(
                url,
                model_dir=self.model_dir,
                map_location=self.map_location,
                **kwargs,
            )

        tmu.load_state_dict_from_url = custom_load_state_dict_from_url
        self.module.load_state_dict_from_url = custom_load_state_dict_from_url

    def __exit__(self, *args):
        tmu.load_state_dict_from_url = self._orig
        self.module.load_state_dict_from_url = self._orig
