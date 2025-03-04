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


F = fo.ViewField


class ServerSamplesTests(unittest.IsolatedAsyncioTestCase):
    @drop_async_dataset
    async def test_limited_frames_lookup(self, dataset: fo.Dataset):
        video = _add_video_sample(dataset)
        limited_lookup = _get_expected_lookup_stage(dataset, limit=True)

        # test no filters
        self.assertEqual(await _resolve_lookup_stage(dataset), limited_lookup)

        # test sample-level filters
        self.assertEqual(
            await _resolve_lookup_stage(
                dataset.match({"filepath": "video.mp4"})
            ),
            limited_lookup,
        )

        # test sample-level label filters
        self.assertEqual(
            await _resolve_lookup_stage(
                dataset.filter_labels("labels", F("label") == "label")
            ),
            limited_lookup,
        )

        # test clips
        self.assertEqual(
            await _resolve_lookup_stage(
                dataset.to_clips("frames.labels"),
            ),
            _get_expected_lookup_stage(dataset, clips=True, limit=True),
        )

        # test select
        self.assertEqual(
            await _resolve_lookup_stage(dataset.select(video.id)),
            limited_lookup,
        )

        # test select fields
        self.assertEqual(
            await _resolve_lookup_stage(
                dataset.select_fields("frames.labels")
            ),
            limited_lookup,
        )

        # test set field
        self.assertEqual(
            await _resolve_lookup_stage(
                dataset.add_stage(
                    fo.SetField("frames.labels", None, _allow_limit=True)
                )
            ),
            limited_lookup,
        )

    @drop_async_dataset
    async def test_full_frames_lookup(self, dataset: fo.Dataset):
        _add_video_sample(dataset)
        full_lookup = _get_expected_lookup_stage(dataset, limit=False)

        # test match frames field
        self.assertEqual(
            await _resolve_lookup_stage(
                dataset.match({"frames.filepath": "frame.png"}),
            ),
            full_lookup,
        )

        # test match frames field expression
        self.assertEqual(
            await _resolve_lookup_stage(
                dataset.match(F("frames.filepath") == "frame.png"),
            ),
            full_lookup,
        )

        # test filter frame labels
        self.assertEqual(
            await _resolve_lookup_stage(
                dataset.filter_labels("frames.labels", F("label") == "label"),
            ),
            full_lookup,
        )


async def _resolve_lookup_stage(view: fo.DatasetView):
    pipeline = await get_samples_pipeline(view, None)
    return pipeline[0]


def _get_expected_lookup_stage(view: fo.DatasetView, clips=False, limit=False):
    if clips:
        match = {
            "$and": [
                {"$eq": ["$$sample_id", "$_sample_id"]},
                {"$gte": ["$frame_number", "$$first"]},
                {"$lte": ["$frame_number", "$$last"]},
            ],
        }
    else:
        match = {"$eq": ["$$sample_id", "$_sample_id"]}

    lookup_pipeline = [
        {"$match": {"$expr": match}},
        {"$sort": {"frame_number": 1}},
    ]

    if limit:
        lookup_pipeline.append({"$limit": 1})

    if clips:
        let = {
            "sample_id": "$_sample_id",
            "first": {"$arrayElemAt": ["$support", 0]},
            "last": {"$arrayElemAt": ["$support", 1]},
        }
    else:
        let = {"sample_id": "$_id"}

    return {
        "$lookup": {
            "from": view._frame_collection_name,
            "let": let,
            "pipeline": lookup_pipeline,
            "as": "frames",
        },
    }


def _add_video_sample(dataset: fo.Dataset):
    video = fo.Sample(
        filepath="video.mp4",
        labels=fo.Detections(detections=[fo.Detection(label="label")]),
    )
    video[1]["labels"] = fo.Detections(
        detections=[fo.Detection(label="label")]
    )
    dataset.add_sample(video)
    return video
