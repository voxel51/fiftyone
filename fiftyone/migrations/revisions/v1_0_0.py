"""
FiftyOne v1.0.0 revision.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from datetime import datetime


def up(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    now = datetime.utcnow()

    # Populate `Dataset.last_modified_at`
    if dataset_dict.get("last_modified_at", None) is None:
        dataset_dict["last_modified_at"] = now

    added_created_at_samples = False
    added_last_modified_at_samples = False
    sample_fields = dataset_dict.get("sample_fields", [])
    if sample_fields:
        (
            added_created_at_samples,
            added_last_modified_at_samples,
        ) = _up_fields(dataset_name, sample_fields)

    added_created_at_frames = False
    added_last_modified_at_frames = False
    frame_fields = dataset_dict.get("frame_fields", [])
    if frame_fields:
        (
            added_created_at_frames,
            added_last_modified_at_frames,
        ) = _up_fields(dataset_name, frame_fields)

    # Populate `Sample.created_at` values
    sample_collection_name = dataset_dict.get("sample_collection_name", None)
    if sample_collection_name:
        _up_field_values(
            db,
            dataset_name,
            sample_collection_name,
            added_created_at_samples,
            added_last_modified_at_samples,
            now,
        )

    # Populate `Frame.created_at` values
    frame_collection_name = dataset_dict.get("frame_collection_name", None)
    if frame_collection_name:
        _up_field_values(
            db,
            dataset_name,
            frame_collection_name,
            added_created_at_frames,
            added_last_modified_at_frames,
            now,
        )

    db.datasets.replace_one(match_d, dataset_dict)


def down(db, dataset_name):
    pass


def _up_fields(dataset_name, fields):
    found_created_at = False
    found_last_modified_at = False

    for field in fields:
        name = field.get("name", None)
        if name == "created_at":
            # Existing 'created_at' field must be read-only DateTimeField
            found_created_at = True
            _up_read_only_datetime_field(dataset_name, field)
        elif name == "last_modified_at":
            # Existing 'last_modified_at' field must be read-only DateTimeField
            found_last_modified_at = True
            _up_read_only_datetime_field(dataset_name, field)
        elif "read_only" not in field:
            # Add `read_only` property
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

    added_created_at = not found_created_at
    added_last_modified_at = not found_last_modified_at

    return added_created_at, added_last_modified_at


def _up_read_only_datetime_field(dataset_name, field):
    field_name = field.get("name", None)
    ftype = field.get("ftype", None)
    expected_ftype = "fiftyone.core.fields.DateTimeField"

    if ftype != expected_ftype:
        raise ValueError(
            f"Cannot migrate dataset '{dataset_name}' to v1.0.0 because it "
            f"has an existing '{field_name}' field of type "
            f"{ftype} != {expected_ftype}. Please rename or delete the field "
            "and try again"
        )

    field["read_only"] = True


def _up_field_values(
    db,
    dataset_name,
    collection_name,
    set_created_at,
    set_last_modified_at,
    now,
):
    set_expr = {}
    if set_created_at:
        set_expr["created_at"] = {"$toDate": "$_id"}
    if set_last_modified_at:
        set_expr["last_modified_at"] = now

    if not set_expr:
        return

    try:
        db[collection_name].update_many({}, [{"$set": set_expr}])
    except Exception as e:
        raise RuntimeError(
            "Failed to populate 'created_at' and/or 'last_modified_at' fields "
            f"for dataset '{dataset_name}'. Reason: {e}"
        )
