"""
FiftyOne v0.9.4 revision.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


def up(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    sample_fields = dataset_dict.get("sample_fields", [])

    for field in sample_fields:
        if "db_field" not in field:
            if field["name"] == "id":
                field["db_field"] = "_id"
            else:
                field["db_field"] = field["name"]

    if not _has_field("id", sample_fields):
        sample_fields.insert(
            0,
            {
                "name": "id",
                "ftype": "fiftyone.core.fields.ObjectIdField",
                "subfield": None,
                "embedded_doc_type": None,
                "db_field": "_id",
            },
        )

    dataset_dict["sample_fields"] = sample_fields

    frame_fields = dataset_dict.get("frame_fields", [])

    for field in frame_fields:
        if "db_field" not in field:
            if field["name"] == "id":
                field["db_field"] = "_id"
            else:
                field["db_field"] = field["name"]

    if not _has_field("id", frame_fields):
        frame_fields.insert(
            0,
            {
                "name": "id",
                "ftype": "fiftyone.core.fields.ObjectIdField",
                "subfield": None,
                "embedded_doc_type": None,
                "db_field": "_id",
            },
        )

    if not _has_field("frame_number", frame_fields):
        frame_fields.insert(
            1,
            {
                "name": "frame_number",
                "ftype": "fiftyone.core.fields.FrameNumberField",
                "subfield": None,
                "embedded_doc_type": None,
                "db_field": "frame_number",
            },
        )

    if not _has_field("_sample_id", frame_fields):
        frame_fields.insert(
            2,
            {
                "name": "_sample_id",
                "ftype": "fiftyone.core.fields.ObjectIdField",
                "subfield": None,
                "embedded_doc_type": None,
                "db_field": "_sample_id",
            },
        )

    dataset_dict["frame_fields"] = frame_fields

    db.datasets.replace_one(match_d, dataset_dict)


def down(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    sample_fields = dataset_dict.get("sample_fields", [])

    sample_fields = [f for f in sample_fields if f["name"] != "id"]

    for field in sample_fields:
        field.pop("db_field", None)

    dataset_dict["sample_fields"] = sample_fields

    frame_fields = dataset_dict.get("frame_fields", [])

    frame_fields = [
        f
        for f in frame_fields
        if f["name"] not in ("id", "frame_number", "_sample_id")
    ]

    for field in frame_fields:
        field.pop("db_field", None)

    dataset_dict["frame_fields"] = frame_fields

    db.datasets.replace_one(match_d, dataset_dict)


def _has_field(name, fields):
    return any(f["name"] == name for f in fields)
