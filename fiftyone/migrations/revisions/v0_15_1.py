"""
FiftyOne v0.15.1 revision.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


def up(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    if "skeletons" not in dataset_dict:
        dataset_dict["skeletons"] = {}

    if "default_skeleton" not in dataset_dict:
        dataset_dict["default_skeleton"] = None

    db.datasets.replace_one(match_d, dataset_dict)


def down(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    dataset_dict.pop("skeletons", None)
    dataset_dict.pop("default_skeleton", None)

    db.datasets.replace_one(match_d, dataset_dict)
