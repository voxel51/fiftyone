"""
FiftyOne v0.16.0 revision.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


def up(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    dataset_dict["app_sidebar_groups"] = None

    for field in dataset_dict.get("sample_fields", []):
        field["fields"] = []

    for field in dataset_dict.get("frame_fields", []):
        field["fields"] = []

    db.datasets.replace_one(match_d, dataset_dict)


def down(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    dataset_dict.pop("app_sidebar_groups", None)

    for field in dataset_dict.get("sample_fields", []):
        field.pop("fields", None)

    for field in dataset_dict.get("frame_fields", []):
        field.pop("fields", None)

    db.datasets.replace_one(match_d, dataset_dict)
