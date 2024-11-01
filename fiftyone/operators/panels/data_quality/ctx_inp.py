import fiftyone as fo
import fiftyone.operators.types as types


def _execution_mode(ctx, inputs):
    delegate = ctx.params.get("delegate", False)

    if delegate:
        description = "Uncheck this box to execute the operation immediately"
    else:
        description = "Check this box to delegate execution of this task"

    inputs.bool(
        "delegate",
        default=False,
        required=True,
        label="Delegate execution?",
        description=description,
        view=types.CheckboxView(),
    )

    if delegate:
        inputs.view(
            "notice",
            types.Notice(
                label=(
                    "You've chosen delegated execution. Note that you must "
                    "have a delegated operation service running in order for "
                    "this task to be processed. See "
                    "https://docs.voxel51.com/plugins/index.html#operators "
                    "for more information"
                )
            ),
        )


def _handle_patch_inputs(ctx, inputs):
    target_view = ctx.target_view()
    patch_types = (fo.Detection, fo.Detections, fo.Polyline, fo.Polylines)
    patches_fields = list(
        target_view.get_field_schema(embedded_doc_type=patch_types).keys()
    )

    if patches_fields:
        patches_field_choices = types.DropdownView()
        for field in sorted(patches_fields):
            patches_field_choices.add_choice(field, label=field)

        inputs.str(
            "patches_field",
            default=None,
            required=False,
            label="Patches field",
            description=(
                "An optional sample field defining image patches in each "
                "sample to run the computation on. If omitted, the full images "
                "will be used."
            ),
            view=patches_field_choices,
        )
