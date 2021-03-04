"""
FiftyOne v0.7.5 revision.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


def up(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    if "default_mask_targets" not in dataset_dict:
        dataset_dict["default_mask_targets"] = {}

    if "mask_targets" not in dataset_dict:
        dataset_dict["mask_targets"] = {}

    db.datasets.replace_one(match_d, dataset_dict)


def down(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    dataset_dict.pop("default_mask_targets", None)
    dataset_dict.pop("mask_targets", None)

    db.datasets.replace_one(match_d, dataset_dict)
