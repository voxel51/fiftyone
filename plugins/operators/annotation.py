"""
Annotation label schemas operators

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import time
import uuid
from datetime import datetime, timezone

import fiftyone.core.annotation.constants as foac
import fiftyone.core.annotation.utils as foau
from fiftyone.core.annotation.validate_label_schemas import (
    ValidationErrors,
    validate_label_schemas,
)
import fiftyone.core.fields as fof
import fiftyone.operators as foo
from fiftyone.operators.sse import SseOperator, SseOperatorConfig

# Store name for schema manager scan results
SCHEMA_MANAGER_STORE = "schema_manager"


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
            allow_immediate_execution=True,
            allow_delegated_execution=True,
        )

    def resolve_delegation(self, ctx):
        """Delegate when scanning samples on large datasets."""
        scan_samples = ctx.params.get("scan_samples", True)
        if not scan_samples:
            # Quick operation (no scanning), run immediately
            return False

        # Let caller decide via request_delegation param
        return None

    def execute(self, ctx):
        field = ctx.params.get("field", None)
        scan_samples = ctx.params.get("scan_samples", True)
        is_delegated = ctx.delegated

        store = ctx.store(SCHEMA_MANAGER_STORE)
        dataset_id = str(ctx.dataset._doc.id)
        scan_run_key = f"scan_run_{dataset_id}_{field}"

        # Create scan run record for delegated operations
        if is_delegated:
            now = datetime.now(timezone.utc).isoformat()
            scan_run = {
                "run_id": str(uuid.uuid4()),
                "status": "running",
                "field": field,
                "dataset_id": dataset_id,
                "operator_run_id": str(ctx._delegated_operation_id),
                "created_by": ctx.operator_uri,  # TODO: get actual user
                "created_at": now,
                "started_at": now,
                "completed_at": None,
                "progress": 0.0,
                "error": None,
            }
            store.set(scan_run_key, scan_run)
            ctx.set_progress(label="Scanning dataset for label values...")

        # TODO: Remove this - artificial delay for testing delegated execution
        time.sleep(15)  # 15 seconds

        try:
            result = ctx.dataset.generate_label_schemas(
                fields=field, scan_samples=scan_samples
            )

            if is_delegated:
                # Persist result directly to dataset.label_schemas for delegated ops
                ctx.dataset.update_label_schema(field, result)

                # Update scan run status to completed, include the result
                scan_run["status"] = "completed"
                scan_run["completed_at"] = datetime.now(
                    timezone.utc
                ).isoformat()
                scan_run["progress"] = 1.0
                scan_run["result"] = result  # Include result for frontend
                store.set(scan_run_key, scan_run)

            ctx.set_progress(progress=1.0, label="Complete")
            return {"label_schema": result}

        except Exception as e:
            if is_delegated:
                # Update scan run status to failed
                scan_run["status"] = "failed"
                scan_run["completed_at"] = datetime.now(
                    timezone.utc
                ).isoformat()
                scan_run["error"] = str(e)
                store.set(scan_run_key, scan_run)
            raise


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

        try:
            ctx.dataset.update_label_schema(field, label_schema)
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
                ctx.dataset,
                ctx.params.get("label_schemas", {}),
                allow_new_attrs=True,
                allow_new_fields=True,
            )
        except ValidationErrors as exceptions:
            for exception in list(exceptions.exceptions):
                if isinstance(exception, ValidationErrors):
                    for subexception in exception.exceptions:
                        errors.append(str(subexception))
                    continue

                errors.append(str(exception))

        return {"errors": errors}


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

        try:
            if field_category == "label":
                label_schema = self._create_label_field(
                    ctx, field_name, field_type, read_only
                )
            else:
                label_schema = self._create_primitive_field(
                    ctx, field_name, field_type, read_only
                )

            # Set the label schema
            ctx.dataset.update_label_schema(
                field_name,
                label_schema,
                allow_new_attrs=True,
                allow_new_fields=True,
            )

            # Activate the field (prepend to make it appear at top)
            ctx.dataset.activate_label_schemas(field_name, prepend=True)

            return {
                "field_name": field_name,
                "label_schema": label_schema,
            }
        except Exception as e:
            ctx.ops.notify(str(e), variant="error")
            return {"error": str(e)}

    def _create_label_field(self, ctx, field_name, field_type, read_only):
        """Create a label field and return its schema."""
        label_cls = foac.LABEL_TYPE_TO_CLASS.get(field_type)
        if label_cls is None:
            raise ValueError(f"Unknown label type: {field_type}")

        ctx.dataset.add_sample_field(
            field_name,
            fof.EmbeddedDocumentField,
            embedded_doc_type=label_cls,
            read_only=read_only,
        )

        # Get label schema config from frontend
        label_schema_config = ctx.params.get("label_schema_config", {})
        classes = label_schema_config.get("classes")

        # Determine component based on number of classes
        if classes and len(classes) > foac.CHECKBOXES_OR_RADIO_THRESHOLD:
            component = foac.DROPDOWN
        else:
            component = foac.RADIO

        # Build label schema
        return {
            "type": field_type,
            "component": component,
            "attributes": label_schema_config.get("attributes", []),
            **({"classes": classes} if classes else {}),
        }

    def _create_primitive_field(self, ctx, field_name, field_type, read_only):
        """Create a primitive field and return its schema."""
        ftype = foac.TYPE_TO_FIELD.get(field_type)
        if ftype is None:
            raise ValueError(f"Unknown primitive type: {field_type}")

        # List types need ListField wrapper with subfield
        if field_type.startswith("list<"):
            ctx.dataset.add_sample_field(
                field_name,
                fof.ListField,
                subfield=ftype(),
                read_only=read_only,
            )
        else:
            ctx.dataset.add_sample_field(
                field_name,
                ftype,
                read_only=read_only,
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

        return label_schema


class ListValidAnnotationFields(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="list_valid_annotation_fields",
            label="List valid annotation fields",
            unlisted=True,
        )

    def execute(self, ctx: foo.ExecutionContext):
        require_app_support = ctx.params.get("require_app_support", True)

        valid_fields = foau.list_valid_annotation_fields(
            ctx.dataset, require_app_support=require_app_support, flatten=True
        )

        return {"valid_fields": valid_fields}


class SubscribeSchemaManager(SseOperator):
    """SSE operator for subscribing to schema manager execution store changes."""

    @property
    def subscription_config(self):
        return SseOperatorConfig(
            name="subscribe_schema_manager",
            label="Subscribe to Schema Manager",
            store_name=SCHEMA_MANAGER_STORE,
        )
