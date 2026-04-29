"""
Internal documentation helpers.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

_HIDE_FROM_DOCS_ATTR = "_fiftyone_hide_from_docs"


def hide_from_docs(obj):
    """Marks an object to be skipped by generated API documentation.

    This decorator does not change runtime behavior; it only attaches metadata
    that the Sphinx autodoc configuration can inspect.
    """

    for target in _iter_docs_targets(obj):
        try:
            setattr(target, _HIDE_FROM_DOCS_ATTR, True)
        except (AttributeError, TypeError):
            pass

    return obj


def is_hidden_from_docs(obj):
    """Returns whether the given object should be hidden from API docs."""

    return any(
        bool(getattr(target, _HIDE_FROM_DOCS_ATTR, False))
        for target in _iter_docs_targets(obj)
    )


def _iter_docs_targets(obj):
    yield obj

    if isinstance(obj, property):
        for target in (obj.fget, obj.fset, obj.fdel):
            if target is not None:
                yield target

    func = getattr(obj, "__func__", None)
    if func is not None:
        yield func

    wrapped = getattr(obj, "__wrapped__", None)
    if wrapped is not None:
        yield wrapped
