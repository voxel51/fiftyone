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
            "config": ctx.dataset.compute_annotation_schema(
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
        paths = ctx.params.get("paths", None)

        schemas = {}
        for path in paths:
            schemas[path] = ctx.dataset.get_field(path).schema

        return {"schemas": schemas}


class ActivateAnnotationSchemas(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="activate_annotation_schemas",
            label="Activate annotation schemas",
            unlisted=True,
        )

    def execute(self, ctx):
        for path in ctx.params.get("paths", []):
            field = ctx.dataset.get_field(path)
            field.schema["active"] = True

        ctx.dataset.save()


class DeleteAnnotationSchema(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="delete_annotation_schema",
            label="Delete annotation schema",
            unlisted=True,
        )

    def execute(self, ctx):
        path = ctx.params.get("path", None)

        field = ctx.dataset.get_field(path)
        field.schema = None
        field.save()


class DeactivateAnnotationSchemas(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="deactivate_annotation_schemas",
            label="Deactivate annotation schemas",
            unlisted=True,
        )

    def execute(self, ctx):
        for path in ctx.params.get("paths", []):
            field = ctx.dataset.get_field(path)
            field.schema["active"] = False

        ctx.dataset.save()


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

        field = ctx.dataset.get_field(path)

        if not field.schema:
            field.schema = {"active": False}

        field.schema["config"] = config
        field.save()

        return {"config": config}


class AddBoundingBox(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="add_bounding_box",
            label="Add bounding box",
            unlisted=True,
        )

    def execute(self, ctx):
        field = ctx.params.get("field", None)
        sample_id = ctx.params.get("sample_id", None)
        path = ctx.params.get("path", None)
        label = ctx.params.get("label", None)
        bounding_box = ctx.params.get("bounding_box", None)

        sample = ctx.dataset[sample_id]
        field_obj = sample[field]
        detection_obj = field_obj[path]
        detection_obj.append(
            fo.Detection(label=label, bounding_box=bounding_box)
        )

        sample.save()
