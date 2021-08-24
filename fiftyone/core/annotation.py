"""
Annotation runs framework.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from fiftyone.core.runs import Run, RunConfig, RunInfo, RunResults


class AnnotationInfo(RunInfo):
    """Information about an annotation run on a dataset.

    Args:
        key: the annotation key
        timestamp (None): the UTC ``datetime`` when the annotation run was
            initiated
        config (None): the :class:`AnnotationRunConfig` for the run
    """

    @classmethod
    def config_cls(cls):
        return AnnotationRunConfig


class AnnotationRunConfig(RunConfig):
    """Base class for configuring :class:`AnnotationRun` instances.

    Args:
        **kwargs: any leftover keyword arguments after subclasses have done
            their parsing
    """

    pass


class AnnotationRun(Run):
    """Base class for annotation runs.

    Args:
        config: an :class:`AnnotationRunConfig`
    """

    @classmethod
    def run_info_cls(cls):
        return AnnotationInfo

    @classmethod
    def _runs_field(cls):
        return "annotation_runs"

    @classmethod
    def _run_str(cls):
        return "annotation run"

    @classmethod
    def _results_cache_field(cls):
        return "_annotation_cache"


class AnnotationResults(RunResults):
    """Base class for annotation run results."""

    pass
