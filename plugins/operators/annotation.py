"""
Compute annotation schema operator

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import fiftyone as fo
import fiftyone.operators as foo


class ComputeAnnotationSchema(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="compute_annotation_schema",
            label="Compute annotation schema",
            unlisted=True,
        )

    def execute(self, ctx):
        path = ctx.params.get("path", None)

        return {
            "config": ctx.dataset.generate_annotation_schema(
                path, scan_samples=ctx.params.get("scan_samples", True)
            )
        }


class GetAnnotationSchemas(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="get_annotation_schemas",
            label="Get annotation schemas",
            unlisted=True,
        )

    def execute(self, ctx):
        return {"schemas": ctx.dataset.label_schema or {}}


class ActivateAnnotationSchemas(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="activate_annotation_schemas",
            label="Activate annotation schemas",
            unlisted=True,
        )

    def execute(self, ctx):
        ctx.dataset.activate_label_schemas(ctx.params.get("paths", []))


class DeleteAnnotationSchema(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="delete_annotation_schema",
            label="Delete annotation schema",
            unlisted=True,
        )

    def execute(self, ctx):
        paths = ctx.params.get("paths", [])
        ctx.dataset.deactivate_label_schemas(paths)
        schema = ctx.dataset.label_schema
        for path in paths:
            del schema[path]

        ctx.dataset.save()


class DeactivateAnnotationSchemas(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="deactivate_annotation_schemas",
            label="Deactivate annotation schemas",
            unlisted=True,
        )

    def execute(self, ctx):
        paths = ctx.params.get("paths", [])
        ctx.dataset.deactivate_label_schemas(paths)


class SaveAnnotationSchema(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="save_annotation_schema",
            label="Save annotation schema",
            unlisted=True,
        )

    def execute(self, ctx):
        path = ctx.params.get("path", None)
        config = ctx.params.get("config", None)
        label_schema = ctx.dataset.label_schema or {}
        label_schema[path] = config

        ctx.dataset.label_schema = label_schema

        return {"config": config}
