"""
FiftyOne v0.6.2 revision

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import pymongo as pm


def up(db, dataset_name):
    print("up")
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

    for field in dataset_dict["sample_fields"] + dataset_dict["frame_fields"]:
        del field["media_type"]

    db.datasets.replace_one(match_d, dataset_dict)

    dataset_dict["frames"][
        "ftype"
    ] = "fiftyone.core.fields.EmbeddedDocumentField"
    dataset_dict["frames"]["subfield"] = None
    dataset_dict["frames"]["embedded_doc_type"] = "fiftyone.core.labels.Frames"

    sample_coll = dataset_dict["sample_collection_name"]
    frame_coll = "frames.%s" % sample_coll
    for s in db[sample_coll].find():
        frames_d = {"frame_count": len(s["frames"]), "first_frame": None}
        frame_updates = []
        for frame_number_str, frame_id in s["frames"]:
            frame_number = int(frame_number_str)
            if frame_number == 1:
                first_frame = db[frame_coll].find_one({"_id": frame_id})
                frames_d["first_frame"] = first_frame
            frame_updates.append(
                pm.UpdateOne(
                    {"_id": frame_id}, {"$set": {"_sample_id": s["_id"]}}
                )
            )
        db[frame_coll].bulk_write(frame_updates, ordered=False)


def down(db, dataset_name):
    print("down")
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)
    sample_coll = dataset_dict["sample_collection_name"]
    frame_coll = "frames.%s" % sample_coll

    db.datasets.update_one(match_d, {"$unset": {"media_type": ""}})
    dataset_dict["frames"]["ftype"] = "fiftyone.core.fields.FramesField"
    dataset_dict["frames"]["subfield"] = "fiftyone.core.fields.ReferenceField"
    dataset_dict["frames"]["embedded_doc_type"] = None

    for s in db[sample_coll].find():
        frames = {}
        for f in db[frame_coll].find({"_sample_id": s["_id"]}):
            frames[str(f["frame_number"])] = f["_id"]

        db[sample_coll].update_one(
            {"_id": s["_id"]}, {"$set": {"frames": frames}}
        )

    db[frame_coll].update({}, {"$unset": {"_sample_id": ""}}, {"multi": True})
