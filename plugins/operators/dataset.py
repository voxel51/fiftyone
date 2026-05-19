"""
Builtin operators.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from dataclasses import asdict

import fiftyone.operators as foo
from fiftyone.core.state import serialize_fields


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
