"""
FiftyOne operator constants.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


class ViewTarget:
    """Choices for target view that an operator should operate on

    See :meth:`fiftyone.operators.types.ViewTargetProperty` for details.
    """

    BASE_VIEW = "BASE_VIEW"
    """Base view from which a generated view was created

    If the current view is a generated view such as
    :class:`fiftyone.core.clips.ClipsView`,
    :class:`fiftyone.core.video.FramesView`, or
    :class:`fiftyone.core.patches.PatchesView`), base view is the semantic
    equivalent of "entire dataset" for these views. The base view is the
    view from which the generated view was created. For example,
    ``dataset.limit(51).to_frames("ground_truth").limit(10)`` has a base
    view of ``dataset.limit(51).to_frames("ground_truth")``
    """

    CURRENT_VIEW = "CURRENT_VIEW"
    """Current view in the app"""

    DATASET = "DATASET"
    """Entire dataset"""

    DATASET_VIEW = "DATASET_VIEW"
    """Empty dataset view, i.e., ``ctx.dataset.view()``.

        Note: unlikely to be useful in the typical case.
    """

    SELECTED_LABELS = "SELECTED_LABELS"
    """Selected labels in the app view, if any."""

    SELECTED_SAMPLES = "SELECTED_SAMPLES"
    """Selected samples in the app view, if any."""

    CUSTOM_VIEW_TARGET = "CUSTOM_VIEW_TARGET"
    """Custom view target specified by the caller.

    When using this option, specify 'custom_view_target' in the
    operator parameters with a list of JSON-serialized view stages to apply.
    """

    @classmethod
    def values(cls):
        """Returns all :class:`ViewTarget` values."""
        return _VIEW_TARGET_VALUES


_VIEW_TARGET_VALUES = tuple(
    value
    for name, value in vars(ViewTarget).items()
    if not name.startswith("_") and isinstance(value, str)
)

_MEDIA_SCOPE_SEPARATOR = "|media:"


def scope_view_target(target, media_type):
    """Returns the view target value that scopes ``target`` of a grouped
    dataset to every group slice of ``media_type``.

    Args:
        target: a :class:`ViewTarget` value
        media_type: a group slice media type

    Returns:
        a view target value
    """
    return f"{target}{_MEDIA_SCOPE_SEPARATOR}{media_type}"


def split_view_target(value):
    """Splits a view target value into its :class:`ViewTarget` and the group
    slice media type it is scoped to.

    Args:
        value: a view target value, as returned by :func:`scope_view_target`
            or a :class:`ViewTarget` value

    Returns:
        a ``(target, media_type)`` tuple, where ``media_type`` is ``None`` if
        the value is not scoped
    """
    if value and _MEDIA_SCOPE_SEPARATOR in value:
        target, media_type = value.split(_MEDIA_SCOPE_SEPARATOR, 1)
        return target, media_type

    return value, None
