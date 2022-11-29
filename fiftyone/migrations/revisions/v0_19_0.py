"""
FiftyOne v0.19.0 revision.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from bson import ObjectId


def up(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    if "saved_views" not in dataset_dict:
        dataset_dict["saved_views"] = []

    _up_runs(db, dataset_dict, "annotation_runs")
    _up_runs(db, dataset_dict, "brain_methods")
    _up_runs(db, dataset_dict, "evaluations")

    db.datasets.replace_one(match_d, dataset_dict)


def down(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    _delete_saved_views(db, dataset_dict)
    _down_runs(db, dataset_dict, "annotation_runs")
    _down_runs(db, dataset_dict, "brain_methods")
    _down_runs(db, dataset_dict, "evaluations")

    db.datasets.replace_one(match_d, dataset_dict)


def _delete_saved_views(db, dataset_dict):
    saved_views = dataset_dict.pop("saved_views", [])

    if saved_views:
        db.views.delete_many({"_id": {"$in": saved_views}})


def _up_runs(db, dataset_dict, runs_field):
    if runs_field not in dataset_dict:
        return

    runs = dataset_dict[runs_field]

    _runs = {}
    for key, run_doc in runs.items():
        _id = ObjectId()
        run_doc["_id"] = _id
        run_doc["_dataset_id"] = dataset_dict["_id"]
        _runs[key] = _id
        db.runs.insert_one(run_doc)

    dataset_dict[runs_field] = _runs


def _down_runs(db, dataset_dict, runs_field):
    if runs_field not in dataset_dict:
        return

    runs = dataset_dict[runs_field]

    _runs = {}
    for key, _id in runs.items():
        try:
            run_doc = db.runs.find_one({"_id": _id})
        except:
            continue

        db.runs.delete_one({"_id", _id})
        run_doc.pop("_id", None)
        run_doc.pop("_dataset_id", None)
        _runs[key] = run_doc

    dataset_dict[runs_field] = _runs
