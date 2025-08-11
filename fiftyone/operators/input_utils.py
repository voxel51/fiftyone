"""
FiftyOne operator common input utilities.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from fiftyone.core import clips, patches, video
from fiftyone.operators import constants, types


def resolve_target_view_input(
    ctx,
    inputs,
    param_name="view_target",
    action_description="Process",
    allow_selected_samples=True,
    allow_selected_labels=False,
    allow_dataset_view=False,
    default_target=None,
    dataset_label="Entire dataset",
    dataset_description=None,
    base_view_label="Base view",
    base_view_description=None,
    current_view_label="Current view",
    current_view_description=None,
    dataset_view_label="Dataset",
    dataset_view_description=None,
    selected_samples_label="Selected samples",
    selected_samples_description=None,
    selected_labels_label="Selected labels",
    selected_labels_description=None,
):
    """Creates and resolves a target view input for an operator.

    This function adds an enum input to the provided ``inputs`` object that
    allows the user to select which view to process. The available choices
    depend on the current context and the provided flags.

    The choices include:

    - Entire dataset (if the current view is not a generated view)
    - Base view (if the current view is a generated view such as
      :class:`fiftyone.core.clips.ClipsView`, :class:`fiftyone.core.video.FramesView`,
      or :class:`fiftyone.core.patches.PatchesView`), which is the semantic
      equivalent of "entire dataset" for these views. The base view is the
      view from which the generated view was created. For example,
      ``dataset.limit(51).to_frames("ground_truth").limit(10)`` has a base
      view of ``dataset.limit(51).to_frames("ground_truth")``
    - Dataset view (if ``allow_dataset_view`` is ``True``)
    - Current view (if the current view is different from the dataset view)
    - Selected samples (if ``allow_selected_samples`` is ``True`` and there are
      selected samples)
    - Selected labels (if ``allow_selected_labels`` is ``True`` and there are
      selected labels)

    If there's no view or selected items, the only option is entire dataset,
    so no input will be created and "DATASET" will be returned.

    The resolved target view can be accessed in the operator's
    :meth:`execute() <fiftyone.operators.Operator.execute>` method
    via :meth:`ctx.target_view() <fiftyone.operators.ExecutionContext.target_view>`.

    The target view descriptions are generated based on the provided
    ``action_description`` and the various description parameters. If a
    description parameter is not ``None``, it will be used as the description
    for the corresponding target view choice. Otherwise, a default description
    will be generated such as ``f"{action_description} the entire dataset"``.


    Examples::

        import fiftyone.operators as foo

        class MyTargetViewOperator(foo.Operator):
            @property
            def config(self):
                return foo.OperatorConfig(
                    name="target_view_operator",
                    label="Testing Target View Operator",
                    dynamic=True,
                )

            def resolve_input(self, ctx):
                inputs = types.Object()
                target_view = foo.resolve_target_view_input(
                    ctx,
                    inputs
                )

                return types.Property(
                    inputs, view=types.View(label="Target View Operator")
                )

            def execute(self, ctx):
                target_view = ctx.target_view()
                # Do something with the target view
                print("Sample collection size", len(target_view))

    Args:
        ctx: the operator's :class:`fiftyone.operators.ExecutionContext`
        inputs: the operator inputs object, of type
            :class:`fiftyone.operators.types.Property`, to which to add the
            target view input
        param_name (``target_view``): the name of the parameter to add to
            ``inputs`` for the target view input field
        action_description (``Process``): a short description of the action
            being performed, used to generate default descriptions for the
            various target views
        allow_selected_samples (``True``): whether to allow the "selected
            samples" target view
        allow_selected_labels (``False``): whether to allow the "selected
            labels" target view
        allow_dataset_view (``False``): whether to allow the "dataset view" target
            view
        default_target (``None``): the default target view to select if
            multipl choices are available. If ``None``, one will be chosen
            based on the available choices in the following order of
            preference: dataset view, current view, selected samples, selected
            labels
        dataset_label (``Entire dataset``): the label for the "entire dataset"
            target view
        dataset_description (``None``): the description for the "entire
            dataset" target view. If ``None``, a default description is
            generated
        base_view_label (``Base view``): the label for the "base view" target
            view
        base_view_description (``None``): the description for the "base view"
            target view. If ``None``, a default description is generated
        current_view_label (``Current view``): the label for the "current
            view" target view
        current_view_description (``None``): the description for the "current
            view" target view. If ``None``, a default description is generated
        dataset_view_label (``Dataset``): the label for the "dataset view"
            target view
        dataset_view_description (``None``): the description for the "dataset
            view" target view. If ``None``, a default description is generated
        selected_samples_label (``Selected samples``): the label for the
            "selected samples" target view
        selected_samples_description (``None``): the description for the
            "selected samples" target view. If ``None``, a default description
            is generated
        selected_labels_label (``Selected labels``): the label for the
            "selected labels" target view
        selected_labels_description (``None``): the description for the
            "selected labels" target view. If ``None``, a default description
            is generated

    Returns:
        the resolved target view, one of
        :class:`fiftyone.operators.constants.ViewTarget`
    """
    # Resolve descriptions for the various target views
    action_description = action_description or "Process"
    dataset_description = (
        dataset_description or f"{action_description} the entire dataset"
    )
    base_view_description = (
        base_view_description or f"{action_description} the base view"
    )
    current_view_description = (
        current_view_description or f"{action_description} the current view"
    )
    dataset_view_description = (
        dataset_view_description or f"{action_description} the dataset view"
    )
    selected_samples_description = selected_samples_description or (
        f"{action_description} only the selected samples"
    )
    selected_labels_description = selected_labels_description or (
        f"{action_description} only the selected labels"
    )

    # Determine which target views are available
    has_base_view = isinstance(
        ctx.view,
        (
            clips.ClipsView,
            patches.EvaluationPatchesView,
            patches.PatchesView,
            video.FramesView,
        ),
    )
    if has_base_view:
        has_view = ctx.view != ctx.view._base_view
    else:
        has_view = ctx.view != ctx.dataset.view()

    has_selected_samples = allow_selected_samples and bool(ctx.selected)
    has_selected_labels = allow_selected_labels and bool(ctx.selected_labels)

    if (
        has_view
        or has_selected_samples
        or has_selected_labels
        or allow_dataset_view
    ):
        target_choices = types.RadioGroup(orientation="horizontal")

        if has_base_view:
            # If the view is generated (clips, frames, patches, etc.), then the
            # equivalent semantics of "entire dataset" is to process all
            # items in the base view
            target_choices.add_choice(
                constants.ViewTarget.BASE_VIEW,
                label=base_view_label,
                description=base_view_description,
            )
        else:
            target_choices.add_choice(
                constants.ViewTarget.DATASET,
                label=dataset_label,
                description=dataset_description,
            )

        choice_order = [
            (
                constants.ViewTarget.DATASET_VIEW,
                allow_dataset_view,
                dataset_view_label,
                dataset_view_description,
            ),
            (
                constants.ViewTarget.CURRENT_VIEW,
                has_view,
                current_view_label,
                current_view_description,
            ),
            (
                constants.ViewTarget.SELECTED_SAMPLES,
                has_selected_samples,
                selected_samples_label,
                selected_samples_description,
            ),
            (
                constants.ViewTarget.SELECTED_LABELS,
                has_selected_labels,
                selected_labels_label,
                selected_labels_description,
            ),
        ]
        for target_view, is_available, label, description in choice_order:
            if is_available:
                target_choices.add_choice(
                    target_view, label=label, description=description
                )
                if default_target is None:
                    default_target = target_view

        inputs.enum(
            param_name,
            target_choices.values(),
            default=default_target,
            required=True,
            label="Target view",
            view=target_choices,
        )
        target = ctx.params.get(param_name, default_target)
    else:
        # Only one choice is available (dataset), so we don't need to prompt
        target = constants.ViewTarget.DATASET

    return target
