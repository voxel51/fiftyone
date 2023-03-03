"""
FiftyOne v0.20.0 revision.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


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

    db.datasets.replace_one(match_d, dataset_dict)


def down(db, dataset_name):
    pass
