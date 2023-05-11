import fiftyone.operators as foo
import fiftyone.operators.types as types
import fiftyone as fo


class CloneSelectedSamples(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="clone_selected_samples",
            label="Clone Selected Samples",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()
        sample_ids = ctx.selected
        count = len(sample_ids)
        header = "Clone Sample"
        if count > 0:
            sample_text = "sample" if count == 1 else "samples"
            header = f"Clone {count} {sample_text}?"
            inputs.str(
                "msg",
                label=f"Press 'Execute' to create a copy of the {count} selected {sample_text}.",
                view=types.Notice(space=6),
            )
            inputs.str(
                "btn",
                label="View Selected Samples",
                view=types.Button(operator="show_selected_samples", space=3),
            )
        else:
            header = f"No Samples Selected to Clone!"
            inputs.str(
                "msg",
                label="You must select a sample in the grid to clone.",
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
            label="Clone a Sample Field",
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
            label="Choose a Field",
            description="The field to copy into a new field of the dataset. You can use dot notation (embedded.field.name) to clone embedded fields.",
            view=field_selector,
            required=True,
        )
        if has_valid_field_name:
            field_name_default = f"{field_name}_copy"
            new_field_prop = inputs.str(
                "new_field_name",
                required=True,
                label="New Field",
                description="The name of the new field to create. Use dot notation (embedded.field.name) to create embedded fields.",
                default=field_name_default,
            )
            if new_field_name and new_field_name in field_keys:
                new_field_prop.invalid = True
                new_field_prop.error_message = (
                    f"Field name '{new_field_name}' already exists."
                )
                inputs.str(
                    "error",
                    label="Error",
                    view=types.Error(
                        label="Field name already exists.",
                        description=f"The Field name '{new_field_name}' already exists. You must choose a new Field name.",
                    ),
                )
        return types.Property(
            inputs, view=types.View(label="Clone Sample Field")
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
            label="Rename a Sample Field",
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
            label="Field Name to Rename",
            view=field_selector,
            required=True,
        )
        field_name = ctx.params.get("field_name", None)
        new_field_name = ctx.params.get("new_field_name", None)
        if field_name and field_name in field_keys:
            field_name_default = f"{field_name}_copy"
            new_field_prop = inputs.str(
                "new_field_name",
                required=True,
                label="New Field Name",
                default=field_name_default,
            )
            if new_field_name and new_field_name in field_keys:
                new_field_prop.invalid = True
                new_field_prop.error_message = (
                    f"Field name '{new_field_name}' already exists."
                )
                inputs.str(
                    "error",
                    label="Error",
                    view=types.Error(
                        label="Field name already exists.",
                        description=f"The Field name '{new_field_name}' already exists. You must choose a new Field name.",
                    ),
                )
        return types.Property(
            inputs, view=types.View(label="Rename Sample Field")
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
            label="Delete Selected Samples",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()
        sample_ids = ctx.selected
        count = len(sample_ids)
        header = "Delete Samples"
        if count > 0:
            sample_text = "sample" if count == 1 else "samples"
            header = f"Delete {count} {sample_text}?"
            inputs.str(
                "msg",
                label=f"Press 'Execute' to remove the {count} selected {sample_text}.",
                view=types.Notice(space=6),
            )
            inputs.str(
                "btn",
                label="Click to View Selected Samples",
                view=types.Button(operator="show_selected_samples", space=3),
            )
        else:
            header = f"No Samples Selected to Delete!"
            inputs.str(
                "msg",
                label="You must select a sample in the grid to clone.",
                view=types.Warning(),
            )
        return types.Property(inputs, view=types.View(label=header))

    def execute(self, ctx):
        ctx.dataset.delete_samples(ctx.selected)
        ctx.trigger("reload_samples")
        return {"deleted_samples": ctx.selected}

    def resolve_output(self, ctx):
        count = len(ctx.results.get("deleted_samples", []))
        outputs = types.Object()
        outputs.str(
            "deleted_samples",
            label=f"Deleted {count} Samples",
            view=types.Notice(),
        )
        return types.Property(
            outputs, view=types.View(label="Deleted Samples")
        )


class PrintStdout(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="print_stdout",
            label="Print to Stdout",
            unlisted=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()
        inputs.str("msg", label="Message", required=True)
        return types.Property(inputs, view=types.View(label="Print to Stdout"))

    def execute(self, ctx):
        print(ctx.params.get("msg", None))
        return {"msg": ctx.params.get("msg", None)}


BUILTIN_OPERATORS = [
    CloneSelectedSamples(_built_in=True),
    CloneSampleField(_built_in=True),
    RenameSampleField(_built_in=True),
    DeleteSelectedSamples(_built_in=True),
    PrintStdout(_built_in=True),
]
