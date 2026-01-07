"""
Annotation label schemas operators

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import fiftyone.core.annotation.constants as foac
import fiftyone.core.annotation.utils as foau
from fiftyone.core.annotation.validate_label_schemas import (
    ValidationErrors,
    validate_label_schemas,
)
import fiftyone.operators as foo


class ActivateLabelSchemas(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="activate_label_schemas",
            label="Activate label schemas",
            unlisted=True,
        )

    def execute(self, ctx):
        fields = ctx.params.get("fields", [])
        ctx.dataset.activate_label_schemas(fields)


class SetActiveLabelSchemas(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="set_active_label_schemas",
            label="Set active label schemas",
            unlisted=True,
        )

    def execute(self, ctx):
        fields = ctx.params.get("fields", [])
        ctx.dataset.active_label_schemas = fields


class DeleteLabelSchemas(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="delete_label_schemas",
            label="Delete label schemas",
            unlisted=True,
        )

    def execute(self, ctx):
        fields = ctx.params.get("fields", [])
        ctx.dataset.delete_label_schemas(fields)


class DeactivateLabelSchemas(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="deactivate_label_schemas",
            label="Deactivate label schemas",
            unlisted=True,
        )

    def execute(self, ctx):
        fields = ctx.params.get("fields", [])
        ctx.dataset.deactivate_label_schemas(fields)


class GenerateLabelSchemas(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="generate_label_schemas",
            label="Generate label schemas",
            unlisted=True,
        )

    def execute(self, ctx):
        field = ctx.params.get("field", None)
        return {
            "label_schema": ctx.dataset.generate_label_schemas(
                fields=field, scan_samples=ctx.params.get("scan_samples", True)
            )
        }


class GetLabelSchemas(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="get_label_schemas",
            label="Get label schemas",
            unlisted=True,
        )

    def execute(self, ctx):
        label_schemas = ctx.dataset.label_schemas
        fields = foau.list_valid_annotation_fields(ctx.dataset, flatten=True)
        supported_fields = foau.list_valid_annotation_fields(
            ctx.dataset, require_app_support=True, flatten=True
        )
        result = {}

        for field in fields:
            supported = field in supported_fields

            default_label_schema = None
            if supported:
                default_label_schema = ctx.dataset.generate_label_schemas(
                    fields=field, scan_samples=False
                )

            field_instance = ctx.dataset.get_field(field)
            read_only = field_instance.read_only
            _type = foau.get_type(field_instance)
            if _type == foac.LABEL:
                _type = field_instance.document_type.__name__.lower()

            result[field] = {
                "default_label_schema": default_label_schema,
                "read_only": read_only,
                "type": _type,
                "unsupported": not supported,
            }

            if field in label_schemas:
                result[field]["label_schema"] = label_schemas[field]

        return {
            "active_label_schemas": ctx.dataset.active_label_schemas,
            "label_schemas": result,
        }


class UpdateLabelSchema(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="update_label_schema",
            label="Update label schema",
            unlisted=True,
        )

    def execute(self, ctx):
        field = ctx.params.get("field", None)
        label_schema = ctx.params.get("label_schema", None)
        ctx.dataset.update_label_schema(field, label_schema)
        return {"label_schema": label_schema}


class ValidateLabelSchemas(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="validate_label_schemas",
            label="Validate label schemas",
            unlisted=True,
        )

    def execute(self, ctx):
        errors = []
        try:
            validate_label_schemas(
                ctx.dataset, ctx.params.get("label_schemas", {})
            )
        except ValidationErrors as exceptions:
            for exception in list(exceptions.exceptions):
                if isinstance(exception, ValidationErrors):
                    for subexception in exception.exceptions:
                        errors.append(str(subexception))
                    continue

                errors.append(str(exception))

        return {"errors": errors}
