"""
Builtin operators.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json
import os

import fiftyone as fo
import fiftyone.core.media as fom
import fiftyone.core.storage as fos
import fiftyone.operators as foo
import fiftyone.operators.types as types


class EditFieldInfo(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="edit_field_info",
            label="Edit field info",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        _edit_field_info_inputs(ctx, inputs)

        return types.Property(inputs, view=types.View(label="Edit field info"))

    def execute(self, ctx):
        path = ctx.params["path"]
        description = ctx.params.get("description", None)
        info = ctx.params.get("info", None)
        read_only = ctx.params.get("read_only", None)

        field = ctx.dataset.get_field(path)

        if description is not None:
            field.description = description or None

        if info is not None:
            field.info = json.loads(info) if info else None

        if read_only is not None:
            field.read_only = read_only

        field.save()
        ctx.trigger("reload_dataset")


def _edit_field_info_inputs(ctx, inputs):
    schema = ctx.dataset.get_field_schema(flat=True)
    if ctx.dataset._has_frame_fields():
        frame_schema = ctx.dataset.get_frame_field_schema(flat=True)
        schema.update(
            {
                ctx.dataset._FRAMES_PREFIX + path: field
                for path, field in frame_schema.items()
            }
        )

    path_selector = types.AutocompleteView()
    for key in sorted(schema.keys()):
        path_selector.add_choice(key, label=key)

    inputs.enum(
        "path",
        path_selector.values(),
        required=True,
        label="Field",
        view=path_selector,
    )

    path = ctx.params.get("path", None)
    if path is None or path not in schema:
        return

    field = ctx.dataset.get_field(path)
    if field is None:
        return

    if field.read_only:
        inputs.view(
            "msg",
            types.Notice(label=f"The '{path}' field is read-only"),
        )
    else:
        inputs.str(
            "description",
            default=field.description,
            required=False,
            label="Description",
            description="An optional description for the field",
        )

        info_prop = inputs.str(
            "info",
            default=json.dumps(field.info, indent=4) if field.info else None,
            required=False,
            label="Description",
            description="A dictionary of information about the field",
            view=types.CodeView(),
        )

        info = ctx.params.get("info", None)

        if info is not None:
            try:
                json.loads(info)
            except:
                info_prop.invalid = True
                info_prop.error_message = "Invalid field info dict"

    inputs.bool(
        "read_only",
        default=field.read_only,
        required=False,
        label="Read only",
        description="Whether to mark the field as read-only",
    )


class CloneSelectedSamples(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="clone_selected_samples",
            label="Clone selected samples",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        count = len(ctx.selected)
        if count > 0:
            sample_text = "sample" if count == 1 else "samples"
            inputs.str(
                "msg",
                label=f"Clone {count} selected {sample_text}?",
                view=types.Warning(),
            )
        else:
            prop = inputs.str(
                "msg",
                label="You must select samples to clone",
                view=types.Warning(),
            )
            prop.invalid = True

        view = types.View(label="Clone selected samples")
        return types.Property(inputs, view=view)

    def execute(self, ctx):
        if not ctx.selected:
            return

        samples = ctx.dataset.select(ctx.selected)
        sample_ids = ctx.dataset.add_collection(samples, new_ids=True)

        ctx.trigger("clear_selected_samples")
        ctx.trigger("reload_samples")


class CloneSampleField(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="clone_sample_field",
            label="Clone sample field",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        _clone_sample_field_inputs(ctx, inputs)

        return types.Property(
            inputs, view=types.View(label="Clone sample field")
        )

    def execute(self, ctx):
        field_name = ctx.params["field_name"]
        new_field_name = ctx.params["new_field_name"]
        target = ctx.params.get("target", None)

        target_view = _get_target_view(ctx, target)

        target_view.clone_sample_field(field_name, new_field_name)
        ctx.trigger("reload_dataset")


def _clone_sample_field_inputs(ctx, inputs):
    has_view = ctx.view != ctx.dataset.view()
    has_selected = bool(ctx.selected)
    default_target = None
    if has_view or has_selected:
        target_choices = types.RadioGroup()
        target_choices.add_choice(
            "DATASET",
            label="Entire dataset",
            description="Clone sample field for the entire dataset",
        )

        if has_view:
            target_choices.add_choice(
                "CURRENT_VIEW",
                label="Current view",
                description="Clone sample field for the current view",
            )
            default_target = "CURRENT_VIEW"

        if has_selected:
            target_choices.add_choice(
                "SELECTED_SAMPLES",
                label="Selected samples",
                description="Clone sample field for the selected samples",
            )
            default_target = "SELECTED_SAMPLES"

        inputs.enum(
            "target",
            target_choices.values(),
            default=default_target,
            view=target_choices,
        )

    target = ctx.params.get("target", default_target)
    target_view = _get_target_view(ctx, target)

    schema = target_view.get_field_schema(flat=True)
    full_schema = ctx.dataset.get_field_schema(flat=True)

    field_keys = sorted(schema.keys())
    field_selector = types.AutocompleteView()
    for key in field_keys:
        field_selector.add_choice(key, label=key)

    inputs.enum(
        "field_name",
        field_selector.values(),
        label="Sample field",
        description=(
            "The field to copy. You can use `embedded.field.name` to clone "
            "embedded fields"
        ),
        view=field_selector,
        required=True,
    )

    field_name = ctx.params.get("field_name", None)
    if field_name not in schema:
        return

    new_field_prop = inputs.str(
        "new_field_name",
        required=True,
        label="New sample field",
        description=(
            "The new field to create. You can use `embedded.field.name` to "
            "create embedded fields"
        ),
        default=f"{field_name}_copy",
    )

    new_field_name = ctx.params.get("new_field_name", None)

    if new_field_name in full_schema:
        new_field_prop.invalid = True
        new_field_prop.error_message = (
            f"Field '{new_field_name}' already exists"
        )
        inputs.str(
            "error",
            label="Error",
            view=types.Error(
                label="Field already exists",
                description=f"Field '{new_field_name}' already exists",
            ),
        )


class CloneFrameField(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="clone_frame_field",
            label="Clone frame field",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        _clone_frame_field_inputs(ctx, inputs)

        return types.Property(
            inputs, view=types.View(label="Clone frame field")
        )

    def execute(self, ctx):
        field_name = ctx.params["field_name"]
        new_field_name = ctx.params["new_field_name"]
        target = ctx.params.get("target", None)

        target_view = _get_target_view(ctx, target)

        target_view.clone_frame_field(field_name, new_field_name)
        ctx.trigger("reload_dataset")


def _clone_frame_field_inputs(ctx, inputs):
    if not ctx.dataset._has_frame_fields():
        prop = inputs.str(
            "msg",
            label="This dataset does not have frame fields",
            view=types.Warning(),
        )
        prop.invalid = True
        return

    has_view = ctx.view != ctx.dataset.view()
    has_selected = bool(ctx.selected)
    default_target = None
    if has_view or has_selected:
        target_choices = types.RadioGroup()
        target_choices.add_choice(
            "DATASET",
            label="Entire dataset",
            description="Clone frame field for the entire dataset",
        )

        if has_view:
            target_choices.add_choice(
                "CURRENT_VIEW",
                label="Current view",
                description="Clone frame field for the current view",
            )
            default_target = "CURRENT_VIEW"

        if has_selected:
            target_choices.add_choice(
                "SELECTED_SAMPLES",
                label="Selected samples",
                description="Clone frame field for the selected samples",
            )
            default_target = "SELECTED_SAMPLES"

        inputs.enum(
            "target",
            target_choices.values(),
            default=default_target,
            view=target_choices,
        )

    target = ctx.params.get("target", default_target)
    target_view = _get_target_view(ctx, target)

    schema = target_view.get_frame_field_schema(flat=True)
    full_schema = ctx.dataset.get_frame_field_schema(flat=True)

    field_keys = sorted(schema.keys())
    field_selector = types.AutocompleteView()
    for key in field_keys:
        field_selector.add_choice(key, label=key)

    inputs.enum(
        "field_name",
        field_selector.values(),
        label="Frame field",
        description=(
            "The frame field to copy. You can use `embedded.field.name` to "
            "clone embedded frame fields"
        ),
        view=field_selector,
        required=True,
    )

    field_name = ctx.params.get("field_name", None)
    if field_name not in schema:
        return

    new_field_prop = inputs.str(
        "new_field_name",
        required=True,
        label="New frame field",
        description=(
            "The new frame field to create. You can use `embedded.field.name` "
            "to create embedded frame fields"
        ),
        default=f"{field_name}_copy",
    )

    new_field_name = ctx.params.get("new_field_name", None)

    if new_field_name in full_schema:
        new_field_prop.invalid = True
        new_field_prop.error_message = (
            f"Frame field '{new_field_name}' already exists"
        )
        inputs.str(
            "error",
            label="Error",
            view=types.Error(
                label="Frame field already exists",
                description=f"Frame field '{new_field_name}' already exists",
            ),
        )


class RenameSampleField(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="rename_sample_field",
            label="Rename sample field",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        _rename_sample_field_inputs(ctx, inputs)

        return types.Property(
            inputs, view=types.View(label="Rename sample field")
        )

    def execute(self, ctx):
        field_name = ctx.params["field_name"]
        new_field_name = ctx.params["new_field_name"]

        ctx.dataset.rename_sample_field(field_name, new_field_name)
        ctx.trigger("reload_dataset")


def _rename_sample_field_inputs(ctx, inputs):
    schema = _get_non_default_sample_fields(ctx.dataset)

    if not schema:
        prop = inputs.str(
            "msg",
            label="This dataset has no non-default sample fields",
            view=types.Warning(),
        )
        prop.invalid = True
        return

    field_selector = types.AutocompleteView()
    for key in sorted(schema.keys()):
        field_selector.add_choice(key, label=key)

    field_prop = inputs.enum(
        "field_name",
        field_selector.values(),
        label="Sample field",
        description="The sample field to rename",
        view=field_selector,
        required=True,
    )

    field_name = ctx.params.get("field_name", None)
    if field_name not in schema:
        return

    field = ctx.dataset.get_field(field_name)
    if field is not None and field.read_only:
        field_prop.invalid = True
        field_prop.error_message = f"Field '{field_name}' is read-only"
        return

    new_field_prop = inputs.str(
        "new_field_name",
        required=True,
        label="New field name",
        description="A new name for the field",
        default=f"{field_name}_copy",
    )

    new_field_name = ctx.params.get("new_field_name", None)

    if new_field_name in schema:
        new_field_prop.invalid = True
        new_field_prop.error_message = (
            f"Field '{new_field_name}' already exists"
        )
        inputs.str(
            "error",
            label="Error",
            view=types.Error(
                label="Field already exists",
                description=f"Field '{new_field_name}' already exists",
            ),
        )


class RenameFrameField(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="rename_frame_field",
            label="Rename frame field",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        _rename_frame_field_inputs(ctx, inputs)

        return types.Property(
            inputs, view=types.View(label="Rename frame field")
        )

    def execute(self, ctx):
        field_name = ctx.params["field_name"]
        new_field_name = ctx.params["new_field_name"]

        ctx.dataset.rename_frame_field(field_name, new_field_name)
        ctx.trigger("reload_dataset")


def _rename_frame_field_inputs(ctx, inputs):
    if not ctx.dataset._has_frame_fields():
        prop = inputs.str(
            "msg",
            label="This dataset does not have frame fields",
            view=types.Warning(),
        )
        prop.invalid = True
        return

    schema = _get_non_default_frame_fields(ctx.dataset)

    if not schema:
        prop = inputs.str(
            "msg",
            label="This dataset has no non-default frame fields",
            view=types.Warning(),
        )
        prop.invalid = True
        return

    field_selector = types.AutocompleteView()
    for key in sorted(schema.keys()):
        field_selector.add_choice(key, label=key)

    field_prop = inputs.enum(
        "field_name",
        field_selector.values(),
        label="Frame field",
        description="The frame field to rename",
        view=field_selector,
        required=True,
    )

    field_name = ctx.params.get("field_name", None)
    if field_name not in schema:
        return

    field = ctx.dataset.get_field(ctx.dataset._FRAMES_PREFIX + field_name)
    if field is not None and field.read_only:
        field_prop.invalid = True
        field_prop.error_message = f"Frame field '{field_name}' is read-only"
        return

    new_field_prop = inputs.str(
        "new_field_name",
        required=True,
        label="New frame field name",
        description="A new name for the field",
        default=f"{field_name}_copy",
    )

    new_field_name = ctx.params.get("new_field_name", None)

    if new_field_name in schema:
        new_field_prop.invalid = True
        new_field_prop.error_message = (
            f"Frame field '{new_field_name}' already exists"
        )
        inputs.str(
            "error",
            label="Error",
            view=types.Error(
                label="Frame field already exists",
                description=f"Frame field '{new_field_name}' already exists",
            ),
        )


class ClearSampleField(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="clear_sample_field",
            label="Clear sample field",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        _clear_sample_field_inputs(ctx, inputs)

        return types.Property(
            inputs, view=types.View(label="Clear sample field")
        )

    def execute(self, ctx):
        field_name = ctx.params["field_name"]

        ctx.dataset.clear_sample_field(field_name)
        ctx.trigger("reload_dataset")


def _clear_sample_field_inputs(ctx, inputs):
    has_view = ctx.view != ctx.dataset.view()
    has_selected = bool(ctx.selected)
    default_target = None
    if has_view or has_selected:
        target_choices = types.RadioGroup()
        target_choices.add_choice(
            "DATASET",
            label="Entire dataset",
            description="Clear sample field for the entire dataset",
        )

        if has_view:
            target_choices.add_choice(
                "CURRENT_VIEW",
                label="Current view",
                description="Clear sample field for the current view",
            )
            default_target = "CURRENT_VIEW"

        if has_selected:
            target_choices.add_choice(
                "SELECTED_SAMPLES",
                label="Selected samples",
                description="Clear sample field for the selected samples",
            )
            default_target = "SELECTED_SAMPLES"

        inputs.enum(
            "target",
            target_choices.values(),
            default=default_target,
            view=target_choices,
        )

    target = ctx.params.get("target", default_target)
    target_view = _get_target_view(ctx, target)

    schema = target_view.get_field_schema(flat=True)
    schema.pop("id", None)
    schema.pop("filepath", None)

    field_keys = sorted(schema.keys())
    field_selector = types.AutocompleteView()
    for key in field_keys:
        field_selector.add_choice(key, label=key)

    field_prop = inputs.enum(
        "field_name",
        field_selector.values(),
        label="Sample field",
        description="The sample field to clear",
        view=field_selector,
        required=True,
    )

    field_name = ctx.params.get("field_name", None)
    if field_name not in schema:
        return

    field = ctx.dataset.get_field(field_name)
    if field is not None and field.read_only:
        field_prop.invalid = True
        field_prop.error_message = f"Field '{field_name}' is read-only"


class ClearFrameField(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="clear_frame_field",
            label="Clear frame field",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        _clear_frame_field_inputs(ctx, inputs)

        return types.Property(
            inputs, view=types.View(label="Clear frame field")
        )

    def execute(self, ctx):
        field_name = ctx.params["field_name"]

        ctx.dataset.clear_frame_field(field_name)
        ctx.trigger("reload_dataset")


def _clear_frame_field_inputs(ctx, inputs):
    if not ctx.dataset._has_frame_fields():
        prop = inputs.str(
            "msg",
            label="This dataset does not have frame fields",
            view=types.Warning(),
        )
        prop.invalid = True
        return

    has_view = ctx.view != ctx.dataset.view()
    has_selected = bool(ctx.selected)
    default_target = None
    if has_view or has_selected:
        target_choices = types.RadioGroup()
        target_choices.add_choice(
            "DATASET",
            label="Entire dataset",
            description="Clear frame field for the entire dataset",
        )

        if has_view:
            target_choices.add_choice(
                "CURRENT_VIEW",
                label="Current view",
                description="Clear frame field for the current view",
            )
            default_target = "CURRENT_VIEW"

        if has_selected:
            target_choices.add_choice(
                "SELECTED_SAMPLES",
                label="Selected samples",
                description="Clear frame field for the selected samples",
            )
            default_target = "SELECTED_SAMPLES"

        inputs.enum(
            "target",
            target_choices.values(),
            default=default_target,
            view=target_choices,
        )

    target = ctx.params.get("target", default_target)
    target_view = _get_target_view(ctx, target)

    schema = target_view.get_frame_field_schema(flat=True)
    schema.pop("id", None)
    schema.pop("frame_number", None)

    field_keys = sorted(schema.keys())
    field_selector = types.AutocompleteView()
    for key in field_keys:
        field_selector.add_choice(key, label=key)

    field_prop = inputs.enum(
        "field_name",
        field_selector.values(),
        label="Frame field",
        description="The frame field to clear",
        view=field_selector,
        required=True,
    )

    field_name = ctx.params.get("field_name", None)
    if field_name not in schema:
        return

    field = ctx.dataset.get_field(ctx.dataset._FRAMES_PREFIX + field_name)
    if field is not None and field.read_only:
        field_prop.invalid = True
        field_prop.error_message = f"Frame field '{field_name}' is read-only"


class DeleteSelectedSamples(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="delete_selected_samples",
            label="Delete selected samples",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        count = len(ctx.selected)
        if count > 0:
            sample_text = "sample" if count == 1 else "samples"
            inputs.str(
                "msg",
                label=f"Delete {count} selected {sample_text}?",
                view=types.Warning(),
            )
        else:
            prop = inputs.str(
                "msg",
                label="You must select samples to delete",
                view=types.Warning(),
            )
            prop.invalid = True

        view = types.View(label="Delete selected samples")
        return types.Property(inputs, view=view)

    def execute(self, ctx):
        if not ctx.selected:
            return

        ctx.dataset.delete_samples(ctx.selected)

        ctx.trigger("clear_selected_samples")
        ctx.trigger("reload_samples")


class DeleteSelectedLabels(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="delete_selected_labels",
            label="Delete selected labels",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        count = len(ctx.selected_labels)
        if count > 0:
            label_text = "label" if count == 1 else "labels"
            inputs.str(
                "msg",
                label=f"Delete {count} selected {label_text}?",
                view=types.Warning(),
            )
        else:
            prop = inputs.str(
                "msg",
                label="You must select labels to delete",
                view=types.Warning(),
            )
            prop.invalid = True

        view = types.View(label="Delete selected labels")
        return types.Property(inputs, view=view)

    def execute(self, ctx):
        if not ctx.selected_labels:
            return

        ctx.dataset.delete_labels(labels=ctx.selected_labels)

        ctx.trigger("clear_selected_labels")
        ctx.trigger("reload_dataset")


class DeleteSampleField(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="delete_sample_field",
            label="Delete sample field",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        _delete_sample_field_inputs(ctx, inputs)

        return types.Property(
            inputs, view=types.View(label="Delete sample field")
        )

    def execute(self, ctx):
        field_name = ctx.params["field_name"]

        ctx.dataset.delete_sample_field(field_name)
        ctx.trigger("reload_dataset")


def _delete_sample_field_inputs(ctx, inputs):
    schema = _get_non_default_sample_fields(ctx.dataset)

    if not schema:
        prop = inputs.str(
            "msg",
            label="This dataset has no non-default sample fields",
            view=types.Warning(),
        )
        prop.invalid = True
        return

    field_selector = types.AutocompleteView()
    for key in sorted(schema.keys()):
        field_selector.add_choice(key, label=key)

    field_prop = inputs.enum(
        "field_name",
        field_selector.values(),
        label="Sample field",
        description="The sample field to delete",
        view=field_selector,
        required=True,
    )

    field_name = ctx.params.get("field_name", None)
    if field_name not in schema:
        return

    field = ctx.dataset.get_field(field_name)
    if field is not None and field.read_only:
        field_prop.invalid = True
        field_prop.error_message = f"Field '{field_name}' is read-only"


class DeleteFrameField(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="delete_frame_field",
            label="Delete frame field",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        _delete_frame_field_inputs(ctx, inputs)

        return types.Property(
            inputs, view=types.View(label="Delete frame field")
        )

    def execute(self, ctx):
        field_name = ctx.params["field_name"]

        ctx.dataset.delete_frame_field(field_name)
        ctx.trigger("reload_dataset")


def _delete_frame_field_inputs(ctx, inputs):
    if not ctx.dataset._has_frame_fields():
        prop = inputs.str(
            "msg",
            label="This dataset does not have frame fields",
            view=types.Warning(),
        )
        prop.invalid = True
        return

    schema = _get_non_default_frame_fields(ctx.dataset)

    if not schema:
        prop = inputs.str(
            "msg",
            label="This dataset has no non-default frame fields",
            view=types.Warning(),
        )
        prop.invalid = True
        return

    field_selector = types.AutocompleteView()
    for key in sorted(schema.keys()):
        field_selector.add_choice(key, label=key)

    field_prop = inputs.enum(
        "field_name",
        field_selector.values(),
        label="Frame field",
        description="The frame field to delete",
        view=field_selector,
        required=True,
    )

    field_name = ctx.params.get("field_name", None)
    if field_name not in schema:
        return

    field = ctx.dataset.get_field(ctx.dataset._FRAMES_PREFIX + field_name)
    if field is not None and field.read_only:
        field_prop.invalid = True
        field_prop.error_message = f"Frame field '{field_name}' is read-only"


class CreateIndex(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="create_index",
            label="Create index",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        schema = ctx.dataset.get_field_schema(flat=True)
        if ctx.dataset._has_frame_fields():
            frame_schema = ctx.dataset.get_frame_field_schema(flat=True)
            schema.update(
                {
                    ctx.dataset._FRAMES_PREFIX + path: field
                    for path, field in frame_schema.items()
                }
            )

        indexes = set(ctx.dataset.list_indexes())

        field_keys = sorted(p for p in schema if p not in indexes)
        field_selector = types.AutocompleteView()
        for key in field_keys:
            field_selector.add_choice(key, label=key)

        inputs.enum(
            "field_name",
            field_selector.values(),
            required=True,
            label="Field name",
            description="The field to index",
            view=field_selector,
        )

        inputs.bool(
            "unique",
            default=False,
            required=False,
            label="Unique",
            description="Whether to add a uniqueness constraint to the index",
        )

        return types.Property(inputs, view=types.View(label="Create index"))

    def execute(self, ctx):
        field_name = ctx.params["field_name"]
        unique = ctx.params.get("unique", False)

        ctx.dataset.create_index(field_name, unique=unique)


class DropIndex(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="drop_index",
            label="Drop index",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        indexes = ctx.dataset.list_indexes()

        default_indexes = set(ctx.dataset._get_default_indexes())
        if ctx.dataset._has_frame_fields():
            default_indexes.update(
                ctx.dataset._get_default_indexes(frames=True)
            )

        indexes = [i for i in indexes if i not in default_indexes]

        if indexes:
            index_selector = types.AutocompleteView()
            for key in indexes:
                index_selector.add_choice(key, label=key)

            inputs.enum(
                "index_name",
                index_selector.values(),
                required=True,
                label="Index name",
                description="The index to drop",
                view=index_selector,
            )
        else:
            prop = inputs.str(
                "index_name",
                label="This dataset has no non-default indexes",
                view=types.Warning(),
            )
            prop.invalid = True

        return types.Property(inputs, view=types.View(label="Drop index"))

    def execute(self, ctx):
        index_name = ctx.params["index_name"]

        ctx.dataset.drop_index(index_name)


class CreateSummaryField(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="create_summary_field",
            label="Create summary field",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        _create_summary_field_inputs(ctx, inputs)

        return types.Property(
            inputs, view=types.View(label="Create summary field")
        )

    def execute(self, ctx):
        path = ctx.params["path"]
        field_name = ctx.params.get("field_name", None)
        sidebar_group = ctx.params.get("sidebar_group", None)
        include_counts = ctx.params.get("include_counts", False)
        group_by = ctx.params.get("group_by", None)
        read_only = ctx.params.get("read_only", True)
        create_index = ctx.params.get("create_index", True)

        if not sidebar_group:
            sidebar_group = False

        ctx.dataset.create_summary_field(
            path,
            field_name=field_name,
            sidebar_group=sidebar_group,
            include_counts=include_counts,
            group_by=group_by,
            read_only=read_only,
            create_index=create_index,
        )

        ctx.trigger("reload_dataset")


def _create_summary_field_inputs(ctx, inputs):
    schema = ctx.dataset.get_field_schema(flat=True)
    if ctx.dataset._has_frame_fields():
        frame_schema = ctx.dataset.get_frame_field_schema(flat=True)
        schema.update(
            {
                ctx.dataset._FRAMES_PREFIX + path: field
                for path, field in frame_schema.items()
            }
        )

    categorical_field_types = (fo.StringField, fo.BooleanField)
    numeric_field_types = (
        fo.FloatField,
        fo.IntField,
        fo.DateField,
        fo.DateTimeField,
    )

    schema = {
        p: f
        for p, f in schema.items()
        if (
            isinstance(f, categorical_field_types)
            or isinstance(f, numeric_field_types)
        )
    }

    path_keys = list(schema.keys())
    path_selector = types.AutocompleteView()
    for key in path_keys:
        path_selector.add_choice(key, label=key)

    inputs.enum(
        "path",
        path_selector.values(),
        label="Input field",
        description="The input field to summarize",
        view=path_selector,
        required=True,
    )

    path = ctx.params.get("path", None)
    if path is None or path not in path_keys:
        return

    field_name = ctx.params.get("field_name", None)
    if field_name is None:
        default_field_name = ctx.dataset._get_default_summary_field_name(path)
    else:
        default_field_name = field_name

    field_name_prop = inputs.str(
        "field_name",
        required=False,
        label="Summary field",
        description="The sample field in which to store the summary data",
        default=default_field_name,
    )

    if field_name and field_name in path_keys:
        field_name_prop.invalid = True
        field_name_prop.error_message = f"Field '{field_name}' already exists"
        inputs.str(
            "error",
            label="Error",
            view=types.Error(
                label="Field already exists",
                description=f"Field '{field_name}' already exists",
            ),
        )
        return

    if ctx.dataset.app_config.sidebar_groups is not None:
        sidebar_group_selector = types.AutocompleteView()
        for group in ctx.dataset.app_config.sidebar_groups:
            sidebar_group_selector.add_choice(group.name, label=group.name)
    else:
        sidebar_group_selector = None

    inputs.str(
        "sidebar_group",
        default="summaries",
        required=False,
        label="Sidebar group",
        description=(
            "The name of an "
            "[App sidebar group](https://docs.voxel51.com/user_guide/app.html#sidebar-groups) "
            "to which to add the summary field"
        ),
        view=sidebar_group_selector,
    )

    field = schema.get(path, None)
    if isinstance(field, categorical_field_types):
        inputs.bool(
            "include_counts",
            label="Include counts",
            description=(
                "Whether to include per-value counts when summarizing the "
                "categorical field"
            ),
            default=False,
        )
    elif isinstance(field, numeric_field_types):
        group_prefix = path.rsplit(".", 1)[0] + "."
        group_by_keys = sorted(p for p in schema if p.startswith(group_prefix))
        group_by_selector = types.AutocompleteView()
        for group in group_by_keys:
            group_by_selector.add_choice(group, label=group)

        inputs.enum(
            "group_by",
            group_by_selector.values(),
            default=None,
            required=False,
            label="Group by",
            description=(
                "An optional attribute to group by when to generate "
                "per-attribute `[min, max]` ranges"
            ),
            view=group_by_selector,
        )

    inputs.bool(
        "read_only",
        default=True,
        required=False,
        label="Read-only",
        description="Whether to mark the summary field as read-only",
    )

    inputs.bool(
        "create_index",
        default=True,
        required=False,
        label="Create index",
        description=(
            "Whether to create database index(es) for the summary field"
        ),
    )


class UpdateSummaryField(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="update_summary_field",
            label="Update summary field",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        _update_summary_field_inputs(ctx, inputs)

        return types.Property(
            inputs, view=types.View(label="Update summary field")
        )

    def execute(self, ctx):
        field_name = ctx.params["field_name"]

        ctx.dataset.update_summary_field(field_name)
        ctx.trigger("reload_dataset")


def _update_summary_field_inputs(ctx, inputs):
    summary_fields = ctx.dataset.list_summary_fields()

    if not summary_fields:
        prop = inputs.str(
            "field_name",
            label="This dataset does not have summary fields",
            view=types.Warning(),
        )
        prop.invalid = True
        return

    field_selector = types.AutocompleteView()
    for key in summary_fields:
        field_selector.add_choice(key, label=key)

    inputs.enum(
        "field_name",
        field_selector.values(),
        required=True,
        label="Summary field",
        description="The summary field to delete",
        view=field_selector,
    )

    field_name = ctx.params.get("field_name", None)
    if field_name not in summary_fields:
        return

    update_fields = ctx.dataset.check_summary_fields()
    if field_name not in update_fields:
        prop = inputs.str(
            "check_field",
            label=(f"Summary field '{field_name}' is already " "up-to-date"),
            view=types.Warning(),
        )
        prop.invalid = True


class DeleteSummaryField(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="delete_summary_field",
            label="Delete summary field",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        summary_fields = ctx.dataset.list_summary_fields()

        if summary_fields:
            field_selector = types.AutocompleteView()
            for key in summary_fields:
                field_selector.add_choice(key, label=key)

            inputs.enum(
                "field_name",
                field_selector.values(),
                required=True,
                label="Summary field",
                description="The summary field to delete",
                view=field_selector,
            )
        else:
            prop = inputs.str(
                "field_name",
                label="This dataset does not have summary fields",
                view=types.Warning(),
            )
            prop.invalid = True

        return types.Property(
            inputs, view=types.View(label="Delete summary field")
        )

    def execute(self, ctx):
        field_name = ctx.params["field_name"]

        ctx.dataset.delete_summary_field(field_name)
        ctx.trigger("reload_dataset")


class AddGroupSlice(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="add_group_slice",
            label="Add group slice",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        if ctx.dataset.media_type != fom.GROUP:
            prop = inputs.str(
                "msg",
                label="This dataset does not contain groups",
                view=types.Warning(),
            )
            prop.invalid = True
        else:
            name_prop = inputs.str(
                "name",
                default=None,
                required=True,
                label="Group slice",
                description="A name for the new group slice",
            )

            name = ctx.params.get("name", None)
            if name in ctx.dataset.group_media_types:
                name_prop.invalid = True
                name_prop.error_message = (
                    f"Group slice '{name}' already exists"
                )

            media_type_selector = types.AutocompleteView()
            media_types = fom.MEDIA_TYPES
            for key in media_types:
                media_type_selector.add_choice(key, label=key)

            inputs.enum(
                "media_type",
                media_type_selector.values(),
                default=None,
                required=True,
                label="Media type",
                description="The media type of the slice",
                view=media_type_selector,
            )

        return types.Property(inputs, view=types.View(label="Add group slice"))

    def execute(self, ctx):
        name = ctx.params["name"]
        media_type = ctx.params["media_type"]

        ctx.dataset.add_group_slice(name, media_type)
        ctx.trigger("reload_dataset")


class RenameGroupSlice(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="rename_group_slice",
            label="Rename group slice",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        if ctx.dataset.media_type != fom.GROUP:
            prop = inputs.str(
                "msg",
                label="This dataset does not contain groups",
                view=types.Warning(),
            )
            prop.invalid = True
        else:
            slice_selector = types.AutocompleteView()
            group_slices = ctx.dataset.group_slices
            for key in group_slices:
                slice_selector.add_choice(key, label=key)

            inputs.enum(
                "name",
                slice_selector.values(),
                default=ctx.group_slice,
                required=True,
                label="Group slice",
                description="The group slice to rename",
                view=slice_selector,
            )

            new_name_prop = inputs.str(
                "new_name",
                default=None,
                required=True,
                label="New group slice name",
                description="A new name for the group slice",
            )

            new_name = ctx.params.get("new_name", None)
            if new_name in group_slices:
                new_name_prop.invalid = True
                new_name_prop.error_message = (
                    f"Group slice '{new_name}' already exists"
                )

        return types.Property(
            inputs, view=types.View(label="Rename group slice")
        )

    def execute(self, ctx):
        name = ctx.params["name"]
        new_name = ctx.params["new_name"]

        ctx.dataset.rename_group_slice(name, new_name)
        if ctx.group_slice == name:
            ctx.ops.set_group_slice(new_name)

        ctx.ops.reload_dataset()


class DeleteGroupSlice(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="delete_group_slice",
            label="Delete group slice",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        if ctx.dataset.media_type != fom.GROUP:
            prop = inputs.str(
                "msg",
                label="This dataset does not contain groups",
                view=types.Warning(),
            )
            prop.invalid = True
        else:
            slice_selector = types.AutocompleteView()
            group_slices = ctx.dataset.group_slices
            for key in group_slices:
                slice_selector.add_choice(key, label=key)

            inputs.enum(
                "name",
                slice_selector.values(),
                default=ctx.group_slice,
                required=True,
                label="Group slice",
                description="The group slice to delete",
                view=slice_selector,
            )

        return types.Property(
            inputs, view=types.View(label="Delete group slice")
        )

    def execute(self, ctx):
        name = ctx.params["name"]

        ctx.dataset.delete_group_slice(name)
        if ctx.group_slice == name:
            ctx.ops.set_group_slice(ctx.dataset.default_group_slice)

        ctx.ops.reload_dataset()


class ListSavedViews(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="list_saved_views",
            label="List saved views",
            unlisted=True,
        )

    def execute(self, ctx):
        return {"views": ctx.dataset.list_saved_views(info=True)}


class LoadSavedView(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="load_saved_view",
            label="Load saved view",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        saved_views = ctx.dataset.list_saved_views()

        if saved_views:
            saved_view_selector = types.AutocompleteView()
            for key in saved_views:
                saved_view_selector.add_choice(key, label=key)

            inputs.enum(
                "name",
                saved_view_selector.values(),
                default=None,
                required=True,
                label="Saved view",
                description="The saved view to load",
                view=saved_view_selector,
            )
        else:
            prop = inputs.str(
                "msg",
                label="This dataset has no saved views",
                view=types.Warning(),
            )
            prop.invalid = True

        return types.Property(inputs, view=types.View(label="Load saved view"))

    def execute(self, ctx):
        name = ctx.params["name"]

        ctx.ops.set_view(name=name)


class SaveView(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="save_view",
            label="Save view",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        saved_views = ctx.dataset.list_saved_views()
        saved_view_selector = types.AutocompleteView()
        for key in saved_views:
            saved_view_selector.add_choice(key, label=key)

        inputs.str(
            "name",
            required=True,
            label="Name",
            description="A new or existing name for the view",
            view=saved_view_selector,
        )

        inputs.str(
            "description",
            default=None,
            required=False,
            label="Description",
            description="An optional description for the view",
        )

        inputs.str(
            "color",
            default=None,
            required=False,
            label="Color",
            description=(
                "An optional RGB color string like `#FF6D04` for the view"
            ),
        )

        name = ctx.params.get("name", None)

        if name in saved_views:
            inputs.view(
                "overwrite",
                types.Notice(
                    label=f"This will overwrite existing saved view '{name}'"
                ),
            )

        return types.Property(inputs, view=types.View(label="Save view"))

    def execute(self, ctx):
        name = ctx.params.get("name", None)
        description = ctx.params.get("description", None)
        color = ctx.params.get("color", None)

        ctx.dataset.save_view(
            name,
            ctx.view,
            description=description,
            color=color,
            overwrite=True,
        )


class EditSavedViewInfo(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="edit_saved_view_info",
            label="Edit saved view info",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        _edit_saved_view_info_inputs(ctx, inputs)

        return types.Property(
            inputs, view=types.View(label="Edit saved view info")
        )

    def execute(self, ctx):
        name = ctx.params.get("name", None)
        new_name = ctx.params.get("new_name", None)
        description = ctx.params.get("description", None)
        color = ctx.params.get("color", None)

        info = dict(name=new_name, description=description, color=color)
        ctx.dataset.update_saved_view_info(name, info)


def _edit_saved_view_info_inputs(ctx, inputs):
    saved_views = ctx.dataset.list_saved_views()

    if not saved_views:
        prop = inputs.str(
            "msg",
            label="This dataset has no saved views",
            view=types.Warning(),
        )
        prop.invalid = True
        return

    saved_view_selector = types.AutocompleteView()
    for key in saved_views:
        saved_view_selector.add_choice(key, label=key)

    inputs.enum(
        "name",
        saved_view_selector.values(),
        default=ctx.view.name,
        required=True,
        label="Saved view",
        description="The saved view to edit",
        view=saved_view_selector,
    )

    name = ctx.params.get("name", None)
    if name is None or name not in saved_views:
        return

    info = ctx.dataset.get_saved_view_info(name)

    new_name_prop = inputs.str(
        "new_name",
        default=info.get("name"),
        required=False,
        label="New name",
        description="A new name for the saved view",
    )

    new_name = ctx.params.get("new_name", None)
    if new_name != name and new_name in saved_views:
        new_name_prop.invalid = True
        new_name_prop.error_message = (
            f"Saved view with name '{new_name}' already exists"
        )

    inputs.str(
        "description",
        default=info.get("description"),
        required=False,
        label="Description",
        description="An optional description for the saved view",
    )

    inputs.str(
        "color",
        default=info.get("color"),
        required=False,
        label="Color",
        description=(
            "An optional RGB color string like `#FF6D04` for the saved view"
        ),
    )


class DeleteSavedView(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="delete_saved_view",
            label="Delete saved view",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        saved_views = ctx.dataset.list_saved_views()

        if saved_views:
            saved_view_selector = types.AutocompleteView()
            for key in saved_views:
                saved_view_selector.add_choice(key, label=key)

            inputs.enum(
                "name",
                saved_view_selector.values(),
                default=None,
                required=True,
                label="Saved view",
                description="The saved view to delete",
                view=saved_view_selector,
            )
        else:
            prop = inputs.str(
                "msg",
                label="This dataset has no saved views",
                view=types.Warning(),
            )
            prop.invalid = True

        return types.Property(
            inputs, view=types.View(label="Delete saved view")
        )

    def execute(self, ctx):
        name = ctx.params["name"]

        ctx.dataset.delete_saved_view(name)


class ListWorkspaces(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="list_workspaces",
            label="List workspaces",
            unlisted=True,
        )

    def execute(self, ctx):
        return {"workspaces": ctx.dataset.list_workspaces(info=True)}


class LoadWorkspace(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="load_workspace",
            label="Load workspace",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        workspaces = ctx.dataset.list_workspaces()

        if workspaces:
            workspace_selector = types.AutocompleteView()
            for key in workspaces:
                workspace_selector.add_choice(key, label=key)

            inputs.enum(
                "name",
                workspace_selector.values(),
                default=None,
                required=True,
                label="Workspace",
                description="The workspace to load",
                view=workspace_selector,
            )
        else:
            prop = inputs.str(
                "msg",
                label="This dataset has no saved workspaces",
                view=types.Warning(),
            )
            prop.invalid = True

        return types.Property(inputs, view=types.View(label="Load workspace"))

    def execute(self, ctx):
        name = ctx.params["name"]

        ctx.ops.set_spaces(name=name)


class SaveWorkspace(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="save_workspace",
            label="Save workspace",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        workspaces = ctx.dataset.list_workspaces()
        workspace_selector = types.AutocompleteView()
        for key in workspaces:
            workspace_selector.add_choice(key, label=key)

        inputs.str(
            "name",
            required=True,
            label="Name",
            description="A name for the saved workspace",
            view=workspace_selector,
        )

        inputs.str(
            "description",
            default=None,
            required=False,
            label="Description",
            description="An optional description for the workspace",
        )

        inputs.str(
            "color",
            default=None,
            required=False,
            label="Color",
            description=(
                "An optional RGB color string like `#FF6D04` for the workspace"
            ),
        )

        # @todo infer this automatically from current App spaces
        spaces_prop = inputs.oneof(
            "spaces",
            [types.String(), types.Object()],
            default=None,
            required=True,
            label="Spaces",
            description=(
                "JSON description of the workspace to save: "
                "`print(session.spaces.to_json(True))`"
            ),
            view=types.CodeView(),
        )

        spaces = ctx.params.get("spaces", None)
        if spaces is not None:
            try:
                _parse_spaces(spaces)
            except:
                spaces_prop.invalid = True
                spaces_prop.error_message = "Invalid workspace definition"

        name = ctx.params.get("name", None)

        if name in workspaces:
            inputs.view(
                "overwrite",
                types.Notice(
                    label=f"This will overwrite existing workspace '{name}'"
                ),
            )

        return types.Property(inputs, view=types.View(label="Save workspace"))

    def execute(self, ctx):
        name = ctx.params.get("name", None)
        description = ctx.params.get("description", None)
        color = ctx.params.get("color", None)
        spaces = ctx.params.get("spaces", None)

        spaces = _parse_spaces(spaces)

        ctx.dataset.save_workspace(
            name,
            spaces,
            description=description,
            color=color,
            overwrite=True,
        )


class EditWorkspaceInfo(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="edit_workspace_info",
            label="Edit workspace info",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        _edit_workspace_info_inputs(ctx, inputs)

        return types.Property(
            inputs, view=types.View(label="Edit workspace info")
        )

    def execute(self, ctx):
        name = ctx.params.get("name", None)
        new_name = ctx.params.get("new_name", None)
        description = ctx.params.get("description", None)
        color = ctx.params.get("color", None)

        info = dict(name=new_name, description=description, color=color)
        ctx.dataset.update_workspace_info(name, info)


def _edit_workspace_info_inputs(ctx, inputs):
    workspaces = ctx.dataset.list_workspaces()

    if not workspaces:
        prop = inputs.str(
            "msg",
            label="This dataset has no saved workspaces",
            view=types.Warning(),
        )
        prop.invalid = True
        return

    workspace_selector = types.AutocompleteView()
    for key in workspaces:
        workspace_selector.add_choice(key, label=key)

    # @todo default to current workspace name, if one is currently open
    inputs.enum(
        "name",
        workspace_selector.values(),
        required=True,
        label="Workspace",
        description="The workspace to edit",
        view=workspace_selector,
    )

    name = ctx.params.get("name", None)
    if name is None or name not in workspaces:
        return

    info = ctx.dataset.get_workspace_info(name)

    new_name_prop = inputs.str(
        "new_name",
        default=info.get("name"),
        required=False,
        label="New name",
        description="A new name for the workspace",
    )

    new_name = ctx.params.get("new_name", None)
    if new_name != name and new_name in workspaces:
        new_name_prop.invalid = True
        new_name_prop.error_message = (
            f"Workspace with name '{new_name}' already exists"
        )

    inputs.str(
        "description",
        default=info.get("description"),
        required=False,
        label="Description",
        description="An optional description for the workspace",
    )

    inputs.str(
        "color",
        default=info.get("color"),
        required=False,
        label="Color",
        description=(
            "An optional RGB color string like `#FF6D04` for the workspace"
        ),
    )


class DeleteWorkspace(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="delete_workspace",
            label="Delete workspace",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        workspaces = ctx.dataset.list_workspaces()

        if workspaces:
            workspace_selector = types.AutocompleteView()
            for key in workspaces:
                workspace_selector.add_choice(key, label=key)

            inputs.enum(
                "name",
                workspace_selector.values(),
                default=None,
                required=True,
                label="Workspace",
                description="The workspace to delete",
                view=workspace_selector,
            )
        else:
            prop = inputs.str(
                "msg",
                label="This dataset has no saved workspaces",
                view=types.Warning(),
            )
            prop.invalid = True

        return types.Property(
            inputs, view=types.View(label="Delete workspace")
        )

    def execute(self, ctx):
        name = ctx.params["name"]

        ctx.dataset.delete_workspace(name)


class SyncLastModifiedAt(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="sync_last_modified_at",
            label="Sync last modified at",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        instructions = """
