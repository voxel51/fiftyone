"""
Brain method runs framework.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import fiftyone.core.media as fom
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

    def get_meta(self):
        meta = super().get_meta()
        group_slices = _similarity_group_slices(self)
        if group_slices is not None:
            meta["group_slices"] = group_slices

        return meta


def _similarity_group_slices(results):
    """Returns the group slices that a sample-level similarity index on a
    grouped dataset holds samples from, in the dataset's slice order, or None
    for any other run.
    """
    config = results.config
    if getattr(config, "type", None) != "similarity" or getattr(
        config, "patches_field", None
    ):
        return None

    samples = results.samples
    if samples is None or samples._dataset.media_type != fom.GROUP:
        return None

    dataset = samples._dataset
    flat = dataset.select_group_slices(_allow_mixed=True)
    name_path = dataset.group_field + ".name"
    sample_ids = getattr(results, "sample_ids", None)
    embeddings_field = getattr(config, "embeddings_field", None)
    if sample_ids is not None:
        indexed = set(sample_ids)
        ids, names = flat.values(["id", name_path])
        present = {name for _id, name in zip(ids, names) if _id in indexed}
    elif embeddings_field and dataset.has_field(embeddings_field):
        present = set(flat.exists(embeddings_field).distinct(name_path))
    else:
        # An index that cannot list its samples could cover any slice
        return list(dataset.group_slices)

    return [name for name in dataset.group_slices if name in present]
