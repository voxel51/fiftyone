"""
Global training namespace.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

__all__ = ["init", "list_runs"]


def init(dataset, **kwargs):
    """Global form of
    :meth:`fiftyone.core.dataset.Dataset.init_training_run`.

    Equivalent to ``dataset.init_training_run(**kwargs)``.
    """
    return dataset.init_training_run(**kwargs)


def list_runs(dataset, **kwargs):
    """Equivalent to ``dataset.list_training_runs(**kwargs)``."""
    return dataset.list_training_runs(**kwargs)
