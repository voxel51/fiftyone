"""
FiftyOne v1.12.0 revision.

Beta (VFF_EXP_ANNOTATION=1) only supported classification and detection label
types. The HA (human annotation) label schema was persisted to the sample field
embedded document. Delete all field persisted schemas when migrating out of
HA Beta.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

#


def up(db, dataset_name):
    dataset = db.datasets.find_one(
        {"name": dataset_name}, {"sample_fields": True}
    )
    if not dataset:
        return

    sample_fields = dataset.get("sample_fields", [])

    has_schemas = False
    for field in sample_fields:
        schema = field.pop("schema", None)
        if not schema:
            continue

        has_schemas = True

    if has_schemas:
        db.datasets.update_one(
            {
                "name": dataset_name,
            },
            {
                "$set": {
                    "sample_fields": sample_fields,
                }
            },
        )


def down(db, dataset_name):
    # down migration deletes the label schemas
    db.datasets.update_one(
        {"name": dataset_name},
        {"$unset": {"active_label_schemas": True, "label_schemas": True}},
    )
