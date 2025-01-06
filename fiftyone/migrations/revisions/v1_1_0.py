"""
FiftyOne v1.1.0 revision.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


def up(db, dataset_name):
    match_d = {"name": dataset_name}
    db.datasets.update_one(
        match_d, {"$unset": {"app_config.sidebar_mode": ""}}
    )


def down(db, dataset_name):
    pass
