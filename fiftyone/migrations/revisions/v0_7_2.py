"""
FiftyOne v0.7.2 revision.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import pymongo as pm


def up(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)
    if dataset_dict["media_type"] != "video":
        return

    fields = []
    for field in dataset_dict["sample_fields"]:
        if field["name"] == "frames":
            continue

        fields.append(field)

    dataset_dict["sample_fields"] = fields
    db.datasets.replace_one(match_d, dataset_dict)
    sample_coll = db[dataset_dict["sample_collection_name"]]
    sample_coll.update_many({}, {"$unset": {"frames": ""}})


def down(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)
    if dataset_dict["media_type"] != "video":
        return

    frames = {
        "name": "frames",
        "ftype": "fiftyone.core.fields.EmbeddedDocumentField",
        "subfield": None,
        "embedded_doc_type": "fiftyone.core.labels._Frames",
    }
    dataset_dict["sample_fields"].append(frames)
    db.datasets.replace_one(match_d, dataset_dict)
    frame_coll = db["frames." + dataset_dict["sample_collection_name"]]
    sample_coll = db[dataset_dict["sample_collection_name"]]

    first_frames = frame_coll.find({"frame_number": 1})
    writes = []
    for f in first_frames:
        frame_d = {"first_frame": f}
        writes.append(
            pm.UpdateOne(
                {"_id": f["_sample_id"]}, {"$set": {"frames": frame_d}}
            )
        )

    sample_coll.bulk_write(writes)

    counts = frame_coll.aggregate(
        [{"$group": {"_id": "$_sample_id", "count": {"$sum": 1}}}]
    )
    writes = []
    for count in counts:
        writes.append(
            pm.UpdateOne(
                {"_id": count["_id"]},
                {"$set": {"frames.frame_count": count["count"]}},
            )
        )

    sample_coll.bulk_write(writes)
