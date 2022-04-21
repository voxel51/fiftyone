"""
FiftyOne v0.15.1 admin revision.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import json
import os


def up(db):
    database_name = _get_database_name()
    db = db[database_name]

    try:
        d = db["config"].find_one({})
        d["type"] = "fiftyone"
        db["config"].replace_one(d)
    except:
        d = {"version": "0.15.1", "type": "fiftyone"}
        db["config"].insert_one(d)


def down(db):
    database_name = _get_database_name()
    db = db[database_name]

    try:
        d = db["config"].find_one({})
        d.pop("type", None)
        db["config"].replace_one(d)
    except:
        pass


def _get_database_name():
    if "FIFTYONE_DATABASE_NAME" in os.environ:
        return os.environ["FIFTYONE_DATABASE_NAME"]

    config = _load_config()

    try:
        return config["database_name"]
    except:
        return "fiftyone"


def _load_config():
    if "FIFTYONE_CONFIG_PATH" in os.environ:
        config_path = os.environ["FIFTYONE_CONFIG_PATH"]
    else:
        config_path = os.path.join(
            os.path.expanduser("~"), ".fiftyone", "config.json"
        )

    try:
        return json.load(config_path)
    except:
        return {}
