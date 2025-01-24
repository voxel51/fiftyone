"""
Brain method runs framework.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from fiftyone.core.runs import (
    BaseRun,
    BaseRunConfig,
    BaseRunInfo,
    BaseRunResults,
)
from fiftyone.core.odm import patch_brain_runs


class BrainInfo(BaseRunInfo):
    """Information about an brain method that has been run on a dataset.

    Args:
        key: the brain key
        timestamp (None): the UTC ``datetime`` when the brain method was run
        config (None): the :class:`BrainMethodConfig` for the run
    """

    @classmethod
    def config_cls(cls):
        return BrainMethodConfig


class BrainMethodConfig(BaseRunConfig):
    """Base class for configuring :class:`BrainMethod` instances.

    Args:
        **kwargs: any leftover keyword arguments after subclasses have done
            their parsing
    """

    @property
    def type(self):
        return "brain"

    @property
    def method(self):
        return None


class BrainMethod(BaseRun):
    """Base class for brain methods.

    Args:
        config: an :class:`BrainMethodConfig`
    """

    @classmethod
    def run_info_cls(cls):
        return BrainInfo

    @classmethod
    def _runs_field(cls):
        return "brain_methods"

    @classmethod
    def _run_str(cls):
        return "brain method run"

    @classmethod
    def _results_cache_field(cls):
        return "_brain_cache"

    @classmethod
    def _patch_function(cls):
        return patch_brain_runs


class BrainResults(BaseRunResults):
    """Base class for brain method results."""

    pass
