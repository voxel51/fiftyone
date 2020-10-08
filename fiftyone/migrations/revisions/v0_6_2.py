"""
FiftyOne v0.6.2 revisions

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import pymongo as pm


def up(db, dataset_name):
    colls = set(db.collection_names())
    for c in colls:
        if c.startswith("frames.") and ".".join(c.split(".")[1:]) not in colls:
            db[c].drop()

    colls = set(db.collection_names())

    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)
    if "media_type" not in dataset_dict:
        dataset_dict["media_type"] = "image"

    if dataset_dict["media_type"] == "image":
        db.datasets.update_one(
            match_d, {"$set": {"media_type": dataset_dict["media_type"]}}
        )
        return

    dataset_dict["frames"][
        "ftype"
    ] = "fiftyone.core.fields.EmbeddedDocumentField"
    dataset_dict["frames"]["subfield"] = None
    dataset_dict["frames"]["embedded_doc_type"] = "fiftyone.core.labels.Frames"

    sample_coll = dataset_dict["sample_collection_name"]
    frame_coll = "frames.%s" % sample_coll
    for s in sample_coll.find():
        print(s)


def down(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)
    sample_coll = dataset_dict["sample_collection_name"]
    frame_coll = "frames.%s" % sample_coll

    db.datasets.update_one(match_d, {"$unset": {"media_type": ""}})
    dataset_dict["frames"]["ftype"] = "fiftyone.core.fields.ReferenceField"
    dataset_dict["frames"]["subfield"] = "fiftyone.core.fields.Frames"
    dataset_dict["frames"]["embedded_doc_type"] = None

    db[dataset_name].update({}, {"$unset": {"sample_id": 1}}, {"multi": True})
    print("down")
