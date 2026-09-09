"""
Builtin operators.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from dataclasses import asdict

import fiftyone.operators as foo
import fiftyone.operators.types as types
from fiftyone.core.state import serialize_fields


class DeleteBrainRun(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="delete_brain_run",
            label="Delete brain run",
            dynamic=True,
            risk_level=types.RiskLevel.HIGH,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        brain_keys = ctx.dataset.list_brain_runs()
        if brain_keys:
            choices = types.DropdownView()
            for brain_key in brain_keys:
                choices.add_choice(brain_key, label=brain_key)

            inputs.enum(
                "brain_key",
                choices.values(),
                required=True,
                label="Brain key",
                description="The brain run to delete",
                view=choices,
            )

            brain_key = ctx.params.get("brain_key", None)
            if brain_key:
                inputs.str(
                    "msg",
                    label=(
                        f"Delete brain run '{brain_key}'? This deletes its "
                        "results and cannot be undone"
                    ),
                    view=types.Warning(),
                )
        else:
            prop = inputs.str(
                "msg",
                label="This dataset has no brain runs",
                view=types.Warning(),
            )
            prop.invalid = True

        view = types.View(label="Delete brain run")
        return types.Property(inputs, view=view)

    def execute(self, ctx):
        brain_key = ctx.params["brain_key"]

        # Cascades to the run's cleanup() (e.g. spatial index fields),
        # hence the dataset reload below
        ctx.dataset.delete_brain_run(brain_key)

        ctx.trigger("reload_dataset")


class GetFieldSchema(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="get_field_schema",
            label="Get field schema",
            unlisted=True,
        )

    def execute(self, ctx):
        schemas = dict()

        schemas["sample_fields"] = [
            asdict(field)
            for field in serialize_fields(
                ctx.dataset.get_field_schema(flat=True)
            )
        ]

        schemas["frame_fields"] = [
            asdict(field)
            for field in serialize_fields(
                ctx.dataset.get_frame_field_schema(flat=True)
            )
        ]

        return schemas
