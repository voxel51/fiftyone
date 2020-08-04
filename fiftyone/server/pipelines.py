"""
FiftyOne App pipeline definiutions.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

LABELS = "labels"
SCALARS = "scalars"
TAGS = "tags"

DISTRIBUTION_PIPELINES = {
    LABELS: [
        {
            "$facet": {
                "detections": [
                    {"$project": {"field": {"$objectToArray": "$$ROOT"}}},
                    {"$unwind": "$field"},
                    {"$match": {"field.v._cls": "Detections"}},
                    {
                        "$project": {
                            "field": "$field.k",
                            "detection": "$field.v.detections",
                        }
                    },
                    {"$unwind": "$detection"},
                    {
                        "$group": {
                            "_id": {
                                "field": "$field",
                                "label": "$detection.label",
                            },
                            "count": {"$sum": 1},
                        }
                    },
                    {
                        "$group": {
                            "_id": "$_id.field",
                            "data": {
                                "$push": {
                                    "key": "$_id.label",
                                    "count": "$count",
                                }
                            },
                        }
                    },
                    {
                        "$project": {
                            "name": "$_id",
                            "type": "detection",
                            "data": "$data",
                        }
                    },
                ],
                "classifications": [
                    {"$project": {"field": {"$objectToArray": "$$ROOT"}}},
                    {"$unwind": "$field"},
                    {"$match": {"field.v._cls": "Classification"}},
                    {
                        "$project": {
                            "field": "$field.k",
                            "label": "$field.v.label",
                        }
                    },
                    {
                        "$group": {
                            "_id": {"field": "$field", "label": "$label"},
                            "count": {"$sum": 1},
                        }
                    },
                    {
                        "$group": {
                            "_id": "$_id.field",
                            "data": {
                                "$push": {
                                    "key": "$_id.label",
                                    "count": "$count",
                                }
                            },
                        }
                    },
                    {
                        "$project": {
                            "name": "$_id",
                            "type": "classification",
                            "data": "$data",
                        }
                    },
                ],
            }
        }
    ],
    TAGS: [
        {"$project": {"tag": "$tags"}},
        {"$unwind": "$tag"},
        {"$group": {"_id": "$tag", "count": {"$sum": 1}}},
        {"$project": {"result": "$$ROOT", "field": "tags"}},
        {
            "$group": {
                "_id": "$field",
                "data": {
                    "$push": {"key": "$result._id", "count": "$result.count"}
                },
            }
        },
        {"$project": {"name": "$_id", "type": "tag", "data": "$data"}},
    ],
    SCALARS: [
        {
            "$facet": {
                "groupings": [
                    {"$project": {"field": {"$objectToArray": "$$ROOT"}}},
                    {"$unwind": "$field"},
                    {"$match": {"field.k": {"$ne": "filepath"}}},
                    {
                        "$project": {
                            "field": "$field",
                            "type": {"$type": "$field.v"},
                        }
                    },
                    {"$match": {"type": {"$ne": "array"}}},
                    {
                        "$match": {
                            "field.v": {"$type": "bool"}
                        },  # @todo: support strings
                    },
                    {"$project": {"field": "$field.k", "label": "$field.v"}},
                    {
                        "$group": {
                            "_id": {
                                "group": "$field",
                                "label": "$label",
                                "type": {"$type": "$label"},
                            },
                            "count": {"$sum": 1},
                        }
                    },
                    {
                        "$group": {
                            "_id": {
                                "group": "$_id.group",
                                "type": "$_id.type",
                            },
                            "data": {
                                "$push": {
                                    "key": "$_id.label",
                                    "count": "$count",
                                }
                            },
                        }
                    },
                    {
                        "$project": {
                            "name": "$_id.group",
                            "type": "$_id.type",
                            "data": "$data",
                        }
                    },
                ],
            }
        }
    ],
}
