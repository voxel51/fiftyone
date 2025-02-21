"""
FiftyOne Server samples tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

import fiftyone as fo
from fiftyone.server.samples import get_samples_pipeline

from decorators import drop_async_dataset


class ServerSamplesTests(unittest.IsolatedAsyncioTestCase):
    @drop_async_dataset
    async def test_frames(self, dataset: fo.Dataset):
        video = fo.Sample(
            filepath="video.mp4",
            label=fo.Classification(label="label"),
        )
        video[1]["label"] = fo.Classification(label="one")
        video[2]["label"] = fo.Classification(label="two")
        dataset.add_sample(video)

        # test no filters
        pipeline = await get_samples_pipeline(
            dataset.name, dataset, {}, None, []
        )
        self.assertEqual(
            pipeline,
            _get_lookup_pipeline(dataset, True) + _get_slice_frames_pipeline(),
        )

        # test sample-level filters
        pipeline = await get_samples_pipeline(
            dataset.name, dataset, {"id": {}, "filepath": {}}, None, []
        )
        self.assertEqual(
            pipeline,
            _get_lookup_pipeline(dataset, True) + _get_slice_frames_pipeline(),
        )

        # test frames-level filters (full frame filtering)
        pipeline = await get_samples_pipeline(
            dataset.name, dataset, {"frames.label": {}}, None, []
        )
        self.assertEqual(
            pipeline,
            _get_lookup_pipeline(dataset, False)
            + _get_slice_frames_pipeline(),
        )


def _get_lookup_pipeline(dataset: fo.Dataset, limit=False):
    lookup_pipeline = [
        {"$match": {"$expr": {"$eq": ["$$sample_id", "$_sample_id"]}}},
        {"$sort": {"frame_number": 1}},
    ]

    if limit:
        lookup_pipeline.append({"$limit": 1})

    return [
        {
            "$lookup": {
                "from": dataset._frame_collection_name,
                "let": {"sample_id": "$_id"},
                "pipeline": lookup_pipeline,
                "as": "frames",
            },
        },
    ]


def _get_slice_frames_pipeline():
    return [
        {"$addFields": {"frames": {"$slice": ["$frames", 1]}}},
    ]
