"""
FiftyOne Zoo models provided by :mod:`torchvision:torchvision.models`.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import contextlib
import inspect
import logging
from packaging import version

import fiftyone as fo
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

fou.ensure_torch()
import torchvision


logger = logging.getLogger(__name__)


class TorchvisionImageModelConfig(
    fout.TorchImageModelConfig, fozm.HasZooModel
):
    """Configuration for running a :class:`TorchvisionImageModel`.

    See :class:`fiftyone.utils.torch.TorchImageModelConfig` for usage.
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)


class TorchvisionImageModel(fout.TorchImageModel):
    """Wrapper for evaluating a :mod:`torchvision:torchvision.models` model on
    images.

    Args:
        config: an :class:`TorchvisionImageModelConfig`
    """

    def _download_model(self, config):
        config.download_model_if_necessary()

    def _load_model(self, config):
        if config.entrypoint_args:
            # pretrained=True was used instead of weights in torchvision < 0.13
            if version.parse(torchvision.__version__) < version.parse(
                "0.13.0"
            ):
                weights = config.entrypoint_args.pop("weights", None)
                if weights is not None:
                    config.entrypoint_args["pretrained"] = True

        ctx = contextlib.nullcontext()
        if config.entrypoint_fcn is not None:
            try:
                ctx = _make_load_state_dict_from_url_monkey_patcher(
                    config.entrypoint_fcn, fo.config.model_zoo_dir
                )
            except Exception as e:
                logger.warning(
                    "Failed to monkey patch load_state_dict_from_url(): %s", e
                )

        with ctx:
            return super()._load_model(config)


def _make_load_state_dict_from_url_monkey_patcher(entrypoint, model_dir):
    """Monkey patches all instances of ``load_state_dict_from_url()`` that are
    reachable from the given ``entrypoint`` function in the
    :mod:`torchvision:torchvision.models` namespace so that models will be
    loaded from ``model_dir`` and not from the Torch Hub cache directory.
    """
    if version.parse(torchvision.__version__) >= version.parse("0.12.0"):
        entrypoint_module = torchvision._internally_replaced_utils
    else:
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
