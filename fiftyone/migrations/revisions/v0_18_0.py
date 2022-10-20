"""
FiftyOne v0.18.0 revision.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


def up(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    for field in dataset_dict.get("sample_fields", []):
        _add_description(field)

    for field in dataset_dict.get("frame_fields", []):
        _add_description(field)

    db.datasets.replace_one(match_d, dataset_dict)


def down(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    for field in dataset_dict.get("sample_fields", []):
        _remove_description(field)

    for field in dataset_dict.get("frame_fields", []):
        _remove_description(field)

    db.datasets.replace_one(match_d, dataset_dict)


def _add_description(field):
    if "description" not in field:
        field["description"] = None

    for field in field.get("fields", []):
        _add_description(field)


def _remove_description(field):
    field.pop("description", None)

    for field in field.get("fields", []):
        _remove_description(field)
