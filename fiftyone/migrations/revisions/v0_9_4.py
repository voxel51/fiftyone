"""
FiftyOne v0.9.4 revision.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


def up(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    for field in dataset_dict.get("sample_fields", []):
        if "db_field" not in field:
            if field["name"] == "id":
                field["db_field"] = "_id"
            else:
                field["db_field"] = field["name"]

    for field in dataset_dict.get("frame_fields", []):
        if "db_field" not in field:
            if field["name"] == "id":
                field["db_field"] = "_id"
            else:
                field["db_field"] = field["name"]

    db.datasets.replace_one(match_d, dataset_dict)


def down(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    for field in dataset_dict.get("sample_fields", []):
        field.pop("db_field", None)

    for field in dataset_dict.get("frame_fields", []):
        field.pop("db_field", None)

    db.datasets.replace_one(match_d, dataset_dict)
