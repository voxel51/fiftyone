"""
FiftyOne v0.17.0 revision.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


def up(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    if "group_field" not in dataset_dict:
        dataset_dict["group_field"] = None

    if "group_media_types" not in dataset_dict:
        dataset_dict["group_media_types"] = {}

    if "default_group_slice" not in dataset_dict:
        dataset_dict["default_group_slice"] = None

    if "app_config" not in dataset_dict:
        dataset_dict["app_config"] = {
            "media_fields": ["filepath"],
            "grid_media_field": "filepath",
            "modal_media_field": "filepath",
            "sidebar_groups": None,
            "plugins": {},
        }

    if "app_sidebar_groups" in dataset_dict:
        dataset_dict["app_config"]["sidebar_groups"] = dataset_dict.pop(
            "app_sidebar_groups"
        )

    db.datasets.replace_one(match_d, dataset_dict)


def down(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    group_field = dataset_dict.pop("group_field", None)
    group_media_types = dataset_dict.pop("group_media_types", None)
    default_group_slice = dataset_dict.pop("default_group_slice", None)

    if group_field or group_media_types or default_group_slice:
        raise ValueError(
            "Cannot migrate dataset '%s' below v0.17.0 because groups were "
            "not supported before this release" % dataset_name
        )

    app_config = dataset_dict.pop("app_config", None)

    if app_config is not None and "sidebar_groups" in app_config:
        dataset_dict["app_sidebar_groups"] = app_config["sidebar_groups"]

    db.datasets.replace_one(match_d, dataset_dict)
