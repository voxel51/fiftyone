"""
Label schemas plugin.

Operators over the named label-schema documents stored by
``fiftyone.core.label_schema_docs`` — the CRUD the Schema Manager and
the Explore schema lens call. The documents are workflow-neutral;
annotation workflow stages (``@voxel51/workflows``) only reference one
by id.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from .operators import (
    CreateLabelSchemaDocOperator,
    DeclareLabelSchemaAttributesOperator,
    DeleteLabelSchemaDocOperator,
    GetLabelSchemaDocOperator,
    ListLabelSchemaDocsOperator,
    ListUndeclaredLabelSchemaAttributesOperator,
    PropagateLabelSchemaFieldOperator,
    UpdateLabelSchemaDocOperator,
)


def register(p):
    p.register(ListLabelSchemaDocsOperator)
    p.register(GetLabelSchemaDocOperator)
    p.register(CreateLabelSchemaDocOperator)
    p.register(UpdateLabelSchemaDocOperator)
    p.register(PropagateLabelSchemaFieldOperator)
    p.register(DeleteLabelSchemaDocOperator)
    p.register(ListUndeclaredLabelSchemaAttributesOperator)
    p.register(DeclareLabelSchemaAttributesOperator)
