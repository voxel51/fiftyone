"""
FiftyOne v0.7.4 revision.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


def up(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    evaluations = dataset_dict.get("evaluations", {})
    for eval_doc in evaluations.values():
        eval_doc["key"] = eval_doc.pop("eval_key")
        eval_doc["timestamp"] = None
        eval_doc["config"]["pred_field"] = eval_doc.pop("pred_field")
        eval_doc["config"]["gt_field"] = eval_doc.pop("gt_field")

    dataset_dict["evaluations"] = evaluations

    if "brain_methods" not in dataset_dict:
        dataset_dict["brain_methods"] = {}

    db.datasets.replace_one(match_d, dataset_dict)


def down(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    evaluations = dataset_dict.get("evaluations", {})
    for eval_doc in evaluations.values():
        eval_doc["eval_key"] = eval_doc.pop("key")
        eval_doc.pop("timestamp")
        eval_doc["pred_field"] = eval_doc["config"].pop("pred_field")
        eval_doc["gt_field"] = eval_doc["config"].pop("gt_field")

    dataset_dict["evaluations"] = evaluations

    dataset_dict.pop("brain_methods", None)
    db.datasets.replace_one(match_d, dataset_dict)
