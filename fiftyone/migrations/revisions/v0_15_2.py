"""
FiftyOne v0.15.2 revision.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


def up(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    sample_fields = dataset_dict.get("sample_fields", [])
    sample_coll_name = dataset_dict.get("sample_collection_name", None)
    _migrate_keypoints(db, sample_coll_name, sample_fields, direction="up")

    frame_fields = dataset_dict.get("frame_fields", [])
    frame_coll_name = dataset_dict.get("frame_collection_name", None)
    _migrate_keypoints(db, frame_coll_name, frame_fields, direction="up")


def down(db, dataset_name):
    match_d = {"name": dataset_name}
    dataset_dict = db.datasets.find_one(match_d)

    sample_fields = dataset_dict.get("sample_fields", [])
    sample_coll_name = dataset_dict.get("sample_collection_name", None)
    _migrate_keypoints(db, sample_coll_name, sample_fields, direction="down")

    frame_fields = dataset_dict.get("frame_fields", [])
    frame_coll_name = dataset_dict.get("frame_collection_name", None)
    _migrate_keypoints(db, frame_coll_name, frame_fields, direction="down")


def _migrate_keypoints(db, coll_name, fields, direction="up"):
    keypoint_fields = []
    keypoints_fields = []
    for field in fields:
        name = field.get("name", None)
        embedded_doc_type = field.get("embedded_doc_type", None)

        if embedded_doc_type == "fiftyone.core.labels.Keypoint":
            keypoint_fields.append(name)

        if embedded_doc_type == "fiftyone.core.labels.Keypoints":
            keypoints_fields.append(name)

    if not keypoint_fields and not keypoints_fields:
        return

    project = {}
    for name in keypoint_fields:
        if direction == "up":
            project[name] = _handle_none(_up_keypoint_op(name))
        else:
            project[name] = _handle_none(_down_keypoint_op(name))

    for name in keypoints_fields:
        if direction == "up":
            project[name] = _handle_none(_up_keypoints_op(name))
        else:
            project[name] = _handle_none(_down_keypoints_op(name))

    coll = db[coll_name]
    pipeline = [{"$project": project}, {"$merge": coll_name}]
    coll.aggregate(pipeline, allowDiskUse=True)


def _handle_none(expr):
    return {
        "$cond": {
            "if": {"$gt": ["$$CURRENT", None]},
            "then": expr,
            "else": None,
        }
    }


def _up_keypoint_op(path):
    root = "$" + path
    points = root + ".points"
    confidence = root + ".confidence"

    return {
        "$mergeObjects": [
            {
                "$arrayToObject": {
                    "$filter": {
                        "input": {"$objectToArray": root},
                        "as": "this",
                        "cond": {"$ne": ["$$this.k", "confidence"]},
                    }
                }
            },
            {
                "points": {
                    "$cond": {
                        "if": {"$gt": [confidence, None]},
                        "then": {
                            "$map": {
                                "input": {
                                    "$zip": {"inputs": [points, confidence]}
                                },
                                "as": "this",
                                "in": {
                                    "_cls": "Point",
                                    "x": {
                                        "$arrayElemAt": [
                                            {"$arrayElemAt": ["$$this", 0]},
                                            0,
                                        ]
                                    },
                                    "y": {
                                        "$arrayElemAt": [
                                            {"$arrayElemAt": ["$$this", 0]},
                                            1,
                                        ]
                                    },
                                    "confidence": {
                                        "$arrayElemAt": ["$$this", 1]
                                    },
                                },
                            },
                        },
                        "else": {
                            "$map": {
                                "input": points,
                                "as": "this",
                                "in": {
                                    "_cls": "Keypoint",
                                    "x": {"$arrayElemAt": ["$$this", 0]},
                                    "y": {"$arrayElemAt": ["$$this", 1]},
                                },
                            },
                        },
                    },
                }
            },
        ]
    }


def _up_keypoints_op(path):
    return {
        "$mergeObjects": [
            "$" + path,
            {
                "keypoints": {
                    "$map": {
                        "input": "$" + path + ".keypoints",
                        "as": "this",
                        "in": _up_keypoint_op("$this"),
                    }
                }
            },
        ]
    }


def _down_keypoint_op(path):
    root = "$" + path
    points = root + ".points"

    return {
        "$mergeObjects": [
            root,
            {
                "points": {
                    "$map": {
                        "input": points,
                        "as": "this",
                        "in": ["$$this.x", "$$this.y"],
                    },
                },
                "confidence": {
                    "$cond": {
                        "if": {
                            "$gt": [
                                {
                                    "$size": {
                                        "$ifNull": [
                                            {
                                                "$filter": {
                                                    "input": points,
                                                    "as": "this",
                                                    "cond": {
                                                        "$gt": [
                                                            "$$this.confidence",
                                                            None,
                                                        ],
                                                    },
                                                },
                                            },
                                            [],
                                        ],
                                    },
                                },
                                0,
                            ],
                        },
                        "then": {
                            "$map": {
                                "input": points,
                                "as": "this",
                                "in": "$$this.confidence",
                            }
                        },
                        "else": None,
                    },
                },
            },
        ]
    }


def _down_keypoints_op(path):
    return {
        "$mergeObjects": [
            "$" + path,
            {
                "keypoints": {
                    "$map": {
                        "input": "$" + path + ".keypoints",
                        "as": "this",
                        "in": _down_keypoint_op("$this"),
                    }
                }
            },
        ]
    }
