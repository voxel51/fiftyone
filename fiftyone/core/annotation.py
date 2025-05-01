"""
Annotation runs framework.

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
from fiftyone.core.odm import patch_annotation_runs


class AnnotationInfo(BaseRunInfo):
    """Information about an annotation run on a dataset.

    Args:
        key: the annotation key
        timestamp (None): the UTC ``datetime`` when the annotation run was
            initiated
        config (None): the :class:`AnnotationMethodConfig` for the run
    """

    @classmethod
    def config_cls(cls):
        return AnnotationMethodConfig


class AnnotationMethodConfig(BaseRunConfig):
    """Base class for configuring :class:`AnnotationMethod` instances.

    Args:
        **kwargs: any leftover keyword arguments after subclasses have done
            their parsing
    """

    @property
    def type(self):
        return "annotation"

    @property
    def method(self):
        return None


class AnnotationMethod(BaseRun):
    """Base class for annotation methods.

    Args:
        config: an :class:`AnnotationMethodConfig`
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

    @classmethod
    def _patch_function(cls):
        return patch_annotation_runs


class AnnotationResults(BaseRunResults):
    """Base class for annotation run results."""

    pass
