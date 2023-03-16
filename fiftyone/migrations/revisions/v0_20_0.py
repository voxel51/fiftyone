"""
FiftyOne v0.20.0 revision.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

_OLD_SKLEARN_CONFIG_CLS = "fiftyone.brain.similarity.SimilarityConfig"
_NEW_SKLEARN_CONFIG_CLS = (
    "fiftyone.brain.internal.core.sklearn.SklearnSimilarityConfig"
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

    _up_similarity_indexes(db, dataset_dict)

    db.datasets.replace_one(match_d, dataset_dict)


def down(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

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

    _down_similarity_indexes(db, dataset_dict)

    db.datasets.replace_one(match_d, dataset_dict)


def _up_similarity_indexes(db, dataset_dict):
    brain_runs = dataset_dict.get("brain_methods", {})

    for _id in brain_runs.values():
        try:
            run_dict = db.runs.find_one({"_id": _id})
        except:
            continue

        config_cls = run_dict.get("config", {}).get("cls", None)
        if config_cls == _OLD_SKLEARN_CONFIG_CLS:
            run_dict["config"]["method"] = "sklearn"
            run_dict["config"]["cls"] = _NEW_SKLEARN_CONFIG_CLS
            db.runs.replace_one({"_id": _id}, run_dict)


def _down_similarity_indexes(db, dataset_dict):
    brain_runs = dataset_dict.get("brain_methods", {})

    for _id in brain_runs.values():
        try:
            run_dict = db.runs.find_one({"_id": _id})
        except:
            continue

        config_cls = run_dict.get("config", {}).get("cls", None)
        if config_cls == _NEW_SKLEARN_CONFIG_CLS:
            run_dict["config"]["method"] = "similarity"
            run_dict["config"]["cls"] = _OLD_SKLEARN_CONFIG_CLS
            db.runs.replace_one({"_id": _id}, run_dict)