This operation updates the `last_modified_at` property of the dataset if
necessary to incorporate any modification timestamps to its samples.
        """

        inputs.str(
            "instructions",
            default=instructions.strip(),
            view=types.MarkdownView(read_only=True),
        )

        if ctx.dataset._has_frame_fields():
            inputs.bool(
                "include_frames",
                default=True,
                required=False,
                label="Include frames",
                description=(
                    "Whether to sync the `last_modified_at` property of each "
                    "video sample first if necessary to incorporate any "
                    "modification timestamps to its frames"
                ),
            )

        return types.Property(
            inputs, view=types.View(label="Sync last modified at")
        )

    def execute(self, ctx):
        include_frames = ctx.params.get("include_frames", True)

        ctx.dataset.sync_last_modified_at(include_frames=include_frames)


class ListFiles(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="list_files",
            label="List Files",
            unlisted=True,
        )

    def execute(self, ctx):
        path = ctx.params.get("path", None)
        list_fs = ctx.params.get("list_filesystems", False)

        if list_fs:
            return {"filesystems": list_filesystems()}

        if path:
            try:
                return {"files": list_files(path)}
            except Exception as e:
                return {"files": [], "error": str(e)}


def get_default_path_for_filesystem(fs):
    if fs == fos.FileSystem.LOCAL:
        HOME = os.environ.get("HOME", None)
        return os.environ.get("FIFTYONE_DEFAULT_LOCAL_PATH", HOME)
    else:
        raise ValueError("Unsupported file system '%s'" % fs)


def list_filesystems():
    filesystems = fos.list_available_file_systems()
    results = []
    for fs in fos.FileSystem:
        if fs in filesystems:
            results.append(
                {
                    "name": fs.name,
                    "default_path": get_default_path_for_filesystem(fs),
                }
            )
    return results


def list_files(dirpath):
    dirs = [
        {
            "name": name,
            "type": "directory",
            "absolute_path": fos.join(dirpath, name),
        }
        for name in fos.list_subdirs(dirpath)
    ]
    files = [
        {
            "name": d["name"],
            "date_modified": d["last_modified"].isoformat(),
            "type": "file",
            "size": d["size"],
            "absolute_path": fos.join(dirpath, d["name"]),
        }
        for d in fos.list_files(dirpath, return_metadata=True)
    ]
    return dirs + files


def _get_target_view(ctx, target):
    if target == "SELECTED_LABELS":
        return ctx.view.select_labels(labels=ctx.selected_labels)

    if target == "SELECTED_SAMPLES":
        return ctx.view.select(ctx.selected)

    if target == "DATASET":
        return ctx.dataset

    return ctx.view


def _get_non_default_sample_fields(dataset):
    schema = dataset.get_field_schema(flat=True)

    roots = {
        path.rsplit(".", 1)[0] if "." in path else None
        for path in schema.keys()
    }

    default_fields = set()
    for root in roots:
        default_fields.update(dataset._get_default_sample_fields(path=root))

    for path in default_fields:
        schema.pop(path, None)

    return schema


def _get_non_default_frame_fields(dataset):
    schema = dataset.get_frame_field_schema(flat=True)

    roots = {
        path.rsplit(".", 1)[0] if "." in path else None
        for path in schema.keys()
    }

    default_fields = set()
    for root in roots:
        default_fields.update(dataset._get_default_frame_fields(path=root))

    for path in default_fields:
        schema.pop(path, None)

    return schema


def _parse_spaces(spaces):
    if isinstance(spaces, dict):
        return fo.Space.from_dict(spaces)
    return fo.Space.from_json(spaces)


BUILTIN_OPERATORS = [
    EditFieldInfo(_builtin=True),
    CloneSelectedSamples(_builtin=True),
    CloneSampleField(_builtin=True),
    CloneFrameField(_builtin=True),
    RenameSampleField(_builtin=True),
    RenameFrameField(_builtin=True),
    ClearSampleField(_builtin=True),
    ClearFrameField(_builtin=True),
    DeleteSelectedSamples(_builtin=True),
    DeleteSelectedLabels(_builtin=True),
    DeleteSampleField(_builtin=True),
    DeleteFrameField(_builtin=True),
    CreateIndex(_builtin=True),
    DropIndex(_builtin=True),
    CreateSummaryField(_builtin=True),
    UpdateSummaryField(_builtin=True),
    DeleteSummaryField(_builtin=True),
    AddGroupSlice(_builtin=True),
    RenameGroupSlice(_builtin=True),
    DeleteGroupSlice(_builtin=True),
    ListSavedViews(_builtin=True),
    LoadSavedView(_builtin=True),
    SaveView(_builtin=True),
    EditSavedViewInfo(_builtin=True),
    DeleteSavedView(_builtin=True),
    ListWorkspaces(_builtin=True),
    LoadWorkspace(_builtin=True),
    SaveWorkspace(_builtin=True),
    EditWorkspaceInfo(_builtin=True),
    DeleteWorkspace(_builtin=True),
    SyncLastModifiedAt(_builtin=True),
    ListFiles(_builtin=True),
]
