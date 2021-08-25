"""
FiftyOne v0.14.0 revision.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


def up(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    if "creation_date" not in dataset_dict:
        dataset_dict["creation_date"] = None

    if "last_loaded_date" not in dataset_dict:
        dataset_dict["last_loaded_date"] = None

    db.datasets.replace_one(match_d, dataset_dict)


def down(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    dataset_dict.pop("creation_date", None)
    dataset_dict.pop("last_loaded_date", None)

    db.datasets.replace_one(match_d, dataset_dict)
