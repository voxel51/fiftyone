"""
FiftyOne server-related unit tests.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

import fiftyone.core.dataset as fod
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.server.view as fosv

from decorators import drop_datasets


class ServerViewTests(unittest.TestCase):
    @drop_datasets
    def test_extended_view_image_label_filters_samples(self):
        filters = {
            "predictions.detections.label": {
                "values": ["carrot"],
                "exclude": False,
                "onlyMatch": True,
                "isMatching": False,
                "_CLS": "str",
            },
            "predictions.detections.confidence": {
                "range": [0.5, 1],
                "_CLS": "numeric",
                "exclude": False,
                "onlyMatch": True,
                "isMatching": False,
            },
        }

        dataset = fod.Dataset("test")
        dataset.add_sample_field(
            "predictions", fof.EmbeddedDocumentField, fol.Detections
        )

        returned = fosv.get_view(
            "test",
            filters=filters,
            count_label_tags=True,
        )._pipeline()

        expected = [
            {
                "$match": {
                    "$and": [
                        {
                            "$and": [
                                {
                                    "predictions.detections.confidence": {
                                        "$gte": 0.5
                                    }
                                },
                                {
                                    "predictions.detections.confidence": {
                                        "$lte": 1
                                    }
                                },
                            ],
                        },
                        {"predictions.detections.label": {"$in": ["carrot"]}},
                    ],
                },
            },
            {"$addFields": {"_label_tags": []}},
            {
                "$addFields": {
                    "_label_tags": {
                        "$cond": {
                            "if": {"$gt": ["$predictions", None]},
                            "then": {
                                "$concatArrays": [
                                    "$_label_tags",
                                    {
                                        "$reduce": {
                                            "input": "$predictions.detections",
                                            "initialValue": [],
                                            "in": {
                                                "$concatArrays": [
                                                    "$$value",
                                                    "$$this.tags",
                                                ],
                                            },
                                        },
                                    },
                                ],
                            },
                            "else": "$_label_tags",
                        },
                    },
                },
            },
            {
                "$addFields": {
                    "_label_tags": {
                        "$function": {
                            "body": "function(items) {let counts = {};items && items.forEach((i) => {counts[i] = 1 + (counts[i] || 0);});return counts;}",
                            "args": ["$_label_tags"],
                            "lang": "js",
                        },
                    },
                },
            },
        ]

        self.assertEqual(expected, returned)

    @drop_datasets
    def test_extended_view_image_label_filters_aggregations(self):
        filters = {
            "predictions.detections.label": {
                "values": ["carrot"],
                "exclude": False,
                "onlyMatch": True,
                "isMatching": False,
                "_CLS": "str",
            },
            "predictions.detections.confidence": {
                "range": [0.5, 1],
                "_CLS": "numeric",
                "exclude": False,
                "onlyMatch": True,
                "isMatching": False,
            },
        }

        dataset = fod.Dataset("test")
        dataset.add_sample_field(
            "predictions", fof.EmbeddedDocumentField, fol.Detections
        )

        returned = fosv.get_view(
            "test", filters=filters, count_label_tags=False
        )._pipeline()

        expected = [
            {
                "$match": {
                    "$and": [
                        {
                            "$and": [
                                {
                                    "predictions.detections.confidence": {
                                        "$gte": 0.5
                                    }
                                },
                                {
                                    "predictions.detections.confidence": {
                                        "$lte": 1
                                    }
                                },
                            ],
                        },
                        {"predictions.detections.label": {"$in": ["carrot"]}},
                    ],
                },
            },
            {
                "$set": {
                    "predictions.detections": {
                        "$filter": {
                            "input": "$predictions.detections",
                            "cond": {
                                "$or": [
                                    {
                                        "$and": [
                                            {
                                                "$gte": [
                                                    "$$this.confidence",
                                                    0.5,
                                                ]
                                            },
                                            {"$lte": ["$$this.confidence", 1]},
                                        ],
                                    },
                                    {"$in": ["$$this.confidence", []]},
                                ],
                            },
                        },
                    },
                },
            },
            {
                "$addFields": {
                    "predictions.detections": {
                        "$filter": {
                            "input": "$predictions.detections",
                            "cond": {"$in": ["$$this.label", ["carrot"]]},
                        },
                    },
                },
            },
        ]

        self.assertEqual(expected, returned)

    @drop_datasets
    def test_extended_view_video_label_filters_samples(self):
        filters = {
            "frames.detections.detections.index": {
                "range": [27, 54],
                "_CLS": "numeric",
                "exclude": False,
                "onlyMatch": True,
                "isMatching": False,
            },
            "frames.detections.detections.label": {
                "values": ["vehicle"],
                "exclude": False,
                "onlyMatch": True,
                "isMatching": False,
                "_CLS": "str",
            },
        }

        dataset = fod.Dataset("test")
        dataset.media_type = "video"
        dataset.add_frame_field(
            "detections", fof.EmbeddedDocumentField, fol.Detections
        )

        returned = fosv.get_view(
            "test",
            filters=filters,
            count_label_tags=True,
        )._pipeline()[1:]

        expected = [
            {
                "$match": {
                    "$and": [
                        {
                            "$and": [
                                {
                                    "frames.detections.detections.index": {
                                        "$gte": 27
                                    }
                                },
                                {
                                    "frames.detections.detections.index": {
                                        "$lte": 54
                                    }
                                },
                            ],
                        },
                        {
                            "frames.detections.detections.label": {
                                "$in": ["vehicle"]
                            }
                        },
                    ],
                },
            },
            {"$addFields": {"_label_tags": []}},
            {
                "$addFields": {
                    "_label_tags": {
                        "$concatArrays": [
                            "$_label_tags",
                            {
                                "$reduce": {
                                    "input": "$frames",
                                    "initialValue": [],
                                    "in": {
                                        "$concatArrays": [
                                            "$$value",
                                            {
                                                "$cond": {
                                                    "if": {
                                                        "$gt": [
                                                            "$$this.detections.detections",
                                                            None,
                                                        ],
                                                    },
                                                    "then": {
                                                        "$reduce": {
                                                            "input": "$$this.detections.detections",
                                                            "initialValue": [],
                                                            "in": {
                                                                "$concatArrays": [
                                                                    "$$value",
                                                                    "$$this.tags",
                                                                ],
                                                            },
                                                        },
                                                    },
                                                    "else": [],
                                                },
                                            },
                                        ],
                                    },
                                },
                            },
                        ],
                    },
                },
            },
            {
                "$addFields": {
                    "_label_tags": {
                        "$function": {
                            "body": "function(items) {let counts = {};items && items.forEach((i) => {counts[i] = 1 + (counts[i] || 0);});return counts;}",
                            "args": ["$_label_tags"],
                            "lang": "js",
                        },
                    },
                },
            },
        ]

        self.assertEqual(expected, returned)

    @drop_datasets
    def test_extended_view_video_label_filters_aggregations(self):
        filters = {
            "frames.detections.detections.index": {
                "range": [27, 54],
                "_CLS": "numeric",
                "exclude": False,
                "onlyMatch": True,
                "isMatching": False,
            },
            "frames.detections.detections.label": {
                "values": ["vehicle"],
                "exclude": False,
                "onlyMatch": True,
                "isMatching": False,
                "_CLS": "str",
            },
        }

        dataset = fod.Dataset("test")
        dataset.media_type = "video"
        dataset.add_frame_field(
            "detections", fof.EmbeddedDocumentField, fol.Detections
        )

        returned = fosv.get_view(
            "test", filters=filters, count_label_tags=False
        )._pipeline()[1:]

        expected = [
            {
                "$match": {
                    "$and": [
                        {
                            "$and": [
                                {
                                    "frames.detections.detections.index": {
                                        "$gte": 27
                                    }
                                },
                                {
                                    "frames.detections.detections.index": {
                                        "$lte": 54
                                    }
                                },
                            ],
                        },
                        {
                            "frames.detections.detections.label": {
                                "$in": ["vehicle"]
                            }
                        },
                    ],
                },
            },
            {
                "$set": {
                    "frames": {
                        "$map": {
                            "input": "$frames",
                            "as": "frame",
                            "in": {
                                "$mergeObjects": [
                                    "$$frame",
                                    {
                                        "detections": {
                                            "$mergeObjects": [
                                                "$$frame.detections",
                                                {
                                                    "detections": {
                                                        "$filter": {
                                                            "input": "$$frame.detections.detections",
                                                            "cond": {
                                                                "$or": [
                                                                    {
                                                                        "$and": [
                                                                            {
                                                                                "$gte": [
                                                                                    "$$this.index",
                                                                                    27,
                                                                                ],
                                                                            },
                                                                            {
                                                                                "$lte": [
                                                                                    "$$this.index",
                                                                                    54,
                                                                                ],
                                                                            },
                                                                        ],
                                                                    },
                                                                    {
                                                                        "$in": [
                                                                            "$$this.index",
                                                                            [],
                                                                        ],
                                                                    },
                                                                ],
                                                            },
                                                        },
                                                    },
                                                },
                                            ],
                                        },
                                    },
                                ],
                            },
                        },
                    },
                },
            },
            {
                "$addFields": {
                    "frames": {
                        "$map": {
                            "input": "$frames",
                            "as": "frame",
                            "in": {
                                "$mergeObjects": [
                                    "$$frame",
                                    {
                                        "detections": {
                                            "$mergeObjects": [
                                                "$$frame.detections",
                                                {
                                                    "detections": {
                                                        "$filter": {
                                                            "input": "$$frame.detections.detections",
                                                            "cond": {
                                                                "$in": [
                                                                    "$$this.label",
                                                                    [
                                                                        "vehicle"
                                                                    ],
                                                                ],
                                                            },
                                                        },
                                                    },
                                                },
                                            ],
                                        },
                                    },
                                ],
                            },
                        },
                    },
                },
            },
        ]

        self.assertEqual(expected, returned)

    @drop_datasets
    def test_extended_view_video_match_label_tags_aggregations(self):
        filters = {
            "_label_tags": {
                "values": ["one"],
                "exclude": False,
                "isMatching": True,
            }
        }

        dataset = fod.Dataset("test")
        dataset.media_type = "video"
        dataset.add_frame_field(
            "detections", fof.EmbeddedDocumentField, fol.Detections
        )

        returned = fosv.get_view(
            "test", filters=filters, count_label_tags=True
        )._pipeline()[1:]

        expected = [
            {
                "$match": {
                    "$or": [
                        {"frames.detections.detections.tags": {"$in": ["one"]}}
                    ],
                },
            },
            {"$addFields": {"_label_tags": []}},
            {
                "$addFields": {
                    "_label_tags": {
                        "$concatArrays": [
                            "$_label_tags",
                            {
                                "$reduce": {
                                    "input": "$frames",
                                    "initialValue": [],
                                    "in": {
                                        "$concatArrays": [
                                            "$$value",
                                            {
                                                "$cond": {
                                                    "if": {
                                                        "$gt": [
                                                            "$$this.detections.detections",
                                                            None,
                                                        ],
                                                    },
                                                    "then": {
                                                        "$reduce": {
                                                            "input": "$$this.detections.detections",
                                                            "initialValue": [],
                                                            "in": {
                                                                "$concatArrays": [
                                                                    "$$value",
                                                                    "$$this.tags",
                                                                ],
                                                            },
                                                        },
                                                    },
                                                    "else": [],
                                                },
                                            },
                                        ],
                                    },
                                },
                            },
                        ],
                    },
                },
            },
            {
                "$addFields": {
                    "_label_tags": {
                        "$function": {
                            "body": "function(items) {let counts = {};items && items.forEach((i) => {counts[i] = 1 + (counts[i] || 0);});return counts;}",
                            "args": ["$_label_tags"],
                            "lang": "js",
                        },
                    },
                },
            },
        ]

        self.assertEqual(expected, returned)

    @drop_datasets
    def test_extended_view_video_match_label_tags_samples(self):
        filters = {
            "_label_tags": {
                "values": ["one"],
                "exclude": False,
                "isMatching": False,
            }
        }

        dataset = fod.Dataset("test")
        dataset.media_type = "video"
        dataset.add_frame_field(
            "detections", fof.EmbeddedDocumentField, fol.Detections
        )

        returned = fosv.get_view(
            "test", filters=filters, count_label_tags=False
        )._pipeline()[1:]

        expected = [
            {
                "$match": {
                    "$or": [
                        {"frames.detections.detections.tags": {"$in": ["one"]}}
                    ],
                },
            },
            {
                "$set": {
                    "frames": {
                        "$map": {
                            "input": "$frames",
                            "as": "frame",
                            "in": {
                                "$mergeObjects": [
                                    "$$frame",
                                    {
                                        "detections": {
                                            "$mergeObjects": [
                                                "$$frame.detections",
                                                {
                                                    "detections": {
                                                        "$filter": {
                                                            "input": "$$frame.detections.detections",
                                                            "cond": {
                                                                "$cond": {
                                                                    "if": {
                                                                        "$gt": [
                                                                            "$$this.tags",
                                                                            None,
                                                                        ],
                                                                    },
                                                                    "then": {
                                                                        "$in": [
                                                                            "one",
                                                                            "$$this.tags",
                                                                        ],
                                                                    },
                                                                    "else": False,
                                                                },
                                                            },
                                                        },
                                                    },
                                                },
                                            ],
                                        },
                                    },
                                ],
                            },
                        },
                    },
                },
            },
            {
                "$match": {
                    "$expr": {
                        "$gt": [
                            {
                                "$reduce": {
                                    "input": "$frames",
                                    "initialValue": 0,
                                    "in": {
                                        "$add": [
                                            "$$value",
                                            {
                                                "$size": {
                                                    "$ifNull": [
                                                        "$$this.detections.detections",
                                                        [],
                                                    ],
                                                },
                                            },
                                        ],
                                    },
                                },
                            },
                            0,
                        ],
                    },
                },
            },
        ]

        self.assertEqual(expected, returned)
