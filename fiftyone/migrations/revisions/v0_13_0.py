"""
FiftyOne v0.13.0 revision.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


def up(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    if "annotation_runs" not in dataset_dict:
        dataset_dict["annotation_runs"] = {}

    brain_methods = dataset_dict.get("brain_methods", {})
    for run_doc in brain_methods.values():
        config = run_doc.get("config", {})
        config_cls = config.get("cls", "")
        if config_cls == "fiftyone.brain.similarity.SimilarityConfig":
            config["model"] = None
            config["metric"] = "euclidean"

    db.datasets.replace_one(match_d, dataset_dict)


def down(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    dataset_dict.pop("annotation_runs", None)

    brain_methods = dataset_dict.get("brain_methods", {})
    for run_doc in brain_methods.values():
        config = run_doc.get("config", {})
        config_cls = config.get("cls", "")
        if config_cls == "fiftyone.brain.similarity.SimilarityConfig":
            config.pop("model", None)
            config.pop("metric", None)

    db.datasets.replace_one(match_d, dataset_dict)
