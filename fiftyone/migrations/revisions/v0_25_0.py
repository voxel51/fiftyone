"""
FiftyOne v0.25.0 revision.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


def up(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    # Add `last_modified_at` property
    if "last_modified_at" not in dataset_dict:
        dataset_dict["last_modified_at"] = None

    sample_fields = dataset_dict.get("sample_fields", [])
    if sample_fields:
        _up_fields(sample_fields)

    frame_fields = dataset_dict.get("frame_fields", [])
    if frame_fields:
        _up_fields(frame_fields)

    db.datasets.replace_one(match_d, dataset_dict)


def down(db, dataset_name):
    pass


def _up_fields(fields):
    found_created_at = False
    found_last_modified_at = False

    for field in fields:
        name = field.get("name", None)
        found_created_at |= name == "created_at"
        found_last_modified_at |= name == "last_modified_at"

        # Add `read_only` property
        if "read_only" not in field:
            field["read_only"] = False

    # Add `created_at` field
    if not found_created_at:
        fields.append(
            {
                "name": "created_at",
                "ftype": "fiftyone.core.fields.DateTimeField",
                "embedded_doc_type": None,
                "subfield": None,
                "fields": [],
                "db_field": "created_at",
                "description": None,
                "info": None,
                "read_only": True,
            }
        )

    # Add `last_modified_at` field
    if not found_last_modified_at:
        fields.append(
            {
                "name": "last_modified_at",
                "ftype": "fiftyone.core.fields.DateTimeField",
                "embedded_doc_type": None,
                "subfield": None,
                "fields": [],
                "db_field": "last_modified_at",
                "description": None,
                "info": None,
                "read_only": True,
            }
        )
