"""
Experiment framework.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from fiftyone.core.runs import Run, RunConfig, RunInfo, RunResults


class ExperimentInfo(RunInfo):
    """Information about an experiment on a dataset.

    Args:
        key: the experiment key
        timestamp (None): the UTC ``datetime`` when the experiment run was
            initiated
        config (None): the :class:`ExperimentMethodConfig` for the run
    """

    @classmethod
    def config_cls(cls):
        return ExperimentMethodConfig


class ExperimentMethodConfig(RunConfig):
    """Base class for configuring :class:`ExperimentMethod` instances.

    Args:
        **kwargs: any leftover keyword arguments after subclasses have done
            their parsing
    """

    pass


class ExperimentMethod(Run):
    """Base class for experiment methods.

    Args:
        config: an :class:`ExperimentMethodConfig`
    """

    @classmethod
    def run_info_cls(cls):
        return ExperimentInfo

    @classmethod
    def _runs_field(cls):
        return "experiments"

    @classmethod
    def _run_str(cls):
        return "experiment"

    @classmethod
    def _results_cache_field(cls):
        return "_experiment_cache"


class ExperimentResults(RunResults):
    """Base class for experiment results."""

    pass
