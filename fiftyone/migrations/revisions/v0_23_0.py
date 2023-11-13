"""
FiftyOne v0.23.0 revision.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


def up(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    if "runs" not in dataset_dict:
        dataset_dict["runs"] = {}

    db.datasets.replace_one(match_d, dataset_dict)


def down(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    runs = dataset_dict.pop("runs", None)

    if runs:
        for _id in runs.values():
            db.runs.delete_one({"_id": _id})

    db.datasets.replace_one(match_d, dataset_dict)
