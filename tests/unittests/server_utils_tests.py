"""
FiftyOne Server utils tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

import strawberry as gql
from strawberry.schema.config import StrawberryConfig

import fiftyone as fo

from fiftyone.server.utils import attach_frame_if_necessary
from fiftyone.server.query import Dataset

from decorators import drop_datasets


class TestServerUtils(unittest.TestCase):
    @drop_datasets
    def test_attach_frame_if_necessary(self):

        image = fo.Dataset()
        image.add_sample(fo.Sample(filepath="image.png"))

        ### IMAGE
        view, is_video = attach_frame_if_necessary(image.view(), 1, False)
        self.assertEqual(is_video, False)
        self.assertEqual(view._serialize(), [])

        video_group = fo.Dataset("video-group")
        group = fo.Group()
        video_group.add_sample(
            fo.Sample(filepath="video.mp4", group=group.element("video"))
        )

        ### VIDEO slice(s)
        view, is_video = attach_frame_if_necessary(
            video_group.select_group_slices(media_type="video"), 1, False
        )
        serialized = view._serialize(include_uuids=False)
        self.assertEqual(is_video, True)
        self.assertEqual(
            serialized,
            [
                {
                    "_cls": "fiftyone.core.stages.SelectGroupSlices",
                    "kwargs": [
                        ["slices", None],
                        ["media_type", "video"],
                        ["flat", True],
                        ["_allow_mixed", False],
                        ["_force_mixed", False],
                    ],
                },
                {
                    "_cls": "fiftyone.core.stages.SetField",
                    "kwargs": [
                        ["field", "frames"],
                        [
                            "expr",
                            {
                                "$cond": {
                                    "if": {
                                        "$eq": [{"$toString": "$_id"}, False]
                                    },
                                    "then": {
                                        "$filter": {
                                            "input": "$frames",
                                            "as": "this",
                                            "cond": {
                                                "$in": [
                                                    "$$this.frame_number",
                                                    [1, 1],
                                                ]
                                            },
                                        },
                                    },
                                    "else": {
                                        "$filter": {
                                            "input": "$frames",
                                            "as": "this",
                                            "cond": {
                                                "$eq": [
                                                    "$$this.frame_number",
                                                    1,
                                                ]
                                            },
                                        },
                                    },
                                },
                            },
                        ],
                        ["_allow_missing", False],
                    ],
                },
            ],
        )

        ### MIXED
        view, is_video = attach_frame_if_necessary(
            video_group.select_group_slices(_allow_mixed=True), 1, False
        )
        serialized = view._serialize(include_uuids=False)
        self.assertEqual(is_video, True)
        self.assertEqual(
            serialized,
            [
                {
                    "_cls": "fiftyone.core.stages.SelectGroupSlices",
                    "kwargs": [
                        ["slices", None],
                        ["media_type", None],
                        ["flat", True],
                        ["_allow_mixed", True],
                        ["_force_mixed", False],
                    ],
                },
                {
                    "_cls": "fiftyone.core.stages.SetField",
                    "kwargs": [
                        ["field", "frames"],
                        [
                            "expr",
                            {
                                "$cond": {
                                    "if": {
                                        "$eq": [{"$toString": "$_id"}, False]
                                    },
                                    "then": {
                                        "$filter": {
                                            "input": "$frames",
                                            "as": "this",
                                            "cond": {
                                                "$in": [
                                                    "$$this.frame_number",
                                                    [1, 1],
                                                ]
                                            },
                                        },
                                    },
                                    "else": {
                                        "$filter": {
                                            "input": "$frames",
                                            "as": "this",
                                            "cond": {
                                                "$eq": [
                                                    "$$this.frame_number",
                                                    1,
                                                ]
                                            },
                                        },
                                    },
                                },
                            },
                        ],
                        ["_allow_missing", False],
                    ],
                },
            ],
        )
