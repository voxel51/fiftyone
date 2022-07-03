"""
FiftyOne v0.16.6 revision.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from bson import ObjectId


def up(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    _up_runs(db, dataset_dict, "annotation_runs")
    _up_runs(db, dataset_dict, "brain_methods")
    _up_runs(db, dataset_dict, "evaluations")

    if "views" not in dataset_dict:
        dataset_dict["views"] = {}

    db.datasets.replace_one(match_d, dataset_dict)


def down(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    _down_runs(db, dataset_dict, "annotation_runs")
    _down_runs(db, dataset_dict, "brain_methods")
    _down_runs(db, dataset_dict, "evaluations")

    views = dataset_dict.pop("views", {})

    _delete_views(dataset_dict, views)

    db.datasets.replace_one(match_d, dataset_dict)


def _up_runs(db, dataset_dict, runs_field):
    if runs_field not in dataset_dict:
        return

    runs = dataset_dict[runs_field]

    _runs = {}
    for key, run_doc in runs.items():
        _id = ObjectId()
        run_doc["_id"] = _id
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
            run_doc = db.runs.find_one({"_id", _id})
        except:
            continue

        db.runs.delete_one({"_id", _id})
        run_doc.pop("_id")
        _runs[key] = run_doc

    dataset_dict[runs_field] = _runs


def _delete_views(db, views):
    if not views:
        return

    db.views.delete_many({"_id": {"$in": list(views.values())}})
