"""
FiftyOne v0.15.1 admin revision.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import json
import os


logger = logging.getLogger(__name__)


def up(db):
    pass


def down(db):
    database_name = _get_database_name()
    db = db[database_name]

    try:
        d = db["config"].find_one({})

        d.pop("type", None)

        db["config"].replace_one({"_id": d["_id"]}, d)
    except:
        pass


def _get_database_name():
    if "FIFTYONE_DATABASE_NAME" in os.environ:
        return os.environ["FIFTYONE_DATABASE_NAME"]

    config = _load_config()

    return config.get("database_name", "fiftyone")


def _load_config():
    if "FIFTYONE_CONFIG_PATH" in os.environ:
        config_path = os.environ["FIFTYONE_CONFIG_PATH"]
    else:
        config_path = os.path.join(
            os.path.expanduser("~"), ".fiftyone", "config.json"
        )

    config = {}

    if os.path.isfile(config_path):
        try:
            with open(config_path, "r") as f:
                config = json.load(f)
        except Exception as e:
            logger.warning(
                "Failed to read config from '%s': %s", config_path, str(e)
            )

    return config
