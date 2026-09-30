"""
FiftyOne Server samples tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest
from unittest.mock import AsyncMock, Mock, patch

import fiftyone as fo
import fiftyone.core.frame_pipelines as fofp
import fiftyone.core.media as fom
import fiftyone.core.odm as foo
from fiftyone.server.samples import (
    UnknownSample,
    _create_sample_item,
    get_samples_pipeline,
)
import fiftyone.server.view as fosv

from decorators import drop_async_dataset

F = fo.ViewField


class ServerSamplesTests(unittest.IsolatedAsyncioTestCase):
    async def test_multimodal_grid_skips_metadata_read(self):
        collection = Mock(media_type=fom.MULTIMODAL)
        sample = {"_id": "sample-id", "filepath": "scene.mcap"}
        urls = [{"field": "filepath", "url": "media-url"}]

        with patch(
            "fiftyone.server.metadata._create_media_urls",
            return_value=("scene.mcap", urls[0]["url"], urls),
        ) as create_urls, patch(
            "fiftyone.server.metadata.read_metadata",
            new=AsyncMock(side_effect=AssertionError("unexpected read")),
        ) as read_metadata:
            node = await _create_sample_item(
                collection,
                sample,
                {},
                {},
                pagination_data=True,
                additional_media_fields=(None, None, []),
            )

        create_urls.assert_called_once()
        read_metadata.assert_not_awaited()
        self.assertIsInstance(node, UnknownSample)
        self.assertEqual(node.id, "sample-id")
        self.assertEqual(node.aspect_ratio, 1)
        self.assertEqual(node.urls[0].field, "filepath")
        self.assertEqual(node.urls[0].url, urls[0]["url"])

    async def test_multimodal_modal_reads_metadata(self):
        collection = Mock(media_type=fom.MULTIMODAL)
        sample = {"_id": "sample-id", "filepath": "scene.mcap"}
        urls = [{"field": "filepath", "url": "media-url"}]

        with patch(
            "fiftyone.server.metadata._create_media_urls",
            return_value=("scene.mcap", urls[0]["url"], urls),
        ), patch(
            "fiftyone.server.metadata.read_metadata",
            new=AsyncMock(return_value={"aspect_ratio": 2}),
        ) as read_metadata:
            node = await _create_sample_item(
                collection,
                sample,
                {},
                {},
                pagination_data=False,
                additional_media_fields=(None, None, []),
            )

        read_metadata.assert_awaited_once()
        self.assertEqual(node.id, "sample-id-modal")
        self.assertEqual(node.aspect_ratio, 2)
        self.assertEqual(node.urls[0].url, urls[0]["url"])

    async def test_unknown_grid_reads_metadata(self):
        collection = Mock(media_type=fom.UNKNOWN)
        sample = {"_id": "sample-id", "filepath": "scene.bin"}

        with patch(
            "fiftyone.server.metadata._create_media_urls",
            return_value=("scene.bin", "media-url", []),
        ), patch(
            "fiftyone.server.metadata.read_metadata",
            new=AsyncMock(return_value={"aspect_ratio": 3}),
        ) as read_metadata:
            node = await _create_sample_item(
                collection,
                sample,
                {},
                {},
                pagination_data=True,
                additional_media_fields=(None, None, []),
            )

        read_metadata.assert_awaited_once()
        self.assertIsInstance(node, UnknownSample)
        self.assertEqual(node.aspect_ratio, 3)

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

        # test select fields and set field, which frame-first pipelines
        # otherwise handle
        with fofp._disabled():
            self.assertEqual(
                await _resolve_lookup_stage(
                    dataset.select_fields("frames.labels")
                ),
                limited_lookup,
            )

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

        # test match frames field expression
        self.assertEqual(
            await _resolve_lookup_stage(
                dataset.match(F("frames.filepath") == "frame.png"),
            ),
            full_lookup,
        )

        # frame-first pipelines otherwise handle these
        with fofp._disabled():
            # test match frames field
            self.assertEqual(
                await _resolve_lookup_stage(
                    dataset.match({"frames.filepath": "frame.png"}),
                ),
                full_lookup,
            )

            # test filter frame labels
            self.assertEqual(
                await _resolve_lookup_stage(
                    dataset.filter_labels(
                        "frames.labels", F("label") == "label"
                    ),
                ),
                full_lookup,
            )

    @drop_async_dataset
    async def test_frame_first_grid_pipeline(self, dataset: fo.Dataset):
        video = fo.Sample(filepath="video.mp4")
        for frame_number in range(1, 201):
            video[frame_number]["detections"] = fo.Detections(
                detections=[
                    fo.Detection(
                        label="person" if frame_number > 150 else "car",
                        confidence=i / 5,
                    )
                    for i in range(5)
                ]
            )
        other = fo.Sample(filepath="other.mp4")
        other[1]["detections"] = fo.Detections(
            detections=[fo.Detection(label="car")]
        )
        dataset.add_samples([video, other])

        filters = {
            "frames.detections.detections.label": {
                "values": ["person"],
                "exclude": False,
                "isMatching": False,
            }
        }
        view = fosv.get_view(dataset.name, filters=filters)
        self.assertEqual(
            [type(s).__name__ for s in view._stages], ["Match", "FilterLabels"]
        )

        pipeline = await get_samples_pipeline(view, None)
        with fofp._disabled():
            old_pipeline = await get_samples_pipeline(view, None)

        # The sample-first grid attaches every frame, then maps over them
        [old_lookup] = _frame_lookups(dataset, old_pipeline)
        self.assertNotIn({"$limit": 1}, old_lookup["pipeline"])
        self.assertTrue(fofp._contains(old_pipeline, "$frames"))

        # The frame-first grid checks for a matching frame and attaches only
        # the first filtered frame
        lookups = _frame_lookups(dataset, pipeline)
        self.assertEqual(len(lookups), 3)
        for lookup in lookups:
            self.assertIn({"$limit": 1}, lookup["pipeline"])
        self.assertEqual(lookups[-1]["as"], "frames")

        # Only the grid's trailing `$slice` reads the attached frames
        self.assertFalse(fofp._contains(pipeline[:-1], "$frames"))

        collection = foo.get_async_db_conn()[dataset._sample_collection_name]
        docs = await foo.aggregate(collection, pipeline).to_list(None)
        old_docs = await foo.aggregate(collection, old_pipeline).to_list(None)
        self.assertEqual(docs, old_docs)
        self.assertEqual(len(docs), 1)
        [frame] = docs[0]["frames"]
        self.assertEqual(frame["frame_number"], 1)
        self.assertEqual(frame["detections"]["detections"], [])
        self.assertEqual(view.count(), 1)


def _frame_lookups(dataset, pipeline):
    return [
        stage["$lookup"]
        for stage in pipeline
        if "$lookup" in stage
        and stage["$lookup"]["from"] == dataset._frame_collection_name
    ]


async def _resolve_lookup_stage(view: fo.DatasetView):
    pipeline = await get_samples_pipeline(view, None)
    for stage in pipeline:
        if "$lookup" in stage:
            return stage


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
