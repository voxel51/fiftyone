"""
Brain method runs framework.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging

from bson import DBRef, json_util

import eta.core.utils as etau

from fiftyone.core.runs import (
    BaseRun,
    BaseRunConfig,
    BaseRunInfo,
    BaseRunResults,
)
from fiftyone.core.odm import patch_brain_runs
import fiftyone.core.utils as fou

fost = fou.lazy_import("fiftyone.core.stages")


logger = logging.getLogger(__name__)

# Serialized config keys naming the fields a brain run reads its inputs from
_INPUT_FIELD_KEYS = ("embeddings_field", "patches_field", "roi_field")


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


def _warn_runs_using_fields(dataset, paths):
    """Logs a warning for each brain run that reads its inputs from any of the
    given fields, which are about to be deleted.

    Runs registered on generated views are skipped, since their fields are
    relative to the generated dataset.

    Args:
        dataset: a :class:`fiftyone.core.dataset.Dataset`
        paths: a list of field paths, with ``frames.`` prefixes for frame
            fields
    """
    for key, run_doc in dataset._doc.brain_methods.items():
        if isinstance(run_doc, DBRef) or _is_generated_view_run(run_doc):
            continue

        run_paths = list(_get_input_fields(dataset, run_doc.config or {}))
        used_paths = [
            path
            for path in paths
            if any(p == path or p.startswith(path + ".") for p in run_paths)
        ]
        if used_paths:
            logger.warning(
                "Deleting field(s) %s, which brain run '%s' reads; the run "
                "remains but may no longer work",
                ", ".join("'%s'" % p for p in used_paths),
                key,
            )


def _get_input_fields(dataset, config):
    label_field = config.get("patches_field", None) or config.get(
        "roi_field", None
    )

    for key in _INPUT_FIELD_KEYS:
        path = config.get(key, None)
        if not etau.is_str(path):
            continue

        # Patch embeddings are stored as an attribute of each label
        if key == "embeddings_field" and etau.is_str(label_field):
            try:
                _, path = dataset._get_label_field_path(label_field, path)
            except ValueError:
                continue

        yield path


def _is_generated_view_run(run_doc):
    if not run_doc.view_stages:
        return False

    try:
        return any(
            fost.ViewStage._from_dict(json_util.loads(s)).has_view
            for s in run_doc.view_stages
        )
    except Exception:
        # A stage that no longer loads says nothing about the run's fields
        return True
