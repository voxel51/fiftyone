"""
FiftyOne v0.6.2 revision.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import pymongo as pm


def _up_convert_polyline_points(d):
    if not isinstance(d, dict):
        return False
    cls = d.get("_cls", None)
    if cls == "Polyline":
        if "points" not in d:
            return False

        d["points"] = [d["points"]]
        return True

    if cls == "Polylines":
        for polyline in d.get("polylines", []):
            _up_convert_polyline_points(polyline)

        return True

    return False


def up(db, dataset_name):
    colls = set(db.list_collection_names())
    for c in colls:
        if c.startswith("frames.") and ".".join(c.split(".")[1:]) not in colls:
            db[c].drop()

    colls = set(db.list_collection_names())

    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)
    if "media_type" not in dataset_dict:
        dataset_dict["media_type"] = "image"

    if "frame_fields" not in dataset_dict:
        dataset_dict["frame_fields"] = []

    for field in dataset_dict["sample_fields"]:
        if "media_type" in field:
            del field["media_type"]

        if field["name"] == "frames" and dataset_dict["media_type"] == "video":
            field["ftype"] = "fiftyone.core.fields.EmbeddedDocumentField"
            field["subfield"] = None
            field["embedded_doc_type"] = "fiftyone.core.labels._Frames"

    for field in dataset_dict["frame_fields"]:
        if "media_type" in field:
            del field["media_type"]

    db.datasets.replace_one(match_d, dataset_dict)
    sample_coll = dataset_dict["sample_collection_name"]

    if dataset_dict["media_type"] == "image":
        writes = []
        for s in db[sample_coll].find():
            converted = False
            for d in s.values():
                converted |= _up_convert_polyline_points(d)

            if converted:
                writes.append(pm.ReplaceOne({"_id": s["_id"]}, s))

        if len(writes):
            db[sample_coll].bulk_write(writes, ordered=False)

        return

    frame_coll = "frames.%s" % sample_coll
    for s in db[sample_coll].find():
        frames_d = {
            "_cls": "_Frames",
            "frame_count": len(s["frames"]),
            "first_frame": None,
        }
        frame_updates = []
        for frame_number_str, frame_id in s["frames"].items():
            frame_number = int(frame_number_str)
            frame_d = db[frame_coll].find_one({"_id": frame_id})
            for d in frame_d.values():
                _up_convert_polyline_points(d)

            frame_d["_sample_id"] = s["_id"]
            if frame_number == 1:
                first_frame = db[frame_coll].find_one({"_id": frame_id})
                first_frame["_cls"] = "_FrameLabels"
                frames_d["first_frame"] = first_frame

            frame_updates.append(pm.ReplaceOne({"_id": frame_id}, frame_d))
        db[sample_coll].update_one(
            {"_id": s["_id"]}, {"$set": {"frames": frames_d}}
        )
        if len(frame_updates):
            db[frame_coll].bulk_write(frame_updates, ordered=False)


def _down_convert_polyline_points(d):
    if not isinstance(d, dict):
        return False

    cls = d.get("_cls", None)
    if cls == "Polyline":
        if "points" not in d:
            return False

        if len(d["points"]) != 1:
            d["points"] = [[]]
        else:
            d["points"] = d["points"][0]

        return True

    if cls == "Polylines":
        for polyline in d.get("polylines", []):
            _down_convert_polyline_points(polyline)

        return True

    return False


def down(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)
    sample_coll = dataset_dict["sample_collection_name"]
    frame_coll = "frames.%s" % sample_coll

    for field in dataset_dict["sample_fields"] + dataset_dict["frame_fields"]:
        field["media_type"] = None
        if field["name"] == "frames" and dataset_dict["media_type"] == "video":
            field["ftype"] = "fiftyone.core.fields.FramesField"
            field["subfield"] = "fiftyone.core.fields.ReferenceField"
            field["embedded_doc_type"] = None

    if "version" in dataset_dict:
        del dataset_dict["version"]

    db.datasets.replace_one(match_d, dataset_dict)

    for s in db[sample_coll].find():
        frames = {}
        frame_writes = []
        _down_convert_polyline_points(s)
        for f in db[frame_coll].find({"_sample_id": s["_id"]}):
            frames[str(f["frame_number"])] = f["_id"]
            converted = False
            for d in f.values():
                converted |= _down_convert_polyline_points(d)

            if converted:
                frame_writes.append(pm.ReplaceOne({"_id": f["_id"]}, f))

        if len(frame_writes):
            db[frame_coll].bulk_write(frame_writes, ordered=False)

        db[sample_coll].replace_one({"_id": s["_id"]}, s)

    db[frame_coll].update(
        {}, {"$unset": {"_sample_id": ""}}, multi=True, upsert=True
    )
