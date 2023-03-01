"""
FiftyOne v0.7.3 revision.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


def up(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)
    if "evaluations" not in dataset_dict:
        dataset_dict["evaluations"] = {}

    db.datasets.replace_one(match_d, dataset_dict)


def down(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)
    dataset_dict.pop("evaluations", None)
    db.datasets.replace_one(match_d, dataset_dict)
