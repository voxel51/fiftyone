"""
Annotation label schemas operators

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging

import fiftyone.core.annotation.constants as foac
import fiftyone.core.annotation.utils as foau
from fiftyone.core.annotation.validate_label_schemas import (
    ValidationErrors,
    validate_label_schemas,
)
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
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

        # Create new attribute fields first if specified
        if new_attributes:
            try:
                _add_new_attributes(ctx.dataset, field, new_attributes)
            except (TypeError, ValueError) as e:
                ctx.ops.notify(str(e), variant="error")
                return {"error": str(e)}

        try:
            ctx.dataset.update_label_schema(field, label_schema)
        except Exception as e:
            ctx.ops.notify(str(e), variant="error")
            return {"error": str(e)}

        return {"label_schema": label_schema}


def _validate_attribute_entry(attr_name, attr_schema, type_to_ftype):
    """Validate a single attribute entry.

    Args:
        attr_name: the attribute name
        attr_schema: the attribute schema dict
        type_to_ftype: mapping of type strings to field types

    Raises:
        TypeError: if attr_schema is not a dict
        ValueError: if attr_name or attr_type is invalid
    """
    if not isinstance(attr_name, str):
        raise ValueError(
            f"Attribute name must be a string, got {type(attr_name).__name__}"
        )

    if not isinstance(attr_schema, dict):
        raise TypeError(
            f"Attribute schema for '{attr_name}' must be a dict, "
            f"got {type(attr_schema).__name__}"
        )

    attr_type = attr_schema.get("type", "str")
    if not isinstance(attr_type, str):
        raise ValueError(
            f"Attribute type for '{attr_name}' must be a string, "
            f"got {type(attr_type).__name__}"
        )

    if attr_type not in type_to_ftype:
        raise ValueError(
            f"Unknown attribute type '{attr_type}' for attribute '{attr_name}'"
        )


def _validate_attribute_values(attr_name, attr_type, attr_schema):
    """Validate values for components that require them.

    Args:
        attr_name: the attribute name
        attr_type: the attribute type string
        attr_schema: the attribute schema dict

    Raises:
        ValueError: if values are missing, not a list, or have invalid types
    """
    component = attr_schema.get("component")
    is_list_type = attr_type.startswith("list<")

    if component not in foac.VALUES_COMPONENTS and not is_list_type:
        return

    values = attr_schema.get("values")

    if values is None or values == []:
        raise ValueError(
            f"Values for attribute '{attr_name}' must be a non-empty list "
            f"for value-driven components"
        )

    if not isinstance(values, list):
        raise ValueError(
            f"Values for attribute '{attr_name}' must be a list, "
            f"got {type(values).__name__}"
        )


def _get_attribute_base_path(dataset, field):
    """Get the base path for adding attributes to a label field.

    Args:
        dataset: the dataset
        field: the label field name

    Returns:
        the base path string, or None if the field is not a valid label field
    """
    label_field = dataset.get_field(field)
    if label_field is None:
        return None

    # Handle list fields (e.g., Detections which wraps Detection)
    if isinstance(label_field, fof.ListField):
        label_field = label_field.field

    if not isinstance(label_field, fof.EmbeddedDocumentField):
        return None

    # For label list types (e.g., Detections), attributes are on inner objects
    if issubclass(label_field.document_type, fol._HasLabelList):
        list_field = label_field.document_type._LABEL_LIST_FIELD
        return f"{field}.{list_field}"

    return field


def _add_attribute_field(dataset, attr_path, attr_type, type_to_ftype):
    """Add a single attribute field to the dataset.

    Args:
        dataset: the dataset
        attr_path: the full path for the attribute
        attr_type: the attribute type string
        type_to_ftype: mapping of type strings to field types
    """
    # Skip if field already exists
    if dataset.get_field(attr_path) is not None:
        return

    if attr_type.startswith("list<"):
        subfield = type_to_ftype[attr_type]()
        dataset.add_sample_field(attr_path, fof.ListField, subfield=subfield)
    else:
        ftype = type_to_ftype[attr_type]
        dataset.add_sample_field(attr_path, ftype)


def _add_new_attributes(dataset, field, new_attributes) -> None:
    """Add new attribute fields to the dataset schema.

    Args:
        dataset: the dataset
        field: the label field name (e.g., "ground_truth")
        new_attributes: dict mapping attribute names to their schema info
            e.g., {"sensor": {"type": "radio", "values": ["a", "b"]}}

    Raises:
        TypeError: if new_attributes or attr_schema is not a dict
        ValueError: if attr_name is not a string, attr_type is invalid,
            or required values are missing/malformed
    """
    if not isinstance(new_attributes, dict):
        raise TypeError(
            f"new_attributes must be a dict, got {type(new_attributes).__name__}"
        )

    type_to_ftype = foac.TYPES_TO_FIELD_TYPE

    # Validate all attributes up-front
    for attr_name, attr_schema in new_attributes.items():
        _validate_attribute_entry(attr_name, attr_schema, type_to_ftype)
        attr_type = attr_schema.get("type", "str")
        _validate_attribute_values(attr_name, attr_type, attr_schema)

    # Get the base path for attributes
    base_path = _get_attribute_base_path(dataset, field)
    if base_path is None:
        return

    # Add each attribute field
    for attr_name, attr_schema in new_attributes.items():
        attr_type = attr_schema.get("type", "str")
        attr_path = f"{base_path}.{attr_name}"
        _add_attribute_field(dataset, attr_path, attr_type, type_to_ftype)


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
