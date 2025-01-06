"""
FiftyOne v0.20.0 revision.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from bson import json_util
import gridfs


_OLD_SKLEARN_CONFIG_CLS = "fiftyone.brain.similarity.SimilarityConfig"
_OLD_SKLEARN_RESULTS_CLS = "fiftyone.brain.similarity.SimilarityResults"

_NEW_SKLEARN_CONFIG_CLS = (
    "fiftyone.brain.internal.core.sklearn.SklearnSimilarityConfig"
)
_NEW_SKLEARN_RESULTS_CLS = (
    "fiftyone.brain.internal.core.sklearn.SklearnSimilarityIndex"
)


def up(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)
    _id = dataset_dict.get("_id", None)

    sample_fields = dataset_dict.get("sample_fields", None)
    if sample_fields and all(
        f.get("name", None) != "_dataset_id" for f in sample_fields
    ):
        sample_fields.append(
            {
                "name": "_dataset_id",
                "ftype": "fiftyone.core.fields.ObjectIdField",
                "embedded_doc_type": None,
                "subfield": None,
                "fields": [],
                "db_field": "_dataset_id",
                "description": None,
                "info": None,
            }
        )

        coll_name = dataset_dict.get("sample_collection_name", None)
        if coll_name is not None:
            db[coll_name].update_many({}, {"$set": {"_dataset_id": _id}})

    frame_fields = dataset_dict.get("frame_fields", None)
    if frame_fields and all(
        f.get("name", None) != "_dataset_id" for f in frame_fields
    ):
        frame_fields.append(
            {
                "name": "_dataset_id",
                "ftype": "fiftyone.core.fields.ObjectIdField",
                "embedded_doc_type": None,
                "subfield": None,
                "fields": [],
                "db_field": "_dataset_id",
                "description": None,
                "info": None,
            }
        )

        coll_name = dataset_dict.get("frame_collection_name", None)
        if coll_name is not None:
            db[coll_name].update_many({}, {"$set": {"_dataset_id": _id}})

    app_config = dataset_dict.get("app_config", None)
    if app_config is not None:
        sidebar_groups = app_config.get("sidebar_groups", None)
        if sidebar_groups is not None:
            label_tags_idx = None

            for idx, sidebar_group in enumerate(sidebar_groups):
                name = sidebar_group.get("name", None)
                if name == "tags":
                    sidebar_group["paths"] = ["tags", "_label_tags"]

                if name == "label tags":
                    label_tags_idx = idx

            if label_tags_idx is not None:
                sidebar_groups.pop(label_tags_idx)

    _update_runs(
        db,
        dataset_dict,
        "brain_methods",
        {"cls": _OLD_SKLEARN_CONFIG_CLS},
        {"cls": _NEW_SKLEARN_CONFIG_CLS, "method": "sklearn"},
        {"cls": _NEW_SKLEARN_RESULTS_CLS},
    )

    db.datasets.replace_one(match_d, dataset_dict)


def down(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    sample_collection_name = dataset_dict.get("sample_collection_name", None)
    frame_collection_name = dataset_dict.get("frame_collection_name", None)
    if sample_collection_name and not frame_collection_name:
        dataset_dict["frame_collection_name"] = (
            "frames." + sample_collection_name
        )

    app_config = dataset_dict.get("app_config", None)
    if app_config is not None:
        sidebar_groups = app_config.get("sidebar_groups", None)
        if sidebar_groups is not None:
            tags_idx = None
            found_label_tags = False

            for idx, sidebar_group in enumerate(sidebar_groups):
                name = sidebar_group.get("name", None)

                if name == "tags":
                    sidebar_group["paths"] = []
                    tags_idx = idx

                if name == "label tags":
                    sidebar_group["paths"] = []
                    found_label_tags = True

            if tags_idx is not None and not found_label_tags:
                sidebar_groups.insert(
                    tags_idx + 1,
                    {"name": "label tags", "paths": []},
                )

    _update_runs(
        db,
        dataset_dict,
        "brain_methods",
        {"cls": _NEW_SKLEARN_CONFIG_CLS},
        {"cls": _OLD_SKLEARN_CONFIG_CLS, "method": "similarity"},
        {"cls": _OLD_SKLEARN_RESULTS_CLS},
    )

    db.datasets.replace_one(match_d, dataset_dict)


def _update_runs(
    db,
    dataset_dict,
    runs_field,
    config_match,
    config_updates,
    results_updates,
):
    runs = dataset_dict.get(runs_field, {})

    for run_id in runs.values():
        try:
            run_dict = db.runs.find_one({"_id": run_id})
        except:
            continue

        config = run_dict.get("config", {})
        if config and all(
            config.get(k, None) == v for k, v in config_match.items()
        ):
            # Update RunConfig
            config.update(**config_updates)

            # Update RunResults
            results_id = run_dict.get("results", None)
            if results_id is not None:
                try:
                    run_dict["results"] = _update_run_results(
                        db, results_id, results_updates
                    )
                except:
                    pass

            db.runs.replace_one({"_id": run_id}, run_dict)


def _update_run_results(db, results_id, updates):
    fs = gridfs.GridFS(db)

    # Load run results
    f = fs.get(results_id)
    run_results_dict = json_util.loads(f.read().decode())

    # Update results
    run_results_dict.update(**updates)

    # Write updates run results
    results_bytes = json_util.dumps(run_results_dict).encode()
    new_results_id = fs.put(results_bytes, content_type="application/json")

    try:
        # Delete old run results
        fs.delete(results_id)
    except:
        pass

    return new_results_id
