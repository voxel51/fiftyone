"""
FiftyOne v0.7.2 revision

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


def up(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)
    sample_coll = db[dataset_dict["sample_collection_name"]]
    sample_coll.create_index("_rand")


def down(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)
    sample_coll = db[dataset_dict["sample_collection_name"]]
    index_info = sample_coll.index_information()
    index_map = {v["key"][0][0]: k for k, v in index_info.items()}
    if "_rand" in index_map:
        sample_coll.drop_index(index_map["_rand"])
