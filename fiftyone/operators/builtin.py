"""
Builtin operators.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import fiftyone as fo
import fiftyone.operators as foo
import fiftyone.operators.types as types


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
        sample_ids = ctx.selected
        count = len(sample_ids)
        header = "Clone sample"
        if count > 0:
            sample_text = "sample" if count == 1 else "samples"
            header = f"Clone {count} {sample_text}?"
            inputs.str(
                "msg",
                label=f"Press 'Execute' to clone {count} selected {sample_text}",
                view=types.Notice(space=6),
            )
            inputs.str(
                "btn",
                label="Show selected samples",
                view=types.Button(operator="show_selected_samples", space=3),
            )
        else:
            header = "No selected samples"
            inputs.str(
                "msg",
                label="You must select samples in the grid to clone",
                view=types.Warning(),
            )

        return types.Property(inputs, view=types.View(label=header))

    def execute(self, ctx):
        sample_ids = ctx.selected
        if len(sample_ids) > 0:
            samples = ctx.dataset.select(sample_ids)
            cloned_samples = [
                fo.Sample.from_dict(dict(**sample.to_dict(), id=None))
                for sample in samples
            ]
            ctx.dataset.add_samples(cloned_samples)
            ctx.trigger("reload_samples")
            ctx.trigger(
                "show_samples",
                {"samples": [sample.id for sample in cloned_samples]},
            )

        return {}


class CloneSampleField(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="clone_sample_field",
            label="Clone sample field",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        field_name = ctx.params.get("field_name", None)
        new_field_name = ctx.params.get("new_field_name", None)
        inputs = types.Object()
        fields = ctx.dataset.get_field_schema(flat=True)
        field_keys = list(fields.keys())
        has_valid_field_name = field_name in field_keys
        field_selector = types.AutocompleteView()
        for key in field_keys:
            field_selector.add_choice(key, label=key)

        inputs.enum(
            "field_name",
            field_keys,
            label="Choose a field",
            description="The field to copy. You can use dot notation (embedded.field.name) to clone embedded fields",
            view=field_selector,
            required=True,
        )
        if has_valid_field_name:
            new_field_prop = inputs.str(
                "new_field_name",
                required=True,
                label="New field",
                description="The new field to create. You can use dot notation (embedded.field.name) to create embedded fields",
                default=f"{field_name}_copy",
            )
            if new_field_name and new_field_name in field_keys:
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

        return types.Property(
            inputs, view=types.View(label="Clone sample field")
        )

    def execute(self, ctx):
        ctx.dataset.clone_sample_field(
            ctx.params.get("field_name", None),
            ctx.params.get("new_field_name", None),
        )
        ctx.trigger("reload_dataset")
        return {"created_field": ctx.params.get("new_field_name", None)}


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
        fields = ctx.dataset.get_field_schema(flat=True)
        field_keys = list(fields.keys())
        field_selector = types.AutocompleteView()
        for key in field_keys:
            field_selector.add_choice(key, label=key)

        inputs.enum(
            "field_name",
            field_keys,
            label="Field to rename",
            view=field_selector,
            required=True,
        )
        field_name = ctx.params.get("field_name", None)
        new_field_name = ctx.params.get("new_field_name", None)
        if field_name and field_name in field_keys:
            new_field_prop = inputs.str(
                "new_field_name",
                required=True,
                label="New field name",
                default=f"{field_name}_copy",
            )
            if new_field_name and new_field_name in field_keys:
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

        return types.Property(
            inputs, view=types.View(label="Rename sample field")
        )

    def execute(self, ctx):
        ctx.dataset.rename_sample_field(
            ctx.params.get("field_name", None),
            ctx.params.get("new_field_name", None),
        )
        ctx.trigger("reload_dataset")
        return {"created_field": ctx.params.get("new_field_name", None)}


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
        sample_ids = ctx.selected
        count = len(sample_ids)
        header = "Delete samples"
        if count > 0:
            sample_text = "sample" if count == 1 else "samples"
            header = f"Delete {count} {sample_text}?"
            inputs.str(
                "msg",
                label=f"Press 'Execute' to delete {count} selected {sample_text}",
                view=types.Notice(space=6),
            )
            inputs.str(
                "btn",
                label="Show selected samples",
                view=types.Button(operator="show_selected_samples", space=3),
            )
        else:
            header = "No selected samples"
            inputs.str(
                "msg",
                label="You must select samples in the grid to delete",
                view=types.Warning(),
            )

        return types.Property(inputs, view=types.View(label=header))

    def execute(self, ctx):
        ctx.dataset.delete_samples(ctx.selected)
        ctx.trigger("reload_samples")
        return {"deleted_samples": ctx.selected}

    def resolve_output(self, ctx):
        count = len(ctx.results.get("deleted_samples", []))
        sample_text = "sample" if count == 1 else "samples"
        outputs = types.Object()
        outputs.str(
            "deleted_samples",
            label=f"Deleted {count} {sample_text}",
            view=types.Notice(),
        )
        return types.Property(
            outputs, view=types.View(label="Deleted samples")
        )


class PrintStdout(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="print_stdout",
            label="Print to stdout",
            unlisted=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()
        inputs.str("msg", label="Message", required=True)
        return types.Property(inputs, view=types.View(label="Print to stdout"))

    def execute(self, ctx):
        print(ctx.params.get("msg", None))
        return {"msg": ctx.params.get("msg", None)}


BUILTIN_OPERATORS = [
    CloneSelectedSamples(_builtin=True),
    CloneSampleField(_builtin=True),
    RenameSampleField(_builtin=True),
    DeleteSelectedSamples(_builtin=True),
    PrintStdout(_builtin=True),
]
