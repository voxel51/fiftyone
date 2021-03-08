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

    evaluations = dataset_dict.get("evaluations", {})
    for run_doc in evaluations.values():
        if "results" not in run_doc:
            run_doc["results"] = None

    brain_methods = dataset_dict.get("brain_methods", {})
    for run_doc in brain_methods.values():
        if "results" not in run_doc:
            run_doc["results"] = None

    db.datasets.replace_one(match_d, dataset_dict)


def down(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    dataset_dict.pop("default_mask_targets", None)
    dataset_dict.pop("mask_targets", None)

    evaluations = dataset_dict.get("evaluations", {})
    for run_doc in evaluations.values():
        run_doc.pop("results", None)

    brain_methods = dataset_dict.get("brain_methods", {})
    for run_doc in brain_methods.values():
        run_doc.pop("results", None)

    db.datasets.replace_one(match_d, dataset_dict)
