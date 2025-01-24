"""
FiftyOne v0.18.0 revision.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


def up(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    app_config = dataset_dict.get("app_config", None)
    if app_config is not None:
        if "sidebar_mode" not in app_config:
            app_config["sidebar_mode"] = None

        sidebar_groups = app_config.get("sidebar_groups", None)
        if sidebar_groups is not None:
            for sidebar_group in sidebar_groups:
                if "expanded" not in sidebar_group:
                    sidebar_group["expanded"] = None

    for field in dataset_dict.get("sample_fields", []):
        _add_metadata(field)

    for field in dataset_dict.get("frame_fields", []):
        _add_metadata(field)

    db.datasets.replace_one(match_d, dataset_dict)


def down(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    app_config = dataset_dict.get("app_config", None)
    if app_config is not None:
        app_config.pop("sidebar_mode", None)

        sidebar_groups = app_config.get("sidebar_groups", None)
        if sidebar_groups is not None:
            for sidebar_group in sidebar_groups:
                sidebar_group.pop("expanded", None)

    for field in dataset_dict.get("sample_fields", []):
        _remove_metadata(field)

    for field in dataset_dict.get("frame_fields", []):
        _remove_metadata(field)

    db.datasets.replace_one(match_d, dataset_dict)


def _add_metadata(field):
    if "description" not in field:
        field["description"] = None

    if "info" not in field:
        field["info"] = None

    for _field in field.get("fields", []):
        _add_metadata(_field)


def _remove_metadata(field):
    field.pop("description", None)
    field.pop("info", None)

    for _field in field.get("fields", []):
        _remove_metadata(_field)
