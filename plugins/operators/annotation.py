"""
Annotation label schemas operators

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging

import fiftyone.core.annotation as foa
import fiftyone.core.annotation.constants as foac
import fiftyone.core.annotation.utils as foau
from fiftyone.core.annotation.validate_label_schemas import (
    ValidationErrors,
    validate_label_schemas,
)
import fiftyone.core.fields as fof
import fiftyone.operators as foo

logger = logging.getLogger(__name__)


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
        ctx.dataset.save()


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
        new_attributes = ctx.params.get("new_attributes", None)

        try:
            ctx.dataset.update_label_schema(
                field, label_schema, new_attributes=new_attributes
            )
        except Exception as e:
            ctx.ops.notify(str(e), variant="error")
            return {"error": str(e)}

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


def _add_base_label_subfields(dataset, base_path):
    """Add base subfields shared by all label types (id, label, tags, confidence)."""
    dataset.add_sample_field(f"{base_path}.id", fof.ObjectIdField)
    dataset.add_sample_field(f"{base_path}.label", fof.StringField)
    dataset.add_sample_field(f"{base_path}.confidence", fof.FloatField)
    dataset.add_sample_field(
        f"{base_path}.tags", fof.ListField, subfield=fof.StringField()
    )


def _add_default_label_subfields(dataset, field_name, field_type):
    """Add default nested fields to the data schema.

    This adds the standard Detection/Classification subfields to the dataset's
    data schema so that the label schema validation passes.
    """
    if field_type == "detections":
        # Detections has a nested 'detections' list of Detection objects
        base_path = f"{field_name}.detections"
        _add_base_label_subfields(dataset, base_path)
        # Detection also has 'index'
        dataset.add_sample_field(f"{base_path}.index", fof.IntField)
    elif field_type == "classification":
        # Classification fields directly on the field
        _add_base_label_subfields(dataset, field_name)


class CreateAndActivateField(foo.Operator):
    """Create a new label or primitive field, generate its schema, and activate it."""

    @property
    def config(self):
        return foo.OperatorConfig(
            name="create_and_activate_field",
            label="Create and activate field",
            unlisted=True,
        )

    def execute(self, ctx):
        field_name = ctx.params.get("field_name")
        field_category = ctx.params.get("field_category")
        field_type = ctx.params.get("field_type")
        read_only = ctx.params.get("read_only", False)

        # Create the field in data schema
        if field_category == "label":
            label_cls = foac.LABEL_TYPE_TO_CLASS.get(field_type)
            if label_cls is None:
                ctx.ops.notify(
                    f"Unknown label type: {field_type}", variant="error"
                )
                return {"error": f"Unknown label type: {field_type}"}

            ctx.dataset.add_sample_field(
                field_name,
                fof.EmbeddedDocumentField,
                embedded_doc_type=label_cls,
                read_only=read_only,
            )

            # Add default nested fields to data schema
            _add_default_label_subfields(ctx.dataset, field_name, field_type)

            # Get label schema config from frontend
            label_schema_config = ctx.params.get("label_schema_config", {})

            # Add any custom attribute fields to data schema
            new_attributes = label_schema_config.get("new_attributes")
            if new_attributes:
                foau.add_new_attributes(
                    ctx.dataset, field_name, new_attributes
                )

            # Build label schema from frontend config
            # Frontend sends: attributes, classes, component
            classes = label_schema_config.get("classes")

            # Determine component based on number of classes
            if classes and len(classes) > foac.CHECKBOXES_OR_RADIO_THRESHOLD:
                component = foac.DROPDOWN
            else:
                component = foac.RADIO

            # Build label schema
            label_schema = {
                "type": field_type,
                "component": component,
                "attributes": label_schema_config.get("attributes", []),
                # omit empty classes to pass validation
                **({"classes": classes} if classes else {}),
            }
        else:  # primitive
            _create_primitive_field(
                ctx.dataset, field_name, field_type, read_only
            )
            # Generate base schema for primitive fields
            label_schema = ctx.dataset.generate_label_schemas(
                fields=field_name,
                scan_samples=False,
            )
            # Merge user-provided config (component, values, range, etc.)
            schema_config = ctx.params.get("schema_config")
            if schema_config:
                label_schema.update(schema_config)

        # Set the label schema (validation now works for newly created fields)
        ctx.dataset.update_label_schema(field_name, label_schema)

        # Activate the field (prepend to make it appear at top)
        active = ctx.dataset.active_label_schemas or []
        ctx.dataset.active_label_schemas = [field_name] + [
            f for f in active if f != field_name
        ]

        ctx.dataset.save()

        return {
            "field_name": field_name,
            "label_schema": label_schema,
        }


def _create_primitive_field(dataset, field_name, field_type, read_only):
    """Helper to create primitive fields using TYPES_TO_FIELD_TYPE mapping."""
    ftype = foac.TYPES_TO_FIELD_TYPE.get(field_type)
    if ftype is None:
        raise ValueError(f"Unknown primitive type: {field_type}")

    # List types need ListField wrapper with subfield
    if field_type.startswith("list<"):
        dataset.add_sample_field(
            field_name,
            fof.ListField,
            subfield=ftype(),
            read_only=read_only,
        )
    else:
        dataset.add_sample_field(
            field_name,
            ftype,
            read_only=read_only,
        )
