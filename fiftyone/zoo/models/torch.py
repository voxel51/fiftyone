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


_TORCH_IMPORT_ERROR = """

You tried to use a PyTorch model from the FiftyOne Model Zoo, but you do not
have the necessary packages installed.

Ensure that you have `torch` and `torchvision` installed on your machine, and
then try running this command again.

See https://voxel51.com/docs/fiftyone/user_guide/model_zoo.html
for more information about working with the Model Zoo.
"""

fou.ensure_torch(error_msg=_TORCH_IMPORT_ERROR)
import torchvision.models.utils as tmu


class TorchvisionModelConfig(fout.TorchModelConfig):

    pass


class TorchvisionModel(fout.TorchModel):
    """Wrapper for evaluating a ``torchvision.models`` model.

    Args:
        config: an :class:`TorchvisionModelConfig`
    """

    def _load_model(self, config):
        entrypoint = etau.get_function(config.entrypoint_fcn)
        kwargs = config.entrypoint_args or {}
        model_dir = fo.config.model_zoo_dir
        with OverrideLoadStateDict(
            entrypoint, model_dir, map_location=self.device
        ):
            # Builds net and loads pretrained model from `model_dir`
            model = entrypoint(**kwargs)

        model.to(self.device)

        if self.use_half_precision:
            model = model.half()

        model.train(False)

        return model


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
