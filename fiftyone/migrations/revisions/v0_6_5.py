"""
FiftyOne v0.6.5 revision.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


def up(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)
    for field in dataset_dict["sample_fields"]:
        if field["name"] == "media_type":
            field["name"] = "_media_type"

    db.datasets.replace_one(match_d, dataset_dict)
    sample_coll = db[dataset_dict["sample_collection_name"]]
    sample_coll.update_many({}, {"$rename": {"media_type": "_media_type"}})


def down(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)
    for field in dataset_dict["sample_fields"]:
        if field["name"] == "_media_type":
            field["name"] = "media_type"

    db.datasets.replace_one(match_d, dataset_dict)
    sample_coll = db[dataset_dict["sample_collection_name"]]
    sample_coll.update_many({}, {"$rename": {"_media_type": "media_type"}})
