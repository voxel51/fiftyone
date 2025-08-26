"""
FiftyOne operator constants.

| Copyright 2017-2025, Voxel51, Inc.
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
