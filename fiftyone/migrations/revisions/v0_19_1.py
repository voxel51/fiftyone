"""
FiftyOne v0.19.1 revision.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging


logger = logging.getLogger(__name__)


def up(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    _warn_legacy_3d_config(dataset_dict)


def _warn_legacy_3d_config(dataset_dict):
    try:
        config = dataset_dict["app_config"]["plugins"]["3d"]
    except:
        return

    is_legacy = False

    try:
        is_legacy |= "itemRotation" in config["overlay"]
    except:
        pass

    try:
        is_legacy |= "rotation" in config["overlay"]
    except:
        pass

    try:
        is_legacy |= "rotation" in config["pointCloud"]
    except:
        pass

    if is_legacy:
        name = dataset_dict.get("name", None)
        logger.warning(
            "Dataset '%s' uses legacy 3D visualization config settings",
            name,
        )
