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
