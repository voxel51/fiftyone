"""
Label-schema document operators.

CRUD over :mod:`fiftyone.core.label_schema_docs` — self-contained named
schemas (a ``label_schema`` content block + a structured three-tier
``visibility`` block). Mutations are MANAGE-gated; reads require VIEW
(the Explore schema lens and task surfaces read on behalf of every
viewer). The dataset DEFAULT schema is the dataset's own stored schemas
(all fields active, never hidden) — it is not a doc, so nothing here
marks a default.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations

import logging

import fiftyone.core.label_schema_docs as docs
import fiftyone.operators.types as fo_types
from fiftyone.operators.executor import ExecutionContext
from fiftyone.operators.operator import Operator, OperatorConfig

from .permissions import can_manage, can_read

log = logging.getLogger(__name__)


class ListLabelSchemaDocsOperator(Operator):
    """``{ok, schemas: [{id, name, description, updated_at, version}]}``."""

    @property
    def config(self):
        return OperatorConfig(
            name="list_label_schema_docs",
            label="List label schema documents",
            unlisted=True,
            dynamic=True,
        )

    def resolve_input(self, ctx: ExecutionContext):
        return fo_types.Property(fo_types.Object())

    def execute(self, ctx: ExecutionContext):
        if not can_read(ctx):
            return {"ok": False, "error": "forbidden"}

        # Schemas saved before their attributes were declared on write:
        # the Explore schema row and the Schema Manager both list docs on
        # open, so declare any that are still missing here
        docs.declare_schema_attributes(ctx=ctx)

        return {"ok": True, "schemas": docs.list_(ctx=ctx)}


class GetLabelSchemaDocOperator(Operator):
    """``{ok, schema}`` — the full doc (label_schema + visibility).

    ``include_resolved`` additionally returns ``resolved`` (the
    :func:`fiftyone.core.label_schema_docs.resolve` payload over the
    dataset's schema universe) — the Explore "schema lens" consumes its
    ``excluded_paths`` so lens semantics match task semantics exactly.
    """

    @property
    def config(self):
        return OperatorConfig(
            name="get_label_schema_doc",
            label="Get label schema document",
            unlisted=True,
            dynamic=True,
        )

    def resolve_input(self, ctx: ExecutionContext):
        inputs = fo_types.Object()
        inputs.str("schema_id", required=True)
        inputs.bool("include_resolved", required=False)
        return fo_types.Property(inputs)

    def execute(self, ctx: ExecutionContext):
        if not can_read(ctx):
            return {"ok": False, "error": "forbidden"}
        schema_id = ctx.params.get("schema_id")
        if not schema_id:
            return {"ok": False, "error": "schema_id is required"}
        doc = docs.get(schema_id, ctx=ctx)
        if doc is None:
            return {"ok": False, "error": "not_found"}
        out = {"ok": True, "schema": doc}
        if ctx.params.get("include_resolved"):
            out["resolved"] = docs.resolve(
                doc, docs.schema_universe(getattr(ctx, "dataset", None))
            )
        return out


class CreateLabelSchemaDocOperator(Operator):
    """Creates a doc; ``from_dataset`` seeds ``label_schema`` from the
    dataset's stored per-field schemas (all fields annotate-tier by
    membership, default ``explore`` for the rest — day-one parity)."""

    @property
    def config(self):
        return OperatorConfig(
            name="create_label_schema_doc",
            label="Create label schema document",
            unlisted=True,
            dynamic=True,
        )

    def resolve_input(self, ctx: ExecutionContext):
        inputs = fo_types.Object()
        inputs.str("name", required=True)
        inputs.str("description", required=False)
        inputs.bool("from_dataset", required=False)
        return fo_types.Property(inputs)

    def execute(self, ctx: ExecutionContext):
        if not can_manage(ctx):
            return {"ok": False, "error": "forbidden"}
        name = (ctx.params.get("name") or "").strip()
        if not name:
            return {"ok": False, "error": "name is required"}
        label_schema = {}
        if ctx.params.get("from_dataset", True):
            label_schema = docs.snapshot_content(getattr(ctx, "dataset", None))
        user = getattr(ctx, "user", None)
        try:
            doc = docs.create(
                name=name,
                description=ctx.params.get("description") or "",
                # A new schema starts fully visible: scanned fields
                # annotatable, everything else explore-only. Hiding is an
                # explicit per-field choice; fields created later land as
                # explicit hidden entries via propagate_field.
                label_schema=label_schema,
                visibility={"default": "explore", "fields": {}},
                created_by=str(user.id) if user else "",
                ctx=ctx,
            )
        except ValueError as exc:
            return {"ok": False, "error": str(exc)}
        return {"ok": True, "schema": doc}


class UpdateLabelSchemaDocOperator(Operator):
    """Partial update of name/description/label_schema/visibility."""

    @property
    def config(self):
        return OperatorConfig(
            name="update_label_schema_doc",
            label="Update label schema document",
            unlisted=True,
            dynamic=True,
        )

    def resolve_input(self, ctx: ExecutionContext):
        inputs = fo_types.Object()
        inputs.str("schema_id", required=True)
        inputs.str("name", required=False)
        inputs.str("description", required=False)
        inputs.obj("label_schema", required=False)
        inputs.obj("visibility", required=False)
        # The doc version the caller loaded; when given, a save over a
        # newer version is refused instead of overwriting it.
        inputs.int("version", required=False)
        return fo_types.Property(inputs)

    def execute(self, ctx: ExecutionContext):
        if not can_manage(ctx):
            return {"ok": False, "error": "forbidden"}
        schema_id = ctx.params.get("schema_id")
        if not schema_id:
            return {"ok": False, "error": "schema_id is required"}
        has_updates = any(
            ctx.params.get(k) is not None
            for k in ("name", "description", "label_schema", "visibility")
        )
        try:
            if has_updates:
                doc = docs.update(
                    schema_id,
                    name=ctx.params.get("name"),
                    description=ctx.params.get("description"),
                    label_schema=ctx.params.get("label_schema"),
                    visibility=ctx.params.get("visibility"),
                    expected_version=ctx.params.get("version"),
                    ctx=ctx,
                )
            else:
                doc = docs.get(schema_id, ctx=ctx)
        except ValueError as exc:
            return {"ok": False, "error": str(exc)}
        if doc is None:
            return {"ok": False, "error": "not_found"}
        return {"ok": True, "schema": doc}


class DeleteLabelSchemaDocOperator(Operator):
    """Deletes a doc. Stages referencing it degrade to unrestricted."""

    @property
    def config(self):
        return OperatorConfig(
            name="delete_label_schema_doc",
            label="Delete label schema document",
            unlisted=True,
            dynamic=True,
        )

    def resolve_input(self, ctx: ExecutionContext):
        inputs = fo_types.Object()
        inputs.str("schema_id", required=True)
        return fo_types.Property(inputs)

    def execute(self, ctx: ExecutionContext):
        if not can_manage(ctx):
            return {"ok": False, "error": "forbidden"}
        schema_id = ctx.params.get("schema_id")
        if not schema_id:
            return {"ok": False, "error": "schema_id is required"}
        return {"ok": bool(docs.delete(schema_id, ctx=ctx))}


class PropagateLabelSchemaFieldOperator(Operator):
    """Fans a newly created dataset field out to every custom schema:
    annotate-tier content in the schema it was created in (if any),
    explicit ``hidden`` everywhere else. Returns ``{ok, updated}``."""

    @property
    def config(self):
        return OperatorConfig(
            name="propagate_label_schema_field",
            label="Propagate a new field to all label schemas",
            unlisted=True,
            dynamic=True,
        )

    def resolve_input(self, ctx: ExecutionContext):
        inputs = fo_types.Object()
        inputs.str("path", required=True)
        inputs.obj("entry", required=False)
        inputs.str("source_schema_id", required=False)
        return fo_types.Property(inputs)

    def execute(self, ctx: ExecutionContext):
        if not can_manage(ctx):
            return {"ok": False, "error": "forbidden"}
        path = (ctx.params.get("path") or "").strip()
        if not path:
            return {"ok": False, "error": "path is required"}
        try:
            updated = docs.propagate_field(
                path,
                ctx.params.get("entry"),
                ctx.params.get("source_schema_id") or None,
                ctx=ctx,
            )
        except ValueError as exc:
            return {"ok": False, "error": str(exc)}
        return {"ok": True, "updated": updated}
